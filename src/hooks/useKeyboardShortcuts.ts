import { useEffect } from 'react';
import { ShortcutConfig } from '../types/shortcuts';

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Ignore keystrokes if the user is typing in an input field
      const target = e.target as HTMLElement;
      if (
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
        target.isContentEditable
      ) {
        return;
      }

      // 2. Find a matching shortcut in our dynamic configuration
      const match = shortcuts.find(s => 
        s.key.toLowerCase() === e.key.toLowerCase() && 
        !!s.ctrlKey === e.ctrlKey && 
        !!s.shiftKey === e.shiftKey && 
        !!s.altKey === e.altKey
      );

      if (!match) return;
      
      // Stop default browser behavior (e.g., Spacebar scrolling down, Arrows scrolling)
      e.preventDefault(); 

      // 3. Dispatch the Action globally so PlayerBar can consume it
      window.dispatchEvent(
        new CustomEvent('shortcut-action', { detail: { action: match.action } })
      );
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]); 
}
