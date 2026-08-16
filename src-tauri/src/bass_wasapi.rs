use std::os::raw::{c_void, c_char};
use std::sync::OnceLock;
use windows::Win32::System::LibraryLoader::{LoadLibraryA, GetProcAddress};
use windows::core::PCSTR;
use std::ffi::CString;
use std::path::PathBuf;

pub const BASS_WASAPI_EXCLUSIVE: u32 = 1;
pub const BASS_WASAPI_EVENT: u32 = 16;
pub const BASS_WASAPI_AUTOFORMAT: u32 = 2;
pub const BASS_WASAPI_BUFFER: u32 = 32;
pub const BASS_WASAPI_DITHER: u32 = 128;

#[repr(C)]
pub struct BASS_WASAPI_DEVICEINFO {
    pub name: *const std::os::raw::c_char,
    pub id: *const std::os::raw::c_char,
    pub r#type: u32,
    pub flags: u32,
    pub minperiod: f32,
    pub defperiod: f32,
    pub mixfreq: u32,
    pub mixchans: u32,
}

pub type WASAPIPROC = Option<unsafe extern "system" fn(buffer: *mut c_void, length: u32, user: *mut c_void) -> u32>;
pub const WASAPIPROC_BASS: *mut c_void = -1isize as *mut c_void; // Standard cast for WASAPIPROC_BASS in 64-bit

type InitFn = unsafe extern "system" fn(device: i32, freq: u32, chans: u32, flags: u32, buffer: f32, period: f32, proc: *mut c_void, user: *mut c_void) -> i32;
type FreeFn = unsafe extern "system" fn() -> i32;
type StartFn = unsafe extern "system" fn() -> i32;
type StopFn = unsafe extern "system" fn(reset: i32) -> i32;
type GetDeviceFn = unsafe extern "system" fn() -> i32;
type CheckFormatFn = unsafe extern "system" fn(device: i32, freq: u32, chans: u32, flags: u32) -> i32;
type GetDeviceInfoFn = unsafe extern "system" fn(device: u32, info: *mut BASS_WASAPI_DEVICEINFO) -> i32;

struct WasapiFuncs {
    init: InitFn,
    free: FreeFn,
    start: StartFn,
    stop: StopFn,
    get_device: GetDeviceFn,
    check_format: CheckFormatFn,
    get_device_info: GetDeviceInfoFn,
}

static FUNCS: OnceLock<WasapiFuncs> = OnceLock::new();

pub fn load_wasapi(app_dir: Option<PathBuf>) -> Result<(), String> {
    if FUNCS.get().is_some() {
        return Ok(());
    }

    let exe_dir = std::env::current_exe().unwrap().parent().unwrap().to_path_buf();
    let dev_path = exe_dir.join("basswasapi.dll");
    let mut prod_path = exe_dir.clone();
    if let Some(dir) = app_dir {
        prod_path = dir.join("native").join("basswasapi.dll");
    }

    let cwd_path = std::env::current_dir().unwrap_or_default().join("native").join("basswasapi.dll");

    let load_path = if prod_path.exists() {
        prod_path
    } else if dev_path.exists() {
        dev_path
    } else if cwd_path.exists() {
        cwd_path
    } else {
        PathBuf::from("basswasapi.dll")
    };

    let path_str = load_path.to_str().unwrap_or("basswasapi.dll");
    let c_path = CString::new(path_str).map_err(|e| e.to_string())?;

    if let Some(parent) = load_path.parent() {
        let path_env = std::env::var("PATH").unwrap_or_default();
        std::env::set_var("PATH", format!("{};{}", parent.display(), path_env));
    }

    unsafe {
        let handle = LoadLibraryA(PCSTR(c_path.as_ptr() as *const u8)).map_err(|e| e.to_string())?;
        
        let get_proc = |name: &str| -> Result<*mut c_void, String> {
            let c_name = CString::new(name).unwrap();
            let addr = GetProcAddress(handle, PCSTR(c_name.as_ptr() as *const u8));
            match addr {
                Some(f) => Ok(f as *mut c_void),
                None => Err(format!("Could not find {} in basswasapi.dll", name)),
            }
        };

        let funcs = WasapiFuncs {
            init: std::mem::transmute(get_proc("BASS_WASAPI_Init")?),
            free: std::mem::transmute(get_proc("BASS_WASAPI_Free")?),
            start: std::mem::transmute(get_proc("BASS_WASAPI_Start")?),
            stop: std::mem::transmute(get_proc("BASS_WASAPI_Stop")?),
            get_device: std::mem::transmute(get_proc("BASS_WASAPI_GetDevice")?),
            check_format: std::mem::transmute(get_proc("BASS_WASAPI_CheckFormat")?),
            get_device_info: std::mem::transmute(get_proc("BASS_WASAPI_GetDeviceInfo")?),
        };

        let _ = FUNCS.set(funcs);
    }
    Ok(())
}

pub fn wasapi_init(device: i32, freq: u32, chans: u32, flags: u32, buffer: f32, period: f32, proc: *mut c_void, user: *mut c_void) -> bool {
    if let Some(funcs) = FUNCS.get() {
        unsafe { (funcs.init)(device, freq, chans, flags, buffer, period, proc, user) != 0 }
    } else {
        false
    }
}

pub fn wasapi_free() -> bool {
    if let Some(funcs) = FUNCS.get() {
        unsafe { (funcs.free)() != 0 }
    } else {
        false
    }
}

pub fn wasapi_start() -> bool {
    if let Some(funcs) = FUNCS.get() {
        unsafe { (funcs.start)() != 0 }
    } else {
        false
    }
}

pub fn wasapi_stop(reset: bool) -> bool {
    if let Some(funcs) = FUNCS.get() {
        unsafe { (funcs.stop)(if reset { 1 } else { 0 }) != 0 }
    } else {
        false
    }
}

pub fn wasapi_get_device() -> i32 {
    if let Some(funcs) = FUNCS.get() {
        unsafe { (funcs.get_device)() }
    } else {
        -1
    }
}

pub fn wasapi_check_format(device: i32, freq: u32, chans: u32, flags: u32) -> i32 {
    if let Some(funcs) = FUNCS.get() {
        unsafe { (funcs.check_format)(device, freq, chans, flags) }
    } else {
        -1
    }
}

pub fn wasapi_get_device_info(device: u32, info: &mut BASS_WASAPI_DEVICEINFO) -> bool {
    if let Some(funcs) = FUNCS.get() {
        unsafe { (funcs.get_device_info)(device, info as *mut _) != 0 }
    } else {
        false
    }
}
