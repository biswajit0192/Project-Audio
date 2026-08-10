use tauri::{AppHandle, Emitter};
use std::sync::{Arc, Mutex};
use std::thread;

use windows::core::{implement, Result as WindowsResult, PCWSTR};
use windows::Win32::Media::Audio::Endpoints::{
    IAudioEndpointVolume, IAudioEndpointVolumeCallback, IAudioEndpointVolumeCallback_Impl,
};
use windows::Win32::Media::Audio::{
    eMultimedia, eRender, IMMDeviceEnumerator, MMDeviceEnumerator, AUDIO_VOLUME_NOTIFICATION_DATA,
    IMMNotificationClient, IMMNotificationClient_Impl, EDataFlow, ERole, DEVICE_STATE, DEVICE_STATE_ACTIVE
};
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::System::Com::STGM_READ;
use windows::Win32::UI::Shell::PropertiesSystem::PROPERTYKEY;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
};

use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::WindowsAndMessaging::{
    GetMessageW, TranslateMessage, DispatchMessageW, PostThreadMessageW, MSG, WM_HOTKEY
};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, UnregisterHotKey, VK_VOLUME_UP, VK_VOLUME_DOWN, HOT_KEY_MODIFIERS
};
use windows::Win32::Foundation::{HWND, WPARAM, LPARAM};

const WM_RECONNECT_DEVICE: u32 = 1025; // WM_USER + 1

pub struct EndpointVolumeWrapper(pub IAudioEndpointVolume);
unsafe impl Send for EndpointVolumeWrapper {}
unsafe impl Sync for EndpointVolumeWrapper {}

#[allow(dead_code)]
pub struct EndpointCallbackWrapper(pub IAudioEndpointVolumeCallback);
unsafe impl Send for EndpointCallbackWrapper {}
unsafe impl Sync for EndpointCallbackWrapper {}

#[allow(dead_code)]
pub struct NotificationClientWrapper(pub IMMNotificationClient);
unsafe impl Send for NotificationClientWrapper {}
unsafe impl Sync for NotificationClientWrapper {}

pub struct EnumeratorWrapper(pub IMMDeviceEnumerator);
unsafe impl Send for EnumeratorWrapper {}
unsafe impl Sync for EnumeratorWrapper {}

pub struct VolumeContext {
    pub endpoint_volume: Option<EndpointVolumeWrapper>,
    pub callback: Option<EndpointCallbackWrapper>,
    pub enumerator: Option<EnumeratorWrapper>,
    pub notification_client: Option<NotificationClientWrapper>,
    pub thread_id: Option<u32>,
    pub active_device_id: Option<String>,
}

pub struct VolumeState {
    pub context: Arc<Mutex<VolumeContext>>,
}

#[implement(windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolumeCallback)]
struct VolumeCallback {
    app_handle: AppHandle,
}

impl IAudioEndpointVolumeCallback_Impl for VolumeCallback_Impl {
    fn OnNotify(&self, pnotify: *mut AUDIO_VOLUME_NOTIFICATION_DATA) -> WindowsResult<()> {
        unsafe {
            if let Some(notify) = pnotify.as_ref() {
                let scalar = notify.fMasterVolume;
                let _ = self.app_handle.emit("os-volume-changed", scalar);
            }
        }
        Ok(())
    }
}

#[implement(windows::Win32::Media::Audio::IMMNotificationClient)]
struct DeviceNotificationClient {
    context_arc: Arc<Mutex<VolumeContext>>,
    app_handle: AppHandle,
}

impl IMMNotificationClient_Impl for DeviceNotificationClient_Impl {
    fn OnDeviceStateChanged(&self, _pwstrdeviceid: &PCWSTR, _dwnewstate: DEVICE_STATE) -> WindowsResult<()> {
        let _ = self.app_handle.emit("audio-devices-changed", ());
        Ok(())
    }
    
