// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::path::Path;
use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState, Shortcut};
use serde::{Deserialize, Serialize};
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::Accessor;
use tauri::Manager;
use window_vibrancy::{apply_blur, apply_mica};
use walkdir::WalkDir;
use std::ffi::CString;
use std::os::raw::c_void;
use std::os::windows::ffi::OsStrExt;
use std::ffi::OsStr;
use std::sync::Mutex;
use std::sync::OnceLock;
use tauri::Emitter;
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;

static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

mod volume;
mod db;
mod bass_wasapi;

use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;

mod bass_fx;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct EqBandPayload {
    pub index: i32,
    pub freq: f32,
    pub gain: f32,
    pub bandwidth: Option<f32>,
}

pub struct AudioState {
    pub stream: Mutex<Option<u32>>,
    pub is_exclusive: Arc<AtomicBool>,
    pub wasapi_device: Mutex<Option<i32>>,
    pub current_file_path: Mutex<Option<String>>,
    pub eq_fx_handle: Mutex<Option<u32>>,
    pub eq_bands: Mutex<Vec<EqBandPayload>>,
    pub eq_enabled: Arc<AtomicBool>,
    pub fade_duration_ms: Arc<AtomicU32>,
    pub preamp_volume: Arc<AtomicU32>,
}

pub fn get_default_wasapi_output_device() -> i32 {
    let mut device_index = 0;
    loop {
        let mut info = unsafe { std::mem::zeroed::<bass_wasapi::BASS_WASAPI_DEVICEINFO>() };
        if !bass_wasapi::wasapi_get_device_info(device_index, &mut info) {
            break;
        }
        let is_enabled = (info.flags & 1) != 0;
        let is_default = (info.flags & 2) != 0;
        let is_input = (info.flags & 8) != 0;
        
        if is_enabled && is_default && !is_input {
            println!("Found Default WASAPI Output Device: ID {}", device_index);
            return device_index as i32;
        }
        device_index += 1;
    }
    0 // fallback to 0
}

fn is_internal_speaker(dev: i32) -> bool {
    let mut info = unsafe { std::mem::zeroed::<bass_wasapi::BASS_WASAPI_DEVICEINFO>() };
    if bass_wasapi::wasapi_get_device_info(dev as u32, &mut info) {
        if info.r#type == 1 {
            if !info.name.is_null() {
                let name = unsafe { std::ffi::CStr::from_ptr(info.name) }.to_string_lossy().to_lowercase();
                if name.contains("realtek") || name.contains("conexant") || name.contains("synaptics") || name.contains("intel") || name.contains("high definition") {
                    return true;
                }
            }
        }
    }
    false
}

#[repr(C)]
pub struct BASS_CHANNELINFO {
    pub freq: u32,
    pub chans: u32,
    pub flags: u32,
    pub ctype: u32,
    pub origres: u32,
    pub plugin: u32,
    pub sample: u32,
    pub filename: *const std::os::raw::c_char,
}


#[tauri::command]
fn get_fade_duration(state: tauri::State<'_, AudioState>) -> Result<u32, String> {
    Ok(state.fade_duration_ms.load(Ordering::SeqCst))
}

#[tauri::command]
fn set_fade_duration(app: tauri::AppHandle, duration_ms: u32, state: tauri::State<'_, AudioState>) -> Result<(), String> {
    state.fade_duration_ms.store(duration_ms, Ordering::SeqCst);
    crate::db::set_setting(&app, "fade_duration_ms", &duration_ms.to_string())?;
    Ok(())
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn scan_for_music(folder_path: String) -> Result<Vec<String>, String> {
    let mut music_files = Vec::new();
    let extensions = ["mp3", "m4a", "flac", "wav", "aac"];

    // WalkDir automatically recurses into subdirectories
    for entry in WalkDir::new(&folder_path).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension() {
                if let Some(ext_str) = ext.to_str() {
                    if extensions.contains(&ext_str.to_lowercase().as_str()) {
                        if let Some(path_str) = path.to_str() {
                            music_files.push(path_str.to_string());
                        }
                    }
                }
            }
        }
    }

    Ok(music_files)
}

#[derive(Serialize, Deserialize)]
pub struct TrackMetadata {
    pub file_path: String,
    pub title: String,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub duration: u64,
    pub cover_art: Option<String>,
    pub sample_rate: Option<u32>,
    pub bit_depth: Option<u8>,
    pub bitrate: Option<u32>,
    pub date_added: Option<i64>,
}

