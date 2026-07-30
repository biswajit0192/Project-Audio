use rusqlite::{params, Connection, Result as SqlResult};
use tauri::{AppHandle, Manager};
use std::path::PathBuf;
use crate::TrackMetadata;

// Get the path to the SQLite database managed by tauri-plugin-sql
pub fn get_db_path(app: &AppHandle) -> PathBuf {
    let mut path = app.path().app_local_data_dir().expect("Failed to get app data dir");
    path.push("project_audio.db");
    
    // Log the resolved path to desktop so we know exactly where it goes
    let _ = std::fs::write("C:\\Users\\mohan\\Desktop\\hertzsonic_db_path.txt", format!("DB Path resolved to: {:?}", path));
    
    path
}

pub fn ensure_schema(conn: &Connection) -> SqlResult<()> {
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
            cover_art_path TEXT
        );
        CREATE TABLE IF NOT EXISTS playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS playlist_tracks (
            playlist_id INTEGER,
            track_id INTEGER,
            track_order INTEGER,
            PRIMARY KEY (playlist_id, track_id),
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
            FOREIGN KEY (track_id) REFERENCES music_tracks(id) ON DELETE CASCADE
        );
        "
    )?;
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
        (file_path, title, artist, album, duration_secs, sample_rate, bit_depth, bitrate, cover_art_path)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            track.file_path,
            track.title,
            track.artist,
            track.album,
            track.duration,
            track.sample_rate,
            track.bit_depth,
            track.bitrate,
            track.cover_art // The cover_art field stores the base64 or path for now
        ],
    ).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[tauri::command]
pub fn get_cached_library(app: tauri::AppHandle) -> Result<Vec<TrackMetadata>, String> {
    let db_path = get_db_path(&app);
    let conn = Connection::open(&db_path).map_err(|e| e.to_string())?;
    
    ensure_schema(&conn).map_err(|e| e.to_string())?;
    
    let mut stmt = conn.prepare(
        "SELECT file_path, title, artist, album, duration_secs, sample_rate, bit_depth, bitrate, cover_art_path FROM music_tracks"
    ).map_err(|e| e.to_string())?;
    
    let track_iter = stmt.query_map([], |row| {
        Ok(TrackMetadata {
            file_path: row.get(0)?,
            title: row.get(1)?,
            artist: row.get(2)?,
            album: row.get(3)?,
            duration: row.get(4)?,
            sample_rate: row.get(5)?,
            bit_depth: row.get(6)?,
            bitrate: row.get(7)?,
            cover_art: row.get(8)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut tracks = Vec::new();
    for track in track_iter {
        tracks.push(track.map_err(|e| e.to_string())?);
    }
    
    Ok(tracks)
}