    fn OnDeviceAdded(&self, _pwstrdeviceid: &PCWSTR) -> WindowsResult<()> {
        let _ = self.app_handle.emit("audio-devices-changed", ());
        Ok(())
    }
    
    fn OnDeviceRemoved(&self, _pwstrdeviceid: &PCWSTR) -> WindowsResult<()> {
        let _ = self.app_handle.emit("audio-devices-changed", ());
        Ok(())
    }
    
    fn OnPropertyValueChanged(&self, _pwstrdeviceid: &PCWSTR, _key: &PROPERTYKEY) -> WindowsResult<()> {
        Ok(())
    }
    
    fn OnDefaultDeviceChanged(&self, flow: EDataFlow, role: ERole, _pwstrdefaultdeviceid: &PCWSTR) -> WindowsResult<()> {
        if flow == eRender && role == eMultimedia {
            println!("Default multimedia device changed! Queuing reconnect to background thread...");
            
            let thread_id = {
                if let Ok(ctx) = self.context_arc.lock() {
                    ctx.thread_id
                } else {
                    None
                }
            };
            
            if let Some(tid) = thread_id {
                unsafe {
                    let _ = PostThreadMessageW(
                        tid,
                        WM_RECONNECT_DEVICE,
                        WPARAM(0),
                        LPARAM(0),
                    );
                }
            }
        }
        Ok(())
    }
}