fn attach_eq_to_stream(stream: u32, state: &AudioState) {
    if stream == 0 {
        return;
    }
    
    let mut eq_fx = state.eq_fx_handle.lock().unwrap();
    let bands = state.eq_bands.lock().unwrap();
    let enabled = state.eq_enabled.load(Ordering::SeqCst);
    
    let max_boost = if enabled {
        bands.iter().map(|b| b.gain).fold(0.0f32, f32::max)
    } else {
        0.0f32
    };
    let target_vol = if max_boost > 0.0 { 10f32.powf(-max_boost / 20.0) } else { 1.0f32 };
    state.preamp_volume.store(target_vol.to_bits(), Ordering::SeqCst);
    
    // Auto-preamp stream volume (BASS_ATTRIB_VOL)
    unsafe { bass_sys::BASS_ChannelSetAttribute(stream, 2, target_vol); }
    println!("[DSP] Auto-Preamp set to {:.3} (-{:.1} dB)", target_vol, max_boost.max(0.0));
    
    let fx_handle = bass_fx::channel_set_fx(stream, bass_fx::BASS_FX_BFX_PEAKEQ, 0);
    if fx_handle == 0 {
        let err = unsafe { bass_sys::BASS_ErrorGetCode() };
        eprintln!("[BASS_FX] FAILED BASS_ChannelSetFX on stream {}: Error Code {}", stream, err);
        *eq_fx = None;
    } else {
        println!("[BASS_FX] SUCCESS attached BASS_FX_BFX_PEAKEQ (FX Handle: {}) to stream {}", fx_handle, stream);
        *eq_fx = Some(fx_handle);
        
        let bw = if bands.len() == 15 { 0.67f32 } else { 0.33f32 };
        
        for band in bands.iter() {
            let mut params = bass_fx::BASS_BFX_PEAKEQ {
                lBand: band.index,
                fBandwidth: bw,
                fQ: 0.0,
                fCenter: band.freq,
                fGain: if enabled { band.gain.clamp(-30.0, 30.0) } else { 0.0 },
                lChannel: -1,
            };
            let ok = bass_fx::fx_set_parameters(fx_handle, &mut params as *mut _ as *const std::os::raw::c_void);
            if !ok {
                let err = unsafe { bass_sys::BASS_ErrorGetCode() };
                eprintln!("[BASS_FX] FAILED BASS_FXSetParameters band {}: Error Code {}", band.index, err);
            }
        }
        println!("[BASS_FX] Synced {} EQ bands to stream {} with {:.2} octave BW", bands.len(), stream, bw);
    }
}

