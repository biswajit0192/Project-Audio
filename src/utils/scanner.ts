import { invoke } from '@tauri-apps/api/core';
import { BackendTrackMetadata } from '../types';

export const scanAndCacheFolder = async (path: string): Promise<number> => {
  try {
    const newTracksAdded: number = await invoke('scan_and_sync_library', { folderPath: path });
    return newTracksAdded;
  } catch (err) {
    console.error('Failed to scan and sync library:', err);
    throw err;
  }
};
