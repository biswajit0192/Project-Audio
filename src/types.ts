export interface BackendTrackMetadata {
  file_path: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number;
  cover_art: string | null;
  sample_rate: number | null;
  bit_depth: number | null;
  bitrate: number | null;
  date_added: number | null;
}

export interface Track {
  id: string | number;
  path: string;
  fileName: string;
  title: string;
  artist: string;
  album: string;
  durationSecs: number;
  coverArt: string | null;
  sampleRate: number | null;
  bitDepth: number | null;
  bitrate: number | null;
  dateAdded?: number;
  waveformData?: number[];
}


export interface EQProfile {
  id: string;
  name: string;
  bandMode: '15-band' | '31-band';
  bandsJson: string;
  isFreqLocked: boolean;
  linkedDeviceName?: string | null;
  autoSwitchOnConnect: boolean;
  createdAt: number;
}