#[tauri::command]
fn play_audio(file_path: String, state: tauri::State<'_, AudioState>) -> Result<String, String> {
    let mut stream_guard = state.stream.lock().unwrap();
    let mut path_guard = state.current_file_path.lock().unwrap();

    // If there's an already active stream, stop and free it
    if let Some(old_stream) = *stream_guard {
        if state.is_exclusive.load(Ordering::SeqCst) {
            bass_wasapi::wasapi_stop(true);
            bass_wasapi::wasapi_free();
        }
        bass_sys::BASS_ChannelStop(old_stream);
        bass_sys::BASS_StreamFree(old_stream);
    }

    *path_guard = Some(file_path.clone());

    let wide_path: Vec<u16> = OsStr::new(&file_path).encode_wide().chain(std::iter::once(0)).collect();

    let is_ex = state.is_exclusive.load(Ordering::SeqCst);
    let flags = if is_ex {
        bass_sys::BASS_STREAM_DECODE | bass_sys::BASS_SAMPLE_FLOAT | bass_sys::BASS_UNICODE
    } else {
        bass_sys::BASS_SAMPLE_FLOAT | bass_sys::BASS_UNICODE
    };

    let cur_dev = unsafe { bass_sys::BASS_GetDevice() };
    if cur_dev == 0 || cur_dev == u32::MAX {
        unsafe { bass_sys::BASS_SetDevice(1); }
    } else {
        unsafe { bass_sys::BASS_SetDevice(cur_dev); }
    }

    let stream = bass_sys::BASS_StreamCreateFile(
        0,
        wide_path.as_ptr() as *const c_void,
        0, 0,
        flags,
    );

    if stream == 0 {
        return Err("Failed to create BASS audio stream.".into());
    }

    unsafe extern "C" fn sync_end_callback(_handle: u32, _channel: u32, _data: u32, _user: *mut c_void) {
        if let Some(app) = APP_HANDLE.get() {
            let _ = app.emit("track-ended", ());
        }
    }
    
    bass_sys::BASS_ChannelSetSync(stream, 2, 0, sync_end_callback as *mut _, std::ptr::null_mut());
    attach_eq_to_stream(stream, &state);
    *stream_guard = Some(stream);

    if is_ex {
        let mut info = unsafe { std::mem::zeroed::<BASS_CHANNELINFO>() };
        unsafe { bass_sys::BASS_ChannelGetInfo(stream, &mut info as *mut BASS_CHANNELINFO as *mut _); }
        let mut dev = state.wasapi_device.lock().unwrap().unwrap_or(-1);
        if dev == -1 {
            dev = get_default_wasapi_output_device();
        }
        
        bass_wasapi::wasapi_stop(true);
        bass_wasapi::wasapi_free();
        
        std::thread::sleep(std::time::Duration::from_millis(40));
        
        let mut init_res = false;
        let flags = bass_wasapi::BASS_WASAPI_EXCLUSIVE | bass_wasapi::BASS_WASAPI_AUTOFORMAT | bass_wasapi::BASS_WASAPI_DITHER;
        
        for _attempt in 1..=4 {
            init_res = bass_wasapi::wasapi_init(dev, info.freq, info.chans, flags, 0.1, 0.0, bass_wasapi::WASAPIPROC_BASS, stream as *mut c_void);
            if init_res {
                break;
            }
            
            let err = unsafe { bass_sys::BASS_ErrorGetCode() };
            if err == 46 { // BASS_ERROR_BUSY
                std::thread::sleep(std::time::Duration::from_millis(35));
            } else {
                break;
            }
        }
        
        if init_res {
            println!("WASAPI Exclusive Mode physically LOCKED on device {} at {}Hz!", dev, info.freq);
            bass_wasapi::wasapi_start();
        } else {
            let err = unsafe { bass_sys::BASS_ErrorGetCode() };
            eprintln!("WASAPI Exclusive Init FAILED on device {}! Error Code: {}", dev, err);
            // Fallback
            state.is_exclusive.store(false, Ordering::SeqCst);
            bass_sys::BASS_StreamFree(stream);
            let stream2 = bass_sys::BASS_StreamCreateFile(0, wide_path.as_ptr() as *const c_void, 0, 0, bass_sys::BASS_SAMPLE_FLOAT | bass_sys::BASS_UNICODE);
            
            attach_eq_to_stream(stream2, &state);
            let target_vol = f32::from_bits(state.preamp_volume.load(Ordering::SeqCst));
            let fade_ms = state.fade_duration_ms.load(Ordering::SeqCst);
            if fade_ms > 0 {
                unsafe { bass_sys::BASS_ChannelSetAttribute(stream2, 2, 0.0); }
                unsafe { bass_sys::BASS_ChannelPlay(stream2, 0); }
                unsafe { bass_sys::BASS_ChannelSlideAttribute(stream2, 2, target_vol, fade_ms); }
            } else {
                unsafe { bass_sys::BASS_ChannelSetAttribute(stream2, 2, target_vol); }
                unsafe { bass_sys::BASS_ChannelPlay(stream2, 0); }
            }
            
            unsafe { bass_sys::BASS_ChannelSetSync(stream2, 2, 0, sync_end_callback as *mut _, std::ptr::null_mut()); }
            *stream_guard = Some(stream2);
        }
    } else {
        let target_vol = f32::from_bits(state.preamp_volume.load(Ordering::SeqCst));
        let fade_ms = state.fade_duration_ms.load(Ordering::SeqCst);
        if fade_ms > 0 {
            unsafe { bass_sys::BASS_ChannelSetAttribute(stream, 2, 0.0); }
            unsafe { bass_sys::BASS_ChannelPlay(stream, 0); }
            unsafe { bass_sys::BASS_ChannelSlideAttribute(stream, 2, target_vol, fade_ms); }
        } else {
            unsafe { bass_sys::BASS_ChannelSetAttribute(stream, 2, target_vol); }
            unsafe { bass_sys::BASS_ChannelPlay(stream, 0); }
        }
    }
    
    Ok("Playing audio successfully".into())
}

#[tauri::command]
fn pause_audio(state: tauri::State<'_, AudioState>) -> Result<String, String> {
    let fade_duration_ms = state.fade_duration_ms.load(Ordering::SeqCst);
    let stream_guard = state.stream.lock().unwrap();
    if let Some(stream) = *stream_guard {
        if fade_duration_ms == 0 {
            if state.is_exclusive.load(Ordering::SeqCst) {
                bass_wasapi::wasapi_stop(false);
            } else {
                unsafe { bass_sys::BASS_ChannelPause(stream); }
            }
        } else {
            let mut current_vol = 1.0f32;
            unsafe { bass_sys::BASS_ChannelGetAttribute(stream, 2, &mut current_vol); }
            println!("[Anti-Pop] Fading OUT over {}ms (Start Vol: {:.2})", fade_duration_ms, current_vol);
            let slide_res = unsafe { bass_sys::BASS_ChannelSlideAttribute(stream, 2, 0.0, fade_duration_ms) };
            println!("[Anti-Pop] BASS_ChannelSlideAttribute result = {}", slide_res);
            
            let fade_ms = fade_duration_ms as u64;
            let is_exc = state.is_exclusive.clone();
            std::thread::spawn(move || {
                std::thread::sleep(std::time::Duration::from_millis(fade_ms));
                println!("[Anti-Pop] Sleep finished, pausing stream!");
                if is_exc.load(Ordering::SeqCst) {
                    bass_wasapi::wasapi_stop(false);
                } else {
                    unsafe { bass_sys::BASS_ChannelPause(stream); }
                }
                unsafe { bass_sys::BASS_ChannelSetAttribute(stream, 2, current_vol); }
            });
        }
        Ok("Paused audio".into())
    } else {
        Err("No audio stream active".into())
    }
}

