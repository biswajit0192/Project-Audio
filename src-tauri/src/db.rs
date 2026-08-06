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
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS playlist_tracks (
            playlist_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (playlist_id, file_path)
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

    // Cleanup old base64 data which causes IPC/localStorage crashes
    let _ = conn.execute("DELETE FROM music_tracks WHERE cover_art_path LIKE 'data:%'", params![]);
    
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

#[derive(serde::Serialize, serde::Deserialize)]
pub struct Playlist {
    pub id: String,
    pub name: String,
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
        "SELECT id, name, created_at FROM playlists WHERE id = ?1",
        params![&id],
        |row| {
            Ok(Playlist {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
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

    let mut stmt = conn.prepare("SELECT id, name, created_at FROM playlists ORDER BY created_at ASC").map_err(|e| e.to_string())?;
    let playlist_iter = stmt.query_map([], |row| {
        Ok(Playlist {
            id: row.get(0)?,
            name: row.get(1)?,
            created_at: row.get(2)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut playlists = Vec::new();
    for p in playlist_iter {
        playlists.push(p.map_err(|e| e.to_string())?);
    }
    Ok(playlists)
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
