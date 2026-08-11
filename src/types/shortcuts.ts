export type ShortcutAction = 
  | 'PLAY_PAUSE' 
  | 'SKIP_FORWARD_10' 
  | 'SKIP_BACKWARD_10' 
  | 'NEXT_TRACK' 
  | 'PREV_TRACK' 
  | 'VOLUME_UP' 
  | 'VOLUME_DOWN' 
  | 'TOGGLE_MUTE';

export interface ShortcutConfig {
  action: ShortcutAction;
  key: string;       // e.g., 'ArrowRight', ' ', 'm'
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
}

// Default configuration
export const defaultShortcuts: ShortcutConfig[] = [
  { action: 'PLAY_PAUSE', key: ' ' },
  { action: 'SKIP_FORWARD_10', key: 'ArrowRight' },
  { action: 'SKIP_BACKWARD_10', key: 'ArrowLeft' },
  { action: 'NEXT_TRACK', key: 'ArrowRight', ctrlKey: true },
  { action: 'PREV_TRACK', key: 'ArrowLeft', ctrlKey: true },
  { action: 'VOLUME_UP', key: 'ArrowUp' },
  { action: 'VOLUME_DOWN', key: 'ArrowDown' },
  { action: 'TOGGLE_MUTE', key: 'm' }
];

export const actionLabels: Record<ShortcutAction, string> = {
  'PLAY_PAUSE': 'Play / Pause',
  'SKIP_FORWARD_10': 'Seek Forward 10s',
  'SKIP_BACKWARD_10': 'Seek Backward 10s',
  'NEXT_TRACK': 'Next Track',
  'PREV_TRACK': 'Previous Track',
  'VOLUME_UP': 'Volume Up',
  'VOLUME_DOWN': 'Volume Down',
  'TOGGLE_MUTE': 'Toggle Mute'
};