#[tauri::command]
fn resume_audio(state: tauri::State<'_, AudioState>) -> Result<String, String> {
    let fade_duration_ms = state.fade_duration_ms.load(Ordering::SeqCst);
    let target_vol = f32::from_bits(state.preamp_volume.load(Ordering::SeqCst));
    let stream_guard = state.stream.lock().unwrap();
    if let Some(stream) = *stream_guard {
        if fade_duration_ms > 0 {
            unsafe { bass_sys::BASS_ChannelSetAttribute(stream, 2, 0.0); }
            println!("[Anti-Pop] Fading IN over {}ms to Vol: {:.2}", fade_duration_ms, target_vol);
            
            if state.is_exclusive.load(Ordering::SeqCst) {
                bass_wasapi::wasapi_start();
            } else {
                unsafe { bass_sys::BASS_ChannelPlay(stream, 0); }
            }
            let slide_res = unsafe { bass_sys::BASS_ChannelSlideAttribute(stream, 2, target_vol, fade_duration_ms) };
            println!("[Anti-Pop] BASS_ChannelSlideAttribute result = {}", slide_res);
        } else {
            unsafe { bass_sys::BASS_ChannelSetAttribute(stream, 2, target_vol); }
            if state.is_exclusive.load(Ordering::SeqCst) {
                bass_wasapi::wasapi_start();
            } else {
                unsafe { bass_sys::BASS_ChannelPlay(stream, 0); }
            }
        }
        Ok("Resumed audio".into())
    } else {
        Err("No audio stream active".into())
    }
}

