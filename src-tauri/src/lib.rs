// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use std::path::Path;
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

pub struct AudioState {
    pub stream: Mutex<Option<u32>>,
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

#[tauri::command]
fn play_audio(file_path: String, state: tauri::State<'_, AudioState>) -> Result<String, String> {
    let mut stream_guard = state.stream.lock().unwrap();

    // If there's an already active stream, stop and free it so they don't overlap (layer)
    if let Some(old_stream) = *stream_guard {
        bass_sys::BASS_ChannelStop(old_stream);
        bass_sys::BASS_StreamFree(old_stream);
    }

    // Encode path to wide string (UTF-16) for Windows BASS_UNICODE
    let wide_path: Vec<u16> = OsStr::new(&file_path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    // Try to create the new stream using UTF-16
    let stream = bass_sys::BASS_StreamCreateFile(
        0, // FALSE (streaming from a file, not memory)
        wide_path.as_ptr() as *const c_void,
        0,
        0,
        bass_sys::BASS_UNICODE,
    );

    if stream == 0 {
        return Err("Failed to create BASS audio stream. Ensure path is correct and format is supported.".into());
    }

    // Play the stream
    let success = bass_sys::BASS_ChannelPlay(stream, 0);
    
    if success == 0 {
        return Err("Failed to play the BASS audio stream.".into());
    }

    unsafe extern "C" fn sync_end_callback(_handle: u32, _channel: u32, _data: u32, _user: *mut c_void) {
        if let Some(app) = APP_HANDLE.get() {
            let _ = app.emit("track-ended", ());
        }
    }
    
    // BASS_SYNC_END = 2
    bass_sys::BASS_ChannelSetSync(stream, 2, 0, sync_end_callback as *mut _, std::ptr::null_mut());

    // Store the new stream handle
    *stream_guard = Some(stream);
    Ok("Playing audio successfully".into())
}

#[tauri::command]
fn pause_audio(state: tauri::State<'_, AudioState>) -> Result<String, String> {
    let stream_guard = state.stream.lock().unwrap();
    if let Some(stream) = *stream_guard {
        bass_sys::BASS_ChannelPause(stream);
        Ok("Paused audio".into())
    } else {
        Err("No audio stream active".into())
    }
}

#[tauri::command]
fn resume_audio(state: tauri::State<'_, AudioState>) -> Result<String, String> {
    let stream_guard = state.stream.lock().unwrap();
    if let Some(stream) = *stream_guard {
        bass_sys::BASS_ChannelPlay(stream, 0);
        Ok("Resumed audio".into())
    } else {
        Err("No audio stream active".into())
    }
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

    tauri::Builder::default()
        .manage(AudioState { stream: Mutex::new(None) })
        .plugin(tauri_plugin_sql::Builder::default().add_migrations("sqlite:project_audio.db", migrations).build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet, scan_for_music, get_track_metadata, play_audio, pause_audio, resume_audio, get_audio_position, seek_audio, reveal_track_in_explorer, volume::set_system_volume, volume::get_system_volume, volume::get_audio_devices, volume::switch_audio_device, volume::get_current_audio_device,
            db::save_track_to_cache, db::get_cached_library,
            db::create_playlist, db::get_playlists, db::delete_playlist, db::add_track_to_playlist, db::remove_track_from_playlist, db::get_playlist_tracks, db::delete_track, db::update_playlist_cover,
            db::set_device_nickname, db::get_saved_devices, db::delete_device_nickname
        ])
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
