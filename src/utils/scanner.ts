import { invoke } from '@tauri-apps/api/core';
import { BackendTrackMetadata } from '../types';

export const scanAndCacheFolder = async (path: string): Promise<void> => {
  const rawPaths: string[] = await invoke('scan_for_music', { folderPath: path });

  for (let i = 0; i < rawPaths.length; i++) {
    const filePath = rawPaths[i];
    const fileName = filePath.split('\\').pop()?.split('/').pop() || 'Unknown';
    
    try {
      const meta: BackendTrackMetadata = await invoke('get_track_metadata', { filePath });
      try {
        await invoke('save_track_to_cache', { track: meta });
      } catch (dbErr) {
        console.error('DB save error:', dbErr);
      }
    } catch (e) {
      console.error(`Failed to read metadata for ${filePath}:`, e);
      const fallbackMeta: BackendTrackMetadata = {
        file_path: filePath,
        title: fileName,
        artist: null,
        album: null,
        duration: 0,
        cover_art: null,
        sample_rate: null,
        bit_depth: null,
        bitrate: null
      };
      
      try {
        await invoke('save_track_to_cache', { track: fallbackMeta });
      } catch (dbErr) {
        console.error('DB save error:', dbErr);
      }
    }
  }
};