#[tauri::command]
fn set_exclusive_mode(
    enabled: bool,
    is_playing: bool,
    current_pos_secs: f64,
    state: tauri::State<'_, AudioState>,
) -> Result<bool, String> {
    println!("[Audio Switch] Initiating mode switch -> Target: Exclusive = {} | Was Playing = {} | At: {:.2}s", enabled, is_playing, current_pos_secs);
    let mut stream_guard = state.stream.lock().unwrap();
    let path_guard = state.current_file_path.lock().unwrap();
    
    let file_path = match path_guard.as_ref() {
        Some(p) => p.clone(),
        None => {
            state.is_exclusive.store(enabled, Ordering::SeqCst);
            return Ok(enabled);
        }
    };
    let wide_path: Vec<u16> = OsStr::new(&file_path).encode_wide().chain(std::iter::once(0)).collect();

    // Step A: Synthetic Stop & Settle
    println!("[Audio Switch] 1/4 Stopping active audio pipelines & freeing handles...");
    if let Some(old_stream) = stream_guard.take() {
        if state.is_exclusive.load(Ordering::SeqCst) {
            bass_wasapi::wasapi_stop(true);
        } else {
            unsafe { bass_sys::BASS_ChannelStop(old_stream); }
        }
        bass_wasapi::wasapi_free();
        unsafe { bass_sys::BASS_StreamFree(old_stream); }
        println!("[Audio Switch] 2/4 Hardware buffer flush delay (80ms)...");
        std::thread::sleep(std::time::Duration::from_millis(80));
    } else {
        bass_wasapi::wasapi_free();
    }

    // Step B: Rebuild Target Stream
    println!("[Audio Switch] 3/4 Creating new stream & restoring position to {:.2}s...", current_pos_secs);
    state.is_exclusive.store(enabled, Ordering::SeqCst);

    unsafe extern "C" fn sync_end_callback(_handle: u32, _channel: u32, _data: u32, _user: *mut c_void) {
        if let Some(app) = APP_HANDLE.get() { let _ = app.emit("track-ended", ()); }
    }

    if enabled {
        // --- EXCLUSIVE MODE ---
        let stream = unsafe {
            bass_sys::BASS_StreamCreateFile(
                0,
                wide_path.as_ptr() as *const c_void,
                0, 0,
                bass_sys::BASS_STREAM_DECODE | bass_sys::BASS_SAMPLE_FLOAT | bass_sys::BASS_UNICODE
            )
        };
        if stream == 0 {
            let err = unsafe { bass_sys::BASS_ErrorGetCode() };
            eprintln!("[Audio Switch] ERROR at step 3: Code {}", err);
            return Err("Failed to create decode stream for Exclusive mode".into());
        }

        let mut dev = state.wasapi_device.lock().unwrap().unwrap_or(-1);
        if dev == -1 {
            dev = get_default_wasapi_output_device();
        }

        if is_internal_speaker(dev) {
            unsafe { bass_sys::BASS_StreamFree(stream); }
            state.is_exclusive.store(false, Ordering::SeqCst);
            eprintln!("[Audio Switch] ERROR at step 3: Internal speaker rejected");
            return Err("Exclusive Mode is disabled for internal laptop speakers to prevent hardware locks.".to_string());
        }

        let mut info = unsafe { std::mem::zeroed::<BASS_CHANNELINFO>() };
        unsafe { bass_sys::BASS_ChannelGetInfo(stream, &mut info as *mut BASS_CHANNELINFO as *mut _); }

        let flags = bass_wasapi::BASS_WASAPI_EXCLUSIVE | bass_wasapi::BASS_WASAPI_AUTOFORMAT | bass_wasapi::BASS_WASAPI_DITHER;
        let mut init_res = false;
        for _attempt in 1..=4 {
            init_res = bass_wasapi::wasapi_init(dev, info.freq, info.chans, flags, 0.1, 0.0, bass_wasapi::WASAPIPROC_BASS, stream as *mut c_void);
            if init_res { break; }
            let err = unsafe { bass_sys::BASS_ErrorGetCode() };
            if err == 46 {
                std::thread::sleep(std::time::Duration::from_millis(35));
            } else {
                break;
            }
        }

        if !init_res {
            let err = unsafe { bass_sys::BASS_ErrorGetCode() };
            state.is_exclusive.store(false, Ordering::SeqCst);
            unsafe { bass_sys::BASS_StreamFree(stream); }
            eprintln!("[Audio Switch] ERROR at step 3: Code {}", err);
            return Err(format!("WASAPI Exclusive Init failed with code {}", err));
        }

        let new_pos_bytes = unsafe { bass_sys::BASS_ChannelSeconds2Bytes(stream, current_pos_secs) };
        unsafe { bass_sys::BASS_ChannelSetPosition(stream, new_pos_bytes, bass_sys::BASS_POS_BYTE); }
        unsafe { bass_sys::BASS_ChannelSetSync(stream, 2, 0, sync_end_callback as *mut _, std::ptr::null_mut()); }

        if is_playing {
            bass_wasapi::wasapi_start();
        }

        attach_eq_to_stream(stream, &state);
        *stream_guard = Some(stream);
    } else {
        // --- SHARED MODE ---
        unsafe {
            bass_sys::BASS_Free();
            bass_sys::BASS_Init(-1, 44100, 0, std::ptr::null_mut(), std::ptr::null_mut());
        }

        std::thread::sleep(std::time::Duration::from_millis(50));

        let stream = unsafe {
            bass_sys::BASS_StreamCreateFile(
                0,
                wide_path.as_ptr() as *const c_void,
                0, 0,
                bass_sys::BASS_UNICODE
            )
        };
        if stream == 0 {
            let err = unsafe { bass_sys::BASS_ErrorGetCode() };
            eprintln!("[Audio Switch] ERROR at step 3: Code {}", err);
            return Err(format!("Failed to create standard shared stream with code {}", err));
        }

        let new_pos_bytes = unsafe { bass_sys::BASS_ChannelSeconds2Bytes(stream, current_pos_secs) };
        unsafe {
            bass_sys::BASS_ChannelSetPosition(stream, new_pos_bytes, bass_sys::BASS_POS_BYTE);
            bass_sys::BASS_ChannelSetSync(stream, 2, 0, sync_end_callback as *mut _, std::ptr::null_mut());
            if is_playing {
                bass_sys::BASS_ChannelPlay(stream, 0);
            } else {
                bass_sys::BASS_ChannelPause(stream);
            }
        }

        attach_eq_to_stream(stream, &state);
        *stream_guard = Some(stream);
    }

    println!("[Audio Switch] 4/4 Output state: {} (Playback resumed: {})", if enabled { "Exclusive" } else { "Shared" }, is_playing);
    Ok(enabled)
}

#[tauri::command]
fn get_audio_position(state: tauri::State<'_, AudioState>) -> Result<f64, String> {
    let stream_guard = state.stream.lock().unwrap();
    if let Some(stream) = *stream_guard {
        let pos_bytes = bass_sys::BASS_ChannelGetPosition(stream, bass_sys::BASS_POS_BYTE);
        let pos_secs = bass_sys::BASS_ChannelBytes2Seconds(stream, pos_bytes);
        Ok(pos_secs)
    } else {
        Ok(0.0)
    }
}

#[tauri::command]
fn seek_audio(position_secs: f64, state: tauri::State<'_, AudioState>) -> Result<String, String> {
    let stream_guard = state.stream.lock().unwrap();
    if let Some(stream) = *stream_guard {
        let pos_bytes = bass_sys::BASS_ChannelSeconds2Bytes(stream, position_secs);
        bass_sys::BASS_ChannelSetPosition(stream, pos_bytes, bass_sys::BASS_POS_BYTE);
        Ok("Seek successful".into())
    } else {
        Err("No active stream".into())
    }
}

