use rusqlite::{params, Connection, Result as SqlResult};
use tauri::{AppHandle, Manager};
use std::path::PathBuf;
use crate::TrackMetadata;
use walkdir::WalkDir;
use rayon::prelude::*;
use std::collections::HashSet;
use lofty::probe::Probe;
use lofty::tag::Accessor;
use lofty::file::{AudioFile, TaggedFileExt};
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use std::path::Path;

// Get the path to the SQLite database managed by tauri-plugin-sql
pub fn get_db_path(app: &AppHandle) -> PathBuf {
    let mut path = app.path().app_local_data_dir().expect("Failed to get app data dir");
    path.push("project_audio.db");
    
    // Log the resolved path to desktop so we know exactly where it goes
    let _ = std::fs::write("C:\\Users\\mohan\\Desktop\\hertzsonic_db_path.txt", format!("DB Path resolved to: {:?}", path));
    
    path
}

pub fn ensure_schema(conn: &Connection) -> SqlResult<()> {
    // Check if the old playlists table exists with an INTEGER id (old schema)
    let is_old = conn.query_row(
        "SELECT type FROM pragma_table_info('playlists') WHERE name = 'id'",
        [],
        |row| row.get::<_, String>(0)
    ).unwrap_or_default() == "INTEGER";

    if is_old {
        conn.execute_batch(
            "DROP TABLE IF EXISTS playlist_tracks;
             DROP TABLE IF EXISTS playlists;"
        )?;
    }

    let has_cover_art = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('playlists') WHERE name = 'cover_art'",
        [],
        |row| row.get::<_, i32>(0)
    ).unwrap_or(0) > 0;

    if !is_old && !has_cover_art {
        let _ = conn.execute("ALTER TABLE playlists ADD COLUMN cover_art TEXT", []);
    }

    let has_date_added = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('music_tracks') WHERE name = 'date_added'",
        [],
        |row| row.get::<_, i32>(0)
    ).unwrap_or(0) > 0;

    if !has_date_added {
        let _ = conn.execute("ALTER TABLE music_tracks ADD COLUMN date_added INTEGER DEFAULT 0", []);
    }

    let has_waveform_data = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('music_tracks') WHERE name = 'waveform_data'",
        [],
        |row| row.get::<_, i32>(0)
    ).unwrap_or(0) > 0;

    if !has_waveform_data {
        let _ = conn.execute("ALTER TABLE music_tracks ADD COLUMN waveform_data TEXT", []);
    }

    // [TEMPORARY CLEANUP] Clear all cached waveform data
    let _ = conn.execute("UPDATE music_tracks SET waveform_data = NULL", []);

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS auth_users (
            id INTEGER PRIMARY KEY,
            email TEXT,
            username TEXT,
            token TEXT,
            is_logged_in INTEGER
        );
        CREATE TABLE IF NOT EXISTS music_tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT UNIQUE,
            title TEXT,
            artist TEXT,
            album TEXT,
            duration_secs INTEGER,
            sample_rate INTEGER,
            bit_depth INTEGER,
            bitrate INTEGER,
            cover_art_path TEXT,
            waveform_data TEXT,
            date_added INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            cover_art TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS playlist_tracks (
            playlist_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (playlist_id, file_path)
        );
        CREATE TABLE IF NOT EXISTS device_nicknames (
            hardware_name TEXT PRIMARY KEY,
            nickname TEXT NOT NULL,
            threshold_db REAL DEFAULT -17.0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS eq_profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            band_mode TEXT NOT NULL,
            bands_json TEXT NOT NULL,
            is_freq_locked BOOLEAN DEFAULT 1,
            linked_device_name TEXT,
            auto_switch_on_connect BOOLEAN DEFAULT 0,
            created_at INTEGER DEFAULT (cast(strftime('%s', 'now') as int))
        );
        CREATE TABLE IF NOT EXISTS app_settings (
            setting_key TEXT PRIMARY KEY,
            setting_value TEXT
        );
        "
    )?;
    
    // Safely add column for existing databases if it doesn't exist
    let _ = conn.execute("ALTER TABLE device_nicknames ADD COLUMN threshold_db REAL DEFAULT -17.0", params![]);
    
    Ok(())
}

