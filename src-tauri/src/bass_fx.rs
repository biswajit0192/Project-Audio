use std::os::raw::{c_void};
use std::sync::OnceLock;
use windows::Win32::System::LibraryLoader::{LoadLibraryA, GetProcAddress};
use windows::core::PCSTR;
use std::ffi::CString;
use std::path::PathBuf;

pub const BASS_FX_BFX_PEAKEQ: u32 = 0x10004;

#[repr(C)]
#[derive(Debug, Clone, Copy)]
pub struct BASS_BFX_PEAKEQ {
    pub lBand: i32,
    pub fBandwidth: f32,
    pub fQ: f32,
    pub fCenter: f32,
    pub fGain: f32,
    pub lChannel: i32,
}

type SetFXFn = unsafe extern "system" fn(handle: u32, type_: u32, priority: i32) -> u32;
type RemoveFXFn = unsafe extern "system" fn(handle: u32, fx: u32) -> i32;
type SetParamsFn = unsafe extern "system" fn(handle: u32, params: *const c_void) -> i32;
type GetParamsFn = unsafe extern "system" fn(handle: u32, params: *mut c_void) -> i32;
type GetVersionFn = unsafe extern "system" fn() -> u32;

struct FXFuncs {
    set_fx: SetFXFn,
    remove_fx: RemoveFXFn,
    set_params: SetParamsFn,
    get_params: GetParamsFn,
}

static FUNCS: OnceLock<FXFuncs> = OnceLock::new();

pub fn load_bass_fx(app_dir: Option<PathBuf>) -> Result<(), String> {
    if FUNCS.get().is_some() {
        return Ok(());
    }

    let exe_dir = std::env::current_exe().unwrap().parent().unwrap().to_path_buf();
    
    // Resolve bass.dll path
    let bass_dev_path = exe_dir.join("bass.dll");
    let mut bass_prod_path = exe_dir.clone();
    if let Some(ref dir) = app_dir {
        bass_prod_path = dir.join("native").join("bass.dll");
    }
    let bass_cwd_path = std::env::current_dir().unwrap_or_default().join("native").join("bass.dll");

    let bass_load_path = if bass_prod_path.exists() {
        bass_prod_path
    } else if bass_dev_path.exists() {
        bass_dev_path
    } else if bass_cwd_path.exists() {
        bass_cwd_path
    } else {
        PathBuf::from("bass.dll")
    };
    
    // Resolve bass_fx.dll path
    let fx_dev_path = exe_dir.join("bass_fx.dll");
    let mut fx_prod_path = exe_dir.clone();
    if let Some(ref dir) = app_dir {
        fx_prod_path = dir.join("native").join("bass_fx.dll");
    }
    let fx_cwd_path = std::env::current_dir().unwrap_or_default().join("native").join("bass_fx.dll");

    let fx_load_path = if fx_prod_path.exists() {
        fx_prod_path
    } else if fx_dev_path.exists() {
        fx_dev_path
    } else if fx_cwd_path.exists() {
        fx_cwd_path
    } else {
        PathBuf::from("bass_fx.dll")
    };

    let bass_path_str = bass_load_path.to_str().unwrap_or("bass.dll");
    let c_bass_path = CString::new(bass_path_str).map_err(|e| e.to_string())?;

    let fx_path_str = fx_load_path.to_str().unwrap_or("bass_fx.dll");
    let c_fx_path = CString::new(fx_path_str).map_err(|e| e.to_string())?;

    unsafe {
        let bass_handle = LoadLibraryA(PCSTR(c_bass_path.as_ptr() as *const u8)).map_err(|e| e.to_string())?;
        let fx_handle = LoadLibraryA(PCSTR(c_fx_path.as_ptr() as *const u8)).map_err(|e| e.to_string())?;
        
        let get_proc = |handle, name: &str| -> Result<*mut c_void, String> {
            let c_name = CString::new(name).unwrap();
            let addr = GetProcAddress(handle, PCSTR(c_name.as_ptr() as *const u8));
            match addr {
                Some(f) => Ok(f as *mut c_void),
                None => Err(format!("Could not find {} in DLL", name)),
            }
        };

        // Dummy call to initialize bass_fx.dll and register its plugins with the main BASS system
        if let Ok(version_func_ptr) = get_proc(fx_handle, "BASS_FX_GetVersion") {
            let get_version: GetVersionFn = std::mem::transmute(version_func_ptr);
            let version = get_version();
            println!("[BASS_FX DSP] Plugin registered. Version: {:#x}", version);
            if version == 0 {
                eprintln!("[BASS_FX DSP] CRITICAL ERROR: BASS_FX dummy call returned 0. DSP will fail.");
            }
        }

        let funcs = FXFuncs {
            set_fx: std::mem::transmute(get_proc(bass_handle, "BASS_ChannelSetFX")?),
            remove_fx: std::mem::transmute(get_proc(bass_handle, "BASS_ChannelRemoveFX")?),
            set_params: std::mem::transmute(get_proc(bass_handle, "BASS_FXSetParameters")?),
            get_params: std::mem::transmute(get_proc(bass_handle, "BASS_FXGetParameters")?),
        };

        let _ = FUNCS.set(funcs);
    }
    
    Ok(())
}

pub fn channel_set_fx(handle: u32, type_: u32, priority: i32) -> u32 {
    if let Some(f) = FUNCS.get() {
        unsafe { (f.set_fx)(handle, type_, priority) }
    } else {
        0
    }
}

pub fn channel_remove_fx(handle: u32, fx: u32) -> bool {
    if let Some(f) = FUNCS.get() {
        let res = unsafe { (f.remove_fx)(handle, fx) };
        res != 0
    } else {
        false
    }
}

pub fn fx_set_parameters(handle: u32, params: *const c_void) -> bool {
    if let Some(f) = FUNCS.get() {
        let res = unsafe { (f.set_params)(handle, params) };
        res != 0
    } else {
        false
    }
}

pub fn fx_get_parameters(handle: u32, params: *mut c_void) -> bool {
    if let Some(f) = FUNCS.get() {
        let res = unsafe { (f.get_params)(handle, params) };
        res != 0
    } else {
        false
    }
}