#[tauri::command]
fn get_track_metadata(app: tauri::AppHandle, file_path: String) -> Result<TrackMetadata, String> {
    let path = Path::new(&file_path);
    let tagged_file = Probe::open(path)
        .map_err(|e| e.to_string())?
        .read()
        .map_err(|e| e.to_string())?;

    let tag = match tagged_file.primary_tag() {
        Some(primary_tag) => Some(primary_tag),
        None => tagged_file.first_tag(),
    };

    let mut title = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
    let mut artist = None;
    let mut album = None;
    let mut cover_art = None;

    if let Some(tag) = tag {
        if let Some(t) = tag.title() {
            if !t.is_empty() {
                title = t.to_string();
            }
        }
        artist = tag.artist().map(|s| s.to_string());
        album = tag.album().map(|s| s.to_string());

        let pictures = tag.pictures();
        if let Some(pic) = pictures.first() {
            if let Ok(app_dir) = app.path().app_local_data_dir() {
                let covers_dir = app_dir.join("covers");
                let _ = std::fs::create_dir_all(&covers_dir);
                
                let mut hasher = DefaultHasher::new();
                file_path.hash(&mut hasher);
                let file_hash = hasher.finish();
                
                let is_png = pic.mime_type().map(|m| m.to_string()) == Some("image/png".to_string());
                let ext = if is_png { "png" } else { "jpg" };
                let cover_file_name = format!("{}.{}", file_hash, ext);
                let cover_path = covers_dir.join(cover_file_name);
                
                if !cover_path.exists() {
                    let _ = std::fs::write(&cover_path, pic.data());
                }
                
                if let Some(path_str) = cover_path.to_str() {
                    // Windows uses backslashes, Tauri's convertFileSrc handles them correctly
                    // We return the raw absolute path.
                    cover_art = Some(path_str.to_string());
                }
            }
        }
    }

    let props = tagged_file.properties();
    let duration = props.duration().as_secs();
    let sample_rate = props.sample_rate();
    let bit_depth = props.bit_depth();
    let bitrate = props.audio_bitrate();
    
    let mut date_added = None;
    if let Ok(metadata) = std::fs::metadata(&path) {
        if let Ok(modified) = metadata.modified() {
            if let Ok(dur) = modified.duration_since(std::time::UNIX_EPOCH) {
                date_added = Some(dur.as_secs() as i64);
            }
        } else if let Ok(created) = metadata.created() {
            if let Ok(dur) = created.duration_since(std::time::UNIX_EPOCH) {
                date_added = Some(dur.as_secs() as i64);
            }
        }
    }

    Ok(TrackMetadata {
        file_path,
        title,
        artist,
        album,
        duration,
        cover_art,
        sample_rate,
        bit_depth,
        bitrate,
        date_added,
    })
}

#[tauri::command]
fn reveal_track_in_explorer(path: String) {
    #[cfg(target_os = "windows")]
    {
        if let Err(e) = std::process::Command::new("explorer")
            .args(["/select,", &path])
            .spawn() 
        {
            eprintln!("Failed to open explorer: {}", e);
        }
    }
}

use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]

#[tauri::command]
fn apply_eq_bands(bands: Vec<EqBandPayload>, state: tauri::State<'_, AudioState>) -> Result<(), String> {
    let mut state_bands = state.eq_bands.lock().unwrap();
    *state_bands = bands.clone();
    
    if !state.eq_enabled.load(Ordering::SeqCst) {
        return Ok(()); // Just saved the bands
    }
    
    let eq_fx = state.eq_fx_handle.lock().unwrap();
    if let Some(fx_handle) = *eq_fx {
        for band in bands.iter() {
            let mut params = bass_fx::BASS_BFX_PEAKEQ {
                lBand: band.index,
                fBandwidth: band.bandwidth.unwrap_or(1.0),
                fQ: 0.0,
                fCenter: band.freq,
                fGain: band.gain.clamp(-15.0, 15.0),
                lChannel: -1,
            };
            let ok = bass_fx::fx_set_parameters(fx_handle, &mut params as *mut _ as *const std::os::raw::c_void);
            if !ok {
                let err = unsafe { bass_sys::BASS_ErrorGetCode() };
                eprintln!("[BASS_FX] FAILED BASS_FXSetParameters band {}: Error Code {}", band.index, err);
            }
        }
        println!("[BASS_FX] Applied {} bands to FX Handle {}", bands.len(), fx_handle);
    }
    Ok(())
}