pub fn setup_volume_listener(app_handle: AppHandle) -> std::result::Result<VolumeState, String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        
        let enumerator: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
            .map_err(|e| format!("Failed to create enumerator: {}", e))?;
            
        let context = Arc::new(Mutex::new(VolumeContext {
            endpoint_volume: None,
            callback: None,
            enumerator: Some(EnumeratorWrapper(enumerator.clone())),
            notification_client: None,
            thread_id: None,
            active_device_id: None,
        }));
        
        // Initial setup
        if let Ok(device) = enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
            if let Ok(endpoint_volume) = device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None) {
                let callback_impl = VolumeCallback { app_handle: app_handle.clone() };
                let callback: IAudioEndpointVolumeCallback = callback_impl.into();
                
                if endpoint_volume.RegisterControlChangeNotify(&callback).is_ok() {
                    let mut ctx = context.lock().unwrap();
                    ctx.endpoint_volume = Some(EndpointVolumeWrapper(endpoint_volume));
                    ctx.callback = Some(EndpointCallbackWrapper(callback));
                    if let Ok(id_pwstr) = device.GetId() {
                        ctx.active_device_id = Some(id_pwstr.to_string().unwrap_or_default());
                    }
                }
            }
        }
        
        // Register Notification Client
        let notif_client_impl = DeviceNotificationClient { 
            context_arc: context.clone(),
            app_handle: app_handle.clone(),
        };
        let notif_client: IMMNotificationClient = notif_client_impl.into();
        
        if enumerator.RegisterEndpointNotificationCallback(&notif_client).is_ok() {
            let mut ctx = context.lock().unwrap();
            ctx.notification_client = Some(NotificationClientWrapper(notif_client));
        }

        // Single background thread for hotkeys and volume processing
        let thread_context = context.clone();
        let thread_app_handle = app_handle.clone();
        
        thread::spawn(move || {
            println!("Initializing Thread-Level Hotkeys...");
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            
            // Register hotkeys on this thread's message queue without MOD_NOREPEAT to allow holding
            let hwnd = HWND::default();
            let up_registered = RegisterHotKey(hwnd, 1001, HOT_KEY_MODIFIERS(0), VK_VOLUME_UP.0 as u32);
            let down_registered = RegisterHotKey(hwnd, 1002, HOT_KEY_MODIFIERS(0), VK_VOLUME_DOWN.0 as u32);
            
            if up_registered.is_ok() && down_registered.is_ok() {
                println!("Volume Hotkeys perfectly registered on thread!");
            } else {
                eprintln!("CRITICAL ERROR: Failed to register hotkeys. They might be in use by another app.");
            }

            // Save thread ID so the notification client can post messages here
            let thread_id = GetCurrentThreadId();
            if let Ok(mut ctx) = thread_context.lock() {
                ctx.thread_id = Some(thread_id);
            }

            let mut msg = MSG::default();
            // GetMessageW blocks until a message arrives for this thread
            while GetMessageW(&mut msg, hwnd, 0, 0).0 > 0 {
                if msg.message == WM_RECONNECT_DEVICE {
                    println!("Reconnecting volume hooks on safe background thread...");
                    if let Ok(mut ctx) = thread_context.lock() {
                        // Clean up old callback before dropping endpoint
                        if let (Some(ep), Some(cb)) = (ctx.endpoint_volume.as_ref(), ctx.callback.as_ref()) {
                            let _ = ep.0.UnregisterControlChangeNotify(&cb.0);
                        }
                        
                        ctx.callback = None;
                        ctx.endpoint_volume = None;
                        
                        if let Some(enumerator_wrapper) = ctx.enumerator.as_ref() {
                            if let Ok(device) = enumerator_wrapper.0.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                                if let Ok(endpoint_volume) = device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None) {
                                    
                                    let callback_impl = VolumeCallback { app_handle: thread_app_handle.clone() };
                                    let callback: IAudioEndpointVolumeCallback = callback_impl.into();
                                    
                                    if endpoint_volume.RegisterControlChangeNotify(&callback).is_ok() {
                                        // Instantly fetch new scalar and emit to UI
                                        if let Ok(scalar) = endpoint_volume.GetMasterVolumeLevelScalar() {
                                            let _ = thread_app_handle.emit("os-volume-changed", scalar);
                                        }
                                        
                                        ctx.endpoint_volume = Some(EndpointVolumeWrapper(endpoint_volume));
                                        ctx.callback = Some(EndpointCallbackWrapper(callback));
                                        if let Ok(id_pwstr) = device.GetId() {
                                            ctx.active_device_id = Some(id_pwstr.to_string().unwrap_or_default());
                                        }
                                        println!("Successfully re-hooked to new default device!");
                                    }
                                }
                            }
                        }
                    }
                } else if msg.message == WM_HOTKEY {
                    let id = msg.wParam.0 as i32;
                    if id == 1001 || id == 1002 {
                        if let Ok(ctx) = thread_context.lock() {
                            if let Some(wrapper) = ctx.endpoint_volume.as_ref() {
                                if let Ok(scalar) = wrapper.0.GetMasterVolumeLevelScalar() {
                                    let current_ui_db = if scalar <= 0.0001 {
                                        -64.0_f32
                                    } else {
                                        20.0_f32 * scalar.log10()
                                    };

                                    let mut new_ui_db = if id == 1001 {
                                        current_ui_db + 1.0_f32
                                    } else {
                                        current_ui_db - 1.0_f32
                                    };
                                    
                                    new_ui_db = new_ui_db.clamp(-64.0_f32, 0.0_f32);
                                    
                                    if id == 1001 {
                                        println!(">>> Volume Up Hotkey: {} dB", new_ui_db);
                                    } else {
                                        println!(">>> Volume Down Hotkey: {} dB", new_ui_db);
                                    }
                                    
                                    let new_scalar = if new_ui_db <= -64.0_f32 {
                                        0.0_f32
                                    } else {
                                        10_f32.powf(new_ui_db / 20.0_f32)
                                    };
                                    
                                    let _ = wrapper.0.SetMasterVolumeLevelScalar(new_scalar, std::ptr::null());
                                }
                            }
                        }
                    }
                }
                
                let _ = TranslateMessage(&msg);
                let _ = DispatchMessageW(&msg);
            }
            
            println!("Hotkey message loop terminated. Unregistering...");
            let _ = UnregisterHotKey(hwnd, 1001);
            let _ = UnregisterHotKey(hwnd, 1002);
        });
            
        Ok(VolumeState {
            context,
        })
    }
}