#[tauri::command]
pub fn save_track_to_cache(app: tauri::AppHandle, track: TrackMetadata) -> Result<(), String> {
    let db_path = get_db_path(&app);
    
    // Ensure parent dir exists to avoid Connection::open failing
    if let Some(parent) = db_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    ensure_schema(&conn).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT OR REPLACE INTO music_tracks 
        (file_path, title, artist, album, duration_secs, sample_rate, bit_depth, bitrate, cover_art_path, date_added)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            track.file_path,
            track.title,
            track.artist,
            track.album,
            track.duration,
            track.sample_rate,
            track.bit_depth,
            track.bitrate,
            track.cover_art, // The cover_art field stores the base64 or path for now
            track.date_added.unwrap_or(0)
        ],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn cleanup_ghost_tracks(app: tauri::AppHandle) -> Result<usize, String> {
    let db_path = get_db_path(&app);
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    let mut missing_paths = Vec::new();
    {
        // Scope the prepare and query_map so the immutable borrow on `conn` is dropped
        let mut stmt = conn.prepare("SELECT file_path FROM music_tracks").map_err(|e| e.to_string())?;
        let paths_iter = stmt.query_map([], |row| {
            let path: String = row.get(0)?;
            Ok(path)
        }).map_err(|e| e.to_string())?;

        for path_result in paths_iter {
            if let Ok(path) = path_result {
                if !std::path::Path::new(&path).exists() {
                    missing_paths.push(path);
                }
            }
        }
    }

    let mut deleted_count = 0;
    if !missing_paths.is_empty() {
        let tx = conn.transaction().map_err(|e| e.to_string())?;
        for path in missing_paths {
            tx.execute("DELETE FROM music_tracks WHERE file_path = ?1", params![path])
                .map_err(|e| e.to_string())?;
            deleted_count += 1;
        }
        tx.commit().map_err(|e| e.to_string())?;
    }

    Ok(deleted_count)
}

#[tauri::command]
pub fn get_cached_library(app: tauri::AppHandle) -> Result<Vec<TrackMetadata>, String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    // Cleanup old base64 data which causes IPC/localStorage crashes
    let _ = conn.execute("DELETE FROM music_tracks WHERE cover_art_path LIKE 'data:%'", params![]);
    
    let mut stmt = conn.prepare(
        "SELECT file_path, title, artist, album, duration_secs, sample_rate, bit_depth, bitrate, cover_art_path, date_added FROM music_tracks ORDER BY id ASC"
    ).map_err(|e| e.to_string())?;
    
    let track_iter = stmt.query_map([], |row| {
        Ok(crate::TrackMetadata {
            file_path: row.get(0)?,
            title: row.get(1)?,
            artist: row.get(2)?,
            album: row.get(3)?,
            duration: row.get(4)?,
            sample_rate: row.get(5)?,
            bit_depth: row.get(6)?,
            bitrate: row.get(7)?,
            cover_art: row.get(8)?,
            date_added: row.get(9).ok(),
        })
    }).map_err(|e| e.to_string())?;

    let mut tracks = Vec::new();
    for track in track_iter {
        tracks.push(track.map_err(|e| e.to_string())?);
    }
    
    Ok(tracks)
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct Playlist {
    pub id: String,
    pub name: String,
    pub cover_art: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub fn create_playlist(app: tauri::AppHandle, name: String) -> Result<Playlist, String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();
    
    conn.execute(
        "INSERT INTO playlists (id, name) VALUES (?1, ?2)",
        params![&id, &name],
    ).map_err(|e| e.to_string())?;

    // Fetch it back to get the DB generated created_at
    let playlist = conn.query_row(
        "SELECT id, name, cover_art, created_at FROM playlists WHERE id = ?1",
        params![&id],
        |row| {
            Ok(Playlist {
                id: row.get(0)?,
                name: row.get(1)?,
                cover_art: row.get(2)?,
                created_at: row.get(3)?,
            })
        }
    ).map_err(|e| e.to_string())?;

    Ok(playlist)
}