#[tauri::command]
fn toggle_eq(enabled: bool, state: tauri::State<'_, AudioState>) -> Result<bool, String> {
    state.eq_enabled.store(enabled, Ordering::SeqCst);
    
    let stream_guard = state.stream.lock().unwrap();
    let mut eq_fx = state.eq_fx_handle.lock().unwrap();
    
    if let Some(stream) = *stream_guard {
        if enabled {
            // Attach if not already
            if eq_fx.is_none() {
                let fx_handle = bass_fx::channel_set_fx(stream, bass_fx::BASS_FX_BFX_PEAKEQ, 0);
                if fx_handle != 0 {
                    *eq_fx = Some(fx_handle);
                    let bands = state.eq_bands.lock().unwrap();
                    for band in bands.iter() {
                        let mut params = bass_fx::BASS_BFX_PEAKEQ {
                            lBand: band.index,
                            fBandwidth: band.bandwidth.unwrap_or(1.0),
                            fQ: 0.0,
                            fCenter: band.freq,
                            fGain: band.gain,
                            lChannel: -1,
                        };
                        bass_fx::fx_set_parameters(fx_handle, &mut params as *mut _ as *const std::os::raw::c_void);
                    }
                }
            }
        } else {
            // Remove
            if let Some(fx_handle) = *eq_fx {
                bass_fx::channel_remove_fx(stream, fx_handle);
                *eq_fx = None;
            }
        }
    }
    
    Ok(enabled)
}

#[tauri::command]
fn get_eq_state(state: tauri::State<'_, AudioState>) -> Result<Vec<EqBandPayload>, String> {
    let bands = state.eq_bands.lock().unwrap();
    Ok(bands.clone())
}