#[tauri::command]
pub fn set_system_volume(scalar: f32, state: tauri::State<'_, VolumeState>) -> Result<String, String> {
    if let Ok(ctx) = state.context.lock() {
        if let Some(wrapper) = ctx.endpoint_volume.as_ref() {
            unsafe {
                let clamped = scalar.clamp(0.0_f32, 1.0_f32);
                wrapper.0.SetMasterVolumeLevelScalar(clamped, std::ptr::null())
                    .map_err(|e| format!("Failed to set volume: {}", e))?;
            }
            return Ok("Volume set successfully".into());
        }
    }
    Err("Endpoint volume not initialized".into())
}

#[tauri::command]
pub fn get_system_volume(state: tauri::State<'_, VolumeState>) -> Result<f32, String> {
    if let Ok(ctx) = state.context.lock() {
        if let Some(wrapper) = ctx.endpoint_volume.as_ref() {
            unsafe {
                if let Ok(scalar) = wrapper.0.GetMasterVolumeLevelScalar() {
                    return Ok(scalar);
                }
            }
        }
    }
    Err("Endpoint volume not initialized".into())
}

#[derive(serde::Serialize)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[tauri::command]
pub fn get_audio_devices(state: tauri::State<'_, VolumeState>) -> Result<Vec<AudioDevice>, String> {
    let mut devices = Vec::new();
    if let Ok(ctx) = state.context.lock() {
        if let Some(enumerator_wrapper) = ctx.enumerator.as_ref() {
            unsafe {
                let enumerator = &enumerator_wrapper.0;
                
                let active_id = ctx.active_device_id.clone().unwrap_or_default();
                
                if let Ok(collection) = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE) {
                    if let Ok(count) = collection.GetCount() {
                        for i in 0..count {
                            if let Ok(device) = collection.Item(i) {
                                let mut id_str = String::new();
                                if let Ok(id_pwstr) = device.GetId() {
                                    id_str = id_pwstr.to_string().unwrap_or_default();
                                }
                                
                                let mut name_str = String::new();
                                if let Ok(store) = device.OpenPropertyStore(STGM_READ) {
                                    if let Ok(prop) = store.GetValue(&PKEY_Device_FriendlyName) {
                                        let prop_string = prop.to_string();
                                        if !prop_string.is_empty() {
                                            name_str = prop_string;
                                        }
                                        // PROPVARIANT automatically calls PropVariantClear on Drop
                                    }
                                }
                                
                                devices.push(AudioDevice {
                                    id: id_str.clone(),
                                    name: if name_str.is_empty() { "Unknown Device".into() } else { name_str },
                                    is_default: id_str == active_id && !id_str.is_empty(),
                                });
                            }
                        }
                    }
                }
            }
        } else {
            return Err("Enumerator not initialized".into());
        }
    } else {
        return Err("Failed to lock volume context".into());
    }
    
    Ok(devices)
}

#[derive(serde::Serialize)]
pub struct AudioDeviceInfo {
    pub hardware_name: String,
    pub nickname: Option<String>,
}

#[tauri::command]
pub fn get_current_audio_device(state: tauri::State<'_, VolumeState>, app: tauri::AppHandle) -> Result<Option<AudioDeviceInfo>, String> {
    if let Ok(devices) = get_audio_devices(state) {
        if let Some(default_device) = devices.into_iter().find(|d| d.is_default) {
            let name_lower = default_device.name.to_lowercase();
            // Identify built-in laptop speakers
            if name_lower.contains("realtek") || 
               name_lower.contains("high definition audio") || 
               name_lower.contains("speaker") ||
               name_lower.contains("built-in") {
                return Ok(None);
            } else {
                let hardware_name = default_device.name;
                let mut nickname = None;
                
                let db_path = crate::db::get_db_path(&app);
                if let Ok(conn) = rusqlite::Connection::open(&db_path) {
                    if let Ok(nick) = conn.query_row(
                        "SELECT nickname FROM device_nicknames WHERE hardware_name = ?1",
                        rusqlite::params![hardware_name],
                        |row| row.get::<_, String>(0)
                    ) {
                        nickname = Some(nick);
                    }
                }

                return Ok(Some(AudioDeviceInfo {
                    hardware_name,
                    nickname,
                }));
            }
        }
    }
    Ok(None)
}