#[tauri::command]
pub fn get_playlists(app: tauri::AppHandle) -> Result<Vec<Playlist>, String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT id, name, cover_art, created_at FROM playlists ORDER BY created_at ASC").map_err(|e| e.to_string())?;
    let playlist_iter = stmt.query_map([], |row| {
        Ok(Playlist {
            id: row.get(0)?,
            name: row.get(1)?,
            cover_art: row.get(2)?,
            created_at: row.get(3)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut playlists = Vec::new();
    for p in playlist_iter {
        playlists.push(p.map_err(|e| e.to_string())?);
    }
    Ok(playlists)
}

#[tauri::command]
pub fn update_playlist_cover(app: tauri::AppHandle, playlist_id: String, cover_art: Option<String>) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE playlists SET cover_art = ?1 WHERE id = ?2",
        params![cover_art, playlist_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_playlist(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    // Use a transaction to ensure both delete successfully
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM playlist_tracks WHERE playlist_id = ?1", params![&id]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM playlists WHERE id = ?1", params![&id]).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn add_track_to_playlist(app: tauri::AppHandle, playlist_id: String, file_path: String) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR IGNORE INTO playlist_tracks (playlist_id, file_path) VALUES (?1, ?2)",
        params![&playlist_id, &file_path],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn remove_track_from_playlist(app: tauri::AppHandle, playlist_id: String, file_path: String) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND file_path = ?2",
        params![&playlist_id, &file_path],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_playlist_tracks(app: tauri::AppHandle, playlist_id: String) -> Result<Vec<String>, String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT file_path FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY added_at ASC").map_err(|e| e.to_string())?;
    let path_iter = stmt.query_map(params![&playlist_id], |row| {
        row.get::<_, String>(0)
    }).map_err(|e| e.to_string())?;

    let mut paths = Vec::new();
    for p in path_iter {
        paths.push(p.map_err(|e| e.to_string())?);
    }
    
    Ok(paths)
}

#[tauri::command]
pub fn delete_track(app: tauri::AppHandle, file_path: String, use_trash: bool) -> Result<(), String> {
    // 1. Delete the physical file
    if use_trash {
        if let Err(e) = trash::delete(&file_path) {
            return Err(format!("Failed to move file to recycle bin: {}", e));
        }
    } else {
        if let Err(e) = std::fs::remove_file(&file_path) {
            return Err(format!("Failed to permanently delete file: {}", e));
        }
    }

    // 2. Remove it from the database (music_tracks table)
    let db_path = get_db_path(&app);
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    
    tx.execute(
        "DELETE FROM music_tracks WHERE file_path = ?1",
        params![file_path],
    ).map_err(|e| e.to_string())?;
    
    // We optionally remove it from playlist_tracks if you want, but SQLite foreign keys / cleanups usually handle or it won't crash the frontend.
    // Let's do it manually just in case
    tx.execute(
        "DELETE FROM playlist_tracks WHERE file_path = ?1",
        params![file_path],
    ).map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;
    
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SavedDevice {
    pub hardware_name: String,
    pub nickname: String,
    pub threshold_db: f64,
}

#[tauri::command]
pub fn set_device_nickname(app: tauri::AppHandle, hardware_name: String, nickname: String, threshold_db: f64) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT OR REPLACE INTO device_nicknames (hardware_name, nickname, threshold_db, updated_at) VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)",
        params![hardware_name, nickname, threshold_db],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_saved_devices(app: tauri::AppHandle) -> Result<Vec<SavedDevice>, String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare("SELECT hardware_name, nickname, threshold_db FROM device_nicknames ORDER BY updated_at DESC").map_err(|e| e.to_string())?;
    let device_iter = stmt.query_map([], |row| {
        Ok(SavedDevice {
            hardware_name: row.get(0)?,
            nickname: row.get(1)?,
            threshold_db: row.get(2).unwrap_or(-17.0),
        })
    }).map_err(|e| e.to_string())?;

    let mut devices = Vec::new();
    for dev in device_iter {
        devices.push(dev.map_err(|e| e.to_string())?);
    }
    
    Ok(devices)
}

#[tauri::command]
pub fn delete_device_nickname(app: tauri::AppHandle, hardware_name: String) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    conn.execute(
        "DELETE FROM device_nicknames WHERE hardware_name = ?1",
        params![hardware_name],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_or_generate_waveform(app: tauri::AppHandle, file_path: String) -> Result<Vec<f32>, String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;

    {
        let mut stmt = conn.prepare("SELECT waveform_data FROM music_tracks WHERE file_path = ?").map_err(|e| e.to_string())?;
        
        let mut rows = stmt.query(params![file_path]).map_err(|e| e.to_string())?;
        
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            if let Ok(Some(data_str)) = row.get::<_, Option<String>>(0) {
                if let Ok(data) = serde_json::from_str::<Vec<f32>>(&data_str) {
                    return Ok(data);
                }
            }
        }
    }
    
    let waveform = match generate_waveform_for_file(&file_path) {
        Ok(w) => w,
        Err(e) => return Err(e),
    };
    let serialized = serde_json::to_string(&waveform).map_err(|e| e.to_string())?;
    
    conn.execute(
        "UPDATE music_tracks SET waveform_data = ? WHERE file_path = ?",
        params![serialized, file_path],
    ).map_err(|e| e.to_string())?;
    
    Ok(waveform)
}

fn generate_waveform_for_file(path: &str) -> Result<Vec<f32>, String> {
    use std::fs::File;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::probe::Hint;
    use symphonia::core::audio::{AudioBufferRef, Signal};
    use symphonia::core::errors::Error;

    let file = Box::new(File::open(path).map_err(|e| e.to_string())?);
    let mss = MediaSourceStream::new(file, Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = std::path::Path::new(path).extension().and_then(|s| s.to_str()) {
        hint.with_extension(ext);
    }

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &Default::default(), &Default::default())
        .map_err(|e| format!("Failed to probe audio: {}", e))?;

    let mut format = probed.format;
    let track = format.default_track().ok_or("No default track")?;
    let track_id = track.id;

    let total_frames = track.codec_params.n_frames.unwrap_or(44100 * 180) as usize;
    let num_buckets = 100;
    let mut buckets = vec![0.0f32; num_buckets];

    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &Default::default())
        .map_err(|e| format!("Failed to create decoder: {}", e))?;

    // Calculate sample intervals based on total tracks duration
    let track_duration = track.codec_params.time_base
        .map(|tb| tb.calc_time(total_frames as u64))
        .unwrap_or(symphonia::core::units::Time { seconds: 180, frac: 0.0 });
    
    let interval_secs = (track_duration.seconds as f64 / num_buckets as f64).max(0.5);

    for i in 0..num_buckets {
        let seek_time = i as f64 * interval_secs;
        let seek_to = symphonia::core::formats::SeekTo::Time {
            time: symphonia::core::units::Time::new(seek_time as u64, seek_time.fract()),
            track_id: Some(track_id),
        };

        // Physically jump the reader directly to the timestamp checkpoint
        if format.seek(symphonia::core::formats::SeekMode::Coarse, seek_to).is_ok() {
            if let Ok(packet) = format.next_packet() {
                if let Ok(decoded) = decoder.decode(&packet) {
                    // Pull the absolute max amplitude from channel 0 for this snapshot packet
                    match decoded {
                        AudioBufferRef::S32(buf) => {
                            if let Some(&s) = buf.chan(0).iter().max_by(|&&a, &&b| (a as f32).abs().total_cmp(&(b as f32).abs())) {
                                buckets[i] = (s as f32 / 2147483648.0).abs();
                            }
                        }
                        AudioBufferRef::S24(buf) => {
                            if let Some(s) = buf.chan(0).iter().max_by(|&a, &b| (a.inner() as f32).abs().total_cmp(&(b.inner() as f32).abs())) {
                                buckets[i] = (s.inner() as f32 / 8388608.0).abs();
                            }
                        }
                        AudioBufferRef::S16(buf) => {
                            if let Some(&s) = buf.chan(0).iter().max_by(|&&a, &&b| (a as f32).abs().total_cmp(&(b as f32).abs())) {
                                buckets[i] = (s as f32 / 32768.0).abs();
                            }
                        }
                        AudioBufferRef::F32(buf) => {
                            if let Some(&s) = buf.chan(0).iter().max_by(|&&a, &&b| a.abs().total_cmp(&b.abs())) {
                                buckets[i] = s.abs();
                            }
                        }
                        AudioBufferRef::F64(buf) => {
                            if let Some(&s) = buf.chan(0).iter().max_by(|&&a, &&b| a.abs().total_cmp(&b.abs())) {
                                buckets[i] = s.abs() as f32;
                            }
                        }
                        AudioBufferRef::U8(buf) => {
                            if let Some(&s) = buf.chan(0).iter().max_by(|&&a, &&b| ((a as f32) - 128.0).abs().total_cmp(&((b as f32) - 128.0).abs())) {
                                buckets[i] = ((s as f32 - 128.0) / 128.0).abs();
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    // Normalize peaks across the 100 buckets
    let global_max = buckets.iter().cloned().fold(0.0f32, f32::max);
    if global_max > 0.0 {
        for b in &mut buckets {
            *b = (*b / global_max).max(0.08); // Ensure min height for aesthetic consistency
        }
    }

    Ok(buckets)
}

#[tauri::command]
pub fn scan_and_sync_library(app: tauri::AppHandle, folder_path: String) -> Result<usize, String> {
    let db_path = get_db_path(&app);
    let mut conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    // Step A: Load existing file_paths into a HashSet
    let mut existing_paths = HashSet::new();
    {
        let mut stmt = conn.prepare("SELECT file_path FROM music_tracks").map_err(|e| e.to_string())?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0)).map_err(|e| e.to_string())?;
        for path in rows {
            if let Ok(p) = path {
                existing_paths.insert(p);
            }
        }
    }

    // Step B: Discover new files
    let mut new_files = Vec::new();
    let extensions = ["mp3", "m4a", "flac", "wav", "aac"];
    
    for entry in WalkDir::new(&folder_path).into_iter().filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_file() {
            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                if extensions.contains(&ext.to_lowercase().as_str()) {
                    if let Some(path_str) = path.to_str() {
                        let path_string = path_str.to_string();
                        // Step C: Filter out existing files
                        if !existing_paths.contains(&path_string) {
                            new_files.push(path_string);
                        }
                    }
                }
            }
        }
    }

    if new_files.is_empty() {
        // Run cleanup even if no new tracks
        let _ = cleanup_ghost_tracks_in_folder(&mut conn, &folder_path, &existing_paths);
        return Ok(0);
    }

    let app_dir = app.path().app_local_data_dir().ok();

    // Step D: Parallel Metadata Extraction
    let parsed_tracks: Vec<TrackMetadata> = new_files
        .par_iter()
        .filter_map(|file_path| {
            let path = Path::new(file_path);
            let tagged_file = Probe::open(path).ok()?.read().ok()?;

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
                    if !t.is_empty() { title = t.to_string(); }
                }
                artist = tag.artist().map(|s| s.to_string());
                album = tag.album().map(|s| s.to_string());

                if let Some(pic) = tag.pictures().first() {
                    if let Some(ref dir) = app_dir {
                        let covers_dir = dir.join("covers");
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

            Some(TrackMetadata {
                file_path: file_path.clone(),
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
        })
        .collect();

    let new_tracks_count = parsed_tracks.len();

    // Step E: Single SQLite Transaction
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    {
        let mut stmt = tx.prepare(
            "INSERT OR REPLACE INTO music_tracks 
            (file_path, title, artist, album, duration_secs, sample_rate, bit_depth, bitrate, cover_art_path, date_added)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"
        ).map_err(|e| e.to_string())?;

        for track in parsed_tracks {
            let _ = stmt.execute(params![
                track.file_path,
                track.title,
                track.artist,
                track.album,
                track.duration,
                track.sample_rate,
                track.bit_depth,
                track.bitrate,
                track.cover_art,
                track.date_added.unwrap_or(0)
            ]);
        }
    }
    
    // Ghost track cleanup scoped to the folder being scanned
    for existing_path in existing_paths.iter() {
        if existing_path.starts_with(&folder_path) {
            if !Path::new(existing_path).exists() {
                let _ = tx.execute("DELETE FROM music_tracks WHERE file_path = ?1", params![existing_path]);
                let _ = tx.execute("DELETE FROM playlist_tracks WHERE file_path = ?1", params![existing_path]);
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    Ok(new_tracks_count)
}

fn cleanup_ghost_tracks_in_folder(conn: &mut Connection, folder_path: &str, existing_paths: &HashSet<String>) -> SqlResult<()> {
    let tx = conn.transaction()?;
    for existing_path in existing_paths.iter() {
        if existing_path.starts_with(folder_path) {
            if !Path::new(existing_path).exists() {
                let _ = tx.execute("DELETE FROM music_tracks WHERE file_path = ?1", params![existing_path]);
                let _ = tx.execute("DELETE FROM playlist_tracks WHERE file_path = ?1", params![existing_path]);
            }
        }
    }
    tx.commit()?;
    Ok(())
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EQProfile {
    pub id: String,
    pub name: String,
    pub band_mode: String,
    pub bands_json: String,
    pub is_freq_locked: bool,
    pub linked_device_name: Option<String>,
    pub auto_switch_on_connect: bool,
    pub created_at: i64,
}

#[tauri::command]
pub fn save_eq_profile(app: tauri::AppHandle, profile: EQProfile) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO eq_profiles 
         (id, name, band_mode, bands_json, is_freq_locked, linked_device_name, auto_switch_on_connect, created_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           band_mode = excluded.band_mode,
           bands_json = excluded.bands_json,
           is_freq_locked = excluded.is_freq_locked,
           linked_device_name = excluded.linked_device_name,
           auto_switch_on_connect = excluded.auto_switch_on_connect;",
        params![
            profile.id,
            profile.name,
            profile.band_mode,
            profile.bands_json,
            profile.is_freq_locked,
            profile.linked_device_name,
            profile.auto_switch_on_connect,
            profile.created_at
        ],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn load_eq_profiles(app: tauri::AppHandle) -> Result<Vec<EQProfile>, String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    // Seed default profiles if empty
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM eq_profiles", [], |row| row.get(0)).unwrap_or(0);
    if count == 0 {
        // Seed Flat profile
        let flat_bands = serde_json::json!({
            "bands15": [],
            "bands31": []
        });
        let _ = conn.execute(
            "INSERT INTO eq_profiles (id, name, band_mode, bands_json, is_freq_locked, auto_switch_on_connect, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params!["default-flat", "Flat", "15-band", flat_bands.to_string(), true, false, 0]
        );
        let _ = conn.execute(
            "INSERT INTO eq_profiles (id, name, band_mode, bands_json, is_freq_locked, auto_switch_on_connect, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params!["default-bass-boost", "Bass Boost", "15-band", flat_bands.to_string(), true, false, 0]
        );
        let _ = conn.execute(
            "INSERT INTO eq_profiles (id, name, band_mode, bands_json, is_freq_locked, auto_switch_on_connect, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params!["default-vocal", "Vocal Clarity", "15-band", flat_bands.to_string(), true, false, 0]
        );
        let _ = conn.execute(
            "INSERT INTO eq_profiles (id, name, band_mode, bands_json, is_freq_locked, auto_switch_on_connect, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params!["default-treble", "Treble Boost", "15-band", flat_bands.to_string(), true, false, 0]
        );
    }

    let mut stmt = conn.prepare("SELECT id, name, band_mode, bands_json, is_freq_locked, linked_device_name, auto_switch_on_connect, created_at FROM eq_profiles ORDER BY created_at ASC").map_err(|e| e.to_string())?;
    let profile_iter = stmt.query_map([], |row| {
        Ok(EQProfile {
            id: row.get(0)?,
            name: row.get(1)?,
            band_mode: row.get(2)?,
            bands_json: row.get(3)?,
            is_freq_locked: row.get(4)?,
            linked_device_name: row.get(5)?,
            auto_switch_on_connect: row.get(6)?,
            created_at: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut profiles = Vec::new();
    for p in profile_iter {
        profiles.push(p.map_err(|e| e.to_string())?);
    }

    Ok(profiles)
}

#[tauri::command]
pub fn delete_eq_profile(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM eq_profiles WHERE id = ?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_setting(app: &AppHandle, key: &str) -> Result<Option<String>, String> {
    let db_path = get_db_path(app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare("SELECT setting_value FROM app_settings WHERE setting_key = ?1").map_err(|e| e.to_string())?;
    let mut rows = stmt.query(params![key]).map_err(|e| e.to_string())?;
    
    if let Some(row) = rows.next().map_err(|e| e.to_string())? {
        let value: String = row.get(0).map_err(|e| e.to_string())?;
        Ok(Some(value))
    } else {
        Ok(None)
    }
}

pub fn set_setting(app: &AppHandle, key: &str, value: &str) -> Result<(), String> {
    let db_path = get_db_path(app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    conn.execute(
        "INSERT INTO app_settings (setting_key, setting_value) VALUES (?1, ?2)
         ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value",
        params![key, value],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}