pub fn run() {

    let migrations = vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: "
                CREATE TABLE auth_users (
                    id INTEGER PRIMARY KEY,
                    email TEXT,
                    username TEXT,
                    token TEXT,
                    is_logged_in INTEGER
                );
                CREATE TABLE music_tracks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_path TEXT UNIQUE,
                    title TEXT,
                    artist TEXT,
                    album TEXT,
                    duration_secs INTEGER,
                    sample_rate INTEGER,
                    bit_depth INTEGER,
                    bitrate INTEGER,
                    cover_art_path TEXT
                );
                CREATE TABLE playlists (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    cover_art TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
                CREATE TABLE playlist_tracks (
                    playlist_id TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (playlist_id, file_path)
                );
            ",
            kind: MigrationKind::Up,
        }
    ];

    let initial_state = AudioState { 
        stream: Mutex::new(None),
        is_exclusive: Arc::new(AtomicBool::new(false)),
        wasapi_device: Mutex::new(None),
        current_file_path: Mutex::new(None),
        eq_fx_handle: Mutex::new(None),
        eq_bands: Mutex::new(Vec::new()),
        eq_enabled: Arc::new(AtomicBool::new(true)),
        fade_duration_ms: Arc::new(AtomicU32::new(250)),
        preamp_volume: Arc::new(AtomicU32::new(1.0f32.to_bits())),
    };

    tauri::Builder::default()
        .manage(initial_state)
        .setup(|app| {
            if let Ok(Some(val)) = crate::db::get_setting(app.handle(), "fade_duration_ms") {
                if let Ok(ms) = val.parse::<u32>() {
                    let state = app.state::<AudioState>();
                    state.fade_duration_ms.store(ms, Ordering::SeqCst);
                }
            }
            Ok(())
        })
        .plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:project_audio.db", migrations).build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet, scan_for_music, get_track_metadata, play_audio, pause_audio, resume_audio, get_audio_position, seek_audio, set_exclusive_mode, reveal_track_in_explorer, volume::set_system_volume, volume::get_system_volume, volume::get_audio_devices, volume::switch_audio_device, volume::get_current_audio_device,
            db::save_track_to_cache, db::get_cached_library, db::cleanup_ghost_tracks, db::scan_and_sync_library,
            db::create_playlist, db::get_playlists, db::delete_playlist, db::add_track_to_playlist, db::remove_track_from_playlist, db::get_playlist_tracks, db::delete_track, db::update_playlist_cover,
            db::set_device_nickname, db::get_saved_devices, db::delete_device_nickname, db::get_or_generate_waveform,
            apply_eq_bands, toggle_eq, get_eq_state,
            get_fade_duration, set_fade_duration,
            crate::db::save_eq_profile, crate::db::load_eq_profiles, crate::db::delete_eq_profile
        ])
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_shortcuts([
                    Shortcut::new(Some(Modifiers::empty()), Code::MediaPlayPause),
                    Shortcut::new(Some(Modifiers::empty()), Code::MediaTrackNext),
                    Shortcut::new(Some(Modifiers::empty()), Code::MediaTrackPrevious)
                ])
                .unwrap()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        if shortcut.matches(Modifiers::empty(), Code::MediaPlayPause) {
                            let _ = app.emit("media-toggle", ());
                        } else if shortcut.matches(Modifiers::empty(), Code::MediaTrackNext) {
                            let _ = app.emit("media-next", ());
                        } else if shortcut.matches(Modifiers::empty(), Code::MediaTrackPrevious) {
                            let _ = app.emit("media-prev", ());
                        }
                    }
                })
                .build()
        )
        // --- WE INJECT THE SETUP HOOK RIGHT HERE ---
        .setup(|app| {
            let app_handle = app.handle().clone();
            let _ = APP_HANDLE.set(app_handle.clone());

            std::thread::spawn(move || {
                let db_path = crate::db::get_db_path(&app_handle);
                let mut debug_info = format!("DB Path: {:?}\n", db_path);
                
                if let Some(parent) = db_path.parent() {
                    let _ = std::fs::create_dir_all(parent);
                }
                
                match rusqlite::Connection::open(&db_path) {
                    Ok(conn) => {
                        debug_info.push_str("Successfully opened SQLite connection.\n");
                        match crate::db::ensure_schema(&conn) {
                            Ok(_) => debug_info.push_str("Successfully created schema.\n"),
                            Err(e) => debug_info.push_str(&format!("Schema error: {}\n", e)),
                        }
                    },
                    Err(e) => {
                        debug_info.push_str(&format!("Failed to open connection: {}\n", e));
                    }
                }
                
                let _ = std::fs::write("C:\\Users\\mohan\\.gemini\\antigravity\\brain\\0a6d40be-8fe2-4061-983f-0b9b03e0be77\\scratch\\db_debug.txt", debug_info);
            });

            let _ = APP_HANDLE.set(app.handle().clone());
            
            // Initialize BASS with default device
            if bass_sys::BASS_Init(-1, 44100, 0, std::ptr::null_mut(), std::ptr::null_mut()) == 0 {
                eprintln!("ERROR: Failed to initialize BASS audio library.");
            } else {
                println!("BASS audio library initialized successfully.");
                
                // Enforce high-quality sample rate conversion (Sinc interpolation)
                bass_sys::BASS_SetConfig(bass_sys::BASS_CONFIG_SRC, 3);
                
                // Load the FLAC plugin dynamically
                let exe_dir = std::env::current_exe().unwrap().parent().unwrap().to_path_buf();
                let dev_path = exe_dir.join("bassflac.dll");
                
                // app is the AppHandle or App in setup.
                let prod_path = app.path().resource_dir().unwrap_or_else(|_| exe_dir.clone()).join("native").join("bassflac.dll");
                
                let load_path = if prod_path.exists() {
                    prod_path
                } else if dev_path.exists() {
                    dev_path
                } else {
                    std::path::PathBuf::from("bassflac.dll")
                };

                // Ensure BASS can find dependencies by prepending the DLL directory to PATH
                if let Some(parent) = load_path.parent() {
                    let path_env = std::env::var("PATH").unwrap_or_default();
                    std::env::set_var("PATH", format!("{};{}", parent.display(), path_env));
                }

                let flac_plugin = CString::new(load_path.to_str().unwrap()).unwrap();
                let plugin = bass_sys::BASS_PluginLoad(flac_plugin.as_ptr() as *const c_void, 0);
                if plugin != 0 {
                    println!("BASS FLAC plugin loaded successfully.");
                } else {
                    eprintln!("Warning: Failed to load BASS FLAC plugin.");
                }
                
                // Load BASS WASAPI
                let app_dir = app.path().resource_dir().ok();
                if let Err(e) = bass_wasapi::load_wasapi(app_dir.clone()) {
                    eprintln!("Failed to load BASS WASAPI: {}", e);
                } else {
                    println!("BASS WASAPI loaded successfully.");
                }
                
                if let Err(e) = bass_fx::load_bass_fx(app_dir) {
                    eprintln!("Failed to load BASS_FX: {}", e);
                } else {
                    println!("BASS FX plugin loaded successfully.");
                }
            }

            match volume::setup_volume_listener(app.handle().clone()) {
                Ok(volume_state) => {
                    app.manage(volume_state);
                    println!("Windows Master Volume listener hooked successfully.");
                }
                Err(e) => eprintln!("Failed to setup volume listener: {}", e),
            }

            // Fetch the main window instance under Tauri v2 structure
            let window = app.get_webview_window("main").unwrap();

            #[cfg(target_os = "windows")]
            if apply_mica(&window, Some(true)).is_err() {
                // 2. If Mica fails or isn't supported (like Windows 10), apply standard deep Acrylic blur
                let _ = apply_blur(&window, Some((11, 15, 25, 100)));
            }

            Ok(())
        })
        // -------------------------------------------
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|_app_handle, event| match event {
            tauri::RunEvent::Exit => {
                println!("Exiting application, freeing BASS resources...");
                bass_sys::BASS_Free();
            }
            _ => {}
        });
}