#[tauri::command]
pub fn switch_audio_device(
    device_id: String,
    state: tauri::State<'_, VolumeState>,
    audio_state: tauri::State<'_, crate::AudioState>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    if let Ok(mut ctx) = state.context.lock() {
        if let Some(enumerator_wrapper) = ctx.enumerator.as_ref() {
            unsafe {
                use std::os::windows::ffi::OsStrExt;
                let wide_id: Vec<u16> = std::ffi::OsStr::new(&device_id).encode_wide().chain(std::iter::once(0)).collect();
                let pcwstr = windows::core::PCWSTR(wide_id.as_ptr());
                
                if let Ok(device) = enumerator_wrapper.0.GetDevice(pcwstr) {
                    if let Ok(endpoint_volume) = device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None) {
                        // Unregister old callback
                        if let (Some(ep), Some(cb)) = (ctx.endpoint_volume.as_ref(), ctx.callback.as_ref()) {
                            let _ = ep.0.UnregisterControlChangeNotify(&cb.0);
                        }
                        
                        let callback_impl = VolumeCallback { app_handle: app_handle.clone() };
                        let callback: IAudioEndpointVolumeCallback = callback_impl.into();
                        
                        if endpoint_volume.RegisterControlChangeNotify(&callback).is_ok() {
                            // Fetch scalar and emit instantly
                            if let Ok(scalar) = endpoint_volume.GetMasterVolumeLevelScalar() {
                                let _ = app_handle.emit("os-volume-changed", scalar);
                            }
                            
                            ctx.endpoint_volume = Some(EndpointVolumeWrapper(endpoint_volume));
                            ctx.callback = Some(EndpointCallbackWrapper(callback));
                            ctx.active_device_id = Some(device_id.clone());
                            
                            // ---------------------------------------------------------
                            // BASS Stream Redirection
                            // ---------------------------------------------------------
                            let mut target_bass_device = -1;
                            let mut info = std::mem::zeroed::<bass_sys::BassDeviceInfo>();
                            let mut i = 1;
                            
                            while bass_sys::BASS_GetDeviceInfo(i, &mut info) != 0 {
                                if !info.driver.is_null() {
                                    let driver_cstr = std::ffi::CStr::from_ptr(info.driver as *const std::ffi::c_char);
                                    if let Ok(driver_str) = driver_cstr.to_str() {
                                        if driver_str == device_id {
                                            target_bass_device = i as i32;
                                            break;
                                        }
                                    }
                                }
                                i += 1;
                            }
                            
                            if target_bass_device != -1 {
                                // Initialize the target BASS device if it isn't already
                                bass_sys::BASS_Init(target_bass_device as i32, 44100, 0, 0 as _, std::ptr::null_mut());
                                
                                // Redirect the active playing channel (if any) to the new BASS device
                                if let Ok(stream_guard) = audio_state.stream.lock() {
                                    if let Some(stream) = *stream_guard {
                                        bass_sys::BASS_ChannelSetDevice(stream, target_bass_device as u32);
                                    }
                                }
                            }
                            // ---------------------------------------------------------

                            return Ok("Switched audio device successfully".into());
                        } else {
                            return Err("Failed to register callback on new device".into());
                        }
                    } else {
                        return Err("Failed to activate endpoint volume".into());
                    }
                } else {
                    return Err("Failed to get device from enumerator".into());
                }
            }
        }
    }
    Err("Failed to lock volume context".into())
}
