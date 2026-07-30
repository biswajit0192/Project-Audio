import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Track } from '../types';

export type RepeatMode = 'off' | 'one' | 'all';

interface QueueContextType {
  queue: Track[];
  currentIndex: number;
  currentTrack: Track | null;
  isShuffled: boolean;
  repeatMode: RepeatMode;
  playContext: (tracks: Track[], startIndex: number) => void;
  playNext: (track: Track) => void;
  addToQueue: (track: Track) => void;
  nextTrack: () => void;
  previousTrack: () => void;
  removeFromQueue: (index: number) => void;
  toggleShuffle: () => void;
  toggleRepeat: () => void;
}

const QueueContext = createContext<QueueContextType | undefined>(undefined);

export const QueueProvider = ({ children }: { children: ReactNode }) => {
  // Initialize state from localStorage if available
  const [queue, setQueue] = useState<Track[]>(() => {
    const saved = localStorage.getItem('hertzsonic_queue');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    const saved = localStorage.getItem('hertzsonic_queue_index');
    return saved ? parseInt(saved, 10) : -1;
  });

  const [isShuffled, setIsShuffled] = useState<boolean>(() => {
    const saved = localStorage.getItem('hertzsonic_is_shuffled');
    return saved ? JSON.parse(saved) : false;
  });

  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() => {
    const saved = localStorage.getItem('hertzsonic_repeat_mode');
    return saved ? (saved as RepeatMode) : 'off';
  });

  // Derived state
  const currentTrack = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

  // Persist state changes
  useEffect(() => {
    try {
      // Strip coverArt (large base64 strings) before saving to prevent QuotaExceededError
      const queueToSave = queue.map(t => ({ ...t, coverArt: null }));
      localStorage.setItem('hertzsonic_queue', JSON.stringify(queueToSave));
      localStorage.setItem('hertzsonic_queue_index', currentIndex.toString());
      localStorage.setItem('hertzsonic_is_shuffled', JSON.stringify(isShuffled));
      localStorage.setItem('hertzsonic_repeat_mode', repeatMode);
      
      // Also keep the simple 'last_track' in sync just in case any old logic relies on it temporarily
      if (currentTrack) {
        localStorage.setItem('hertzsonic_last_track', JSON.stringify({ ...currentTrack, coverArt: null }));
      }
    } catch (error) {
      console.error('Failed to save queue to localStorage:', error);
    }
  }, [queue, currentIndex, isShuffled, repeatMode, currentTrack]);

  const playContext = (tracks: Track[], startIndex: number) => {
    setQueue(tracks);
    setCurrentIndex(startIndex >= 0 && startIndex < tracks.length ? startIndex : 0);
  };

  const playNext = (track: Track) => {
    if (queue.length === 0) {
      setQueue([track]);
      setCurrentIndex(0);
      return;
    }
    
    const newQueue = [...queue];
    newQueue.splice(currentIndex + 1, 0, track);
    setQueue(newQueue);
  };

  const addToQueue = (track: Track) => {
    if (queue.length === 0) {
      setQueue([track]);
      setCurrentIndex(0);
      return;
    }
    setQueue([...queue, track]);
  };

  const nextTrack = () => {
    if (queue.length === 0) return;
    
    if (repeatMode === 'one') {
      // Repeat the exact same track (audio player usually handles rewinding, but we emit a state update to force re-render if needed, though strictly index doesn't change)
      // We'll leave index identical. The PlayerBar needs to handle 'repeat one' correctly on 'ended' event.
      // If user explicitly clicks "Next", should it go to the next track even if repeat is 'one'? Standard behavior: yes.
      // We will allow manual Next to bypass 'repeat one'.
    }

    if (isShuffled) {
      // Simple random index
      const randomIndex = Math.floor(Math.random() * queue.length);
      setCurrentIndex(randomIndex);
    } else {
      if (currentIndex < queue.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        // At the end of the queue
        if (repeatMode === 'all') {
          setCurrentIndex(0);
        } else {
          // Stop playing (or stay at last track). We'll keep it at the last track for now.
        }
      }
    }
  };

  const previousTrack = () => {
    if (queue.length === 0) return;
    
    // Standard behavior: clicking previous within the first few seconds goes to previous track, otherwise restarts current track.
    // For context manager, we just go to the previous index. The PlayerBar can implement the 3-second threshold logic and just seek to 0 if needed.
    
    if (isShuffled) {
      // If shuffled and we didn't track history, just go to a random track (or previous index normally).
      // We'll just decrement index safely for now.
      if (currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      } else if (repeatMode === 'all') {
        setCurrentIndex(queue.length - 1);
      }
    } else {
      if (currentIndex > 0) {
        setCurrentIndex(currentIndex - 1);
      } else {
        // At the start
        if (repeatMode === 'all') {
          setCurrentIndex(queue.length - 1);
        } else {
          setCurrentIndex(0);
        }
      }
    }
  };

  const removeFromQueue = (index: number) => {
    if (index < 0 || index >= queue.length) return;
    
    const newQueue = [...queue];
    newQueue.splice(index, 1);
    
    if (newQueue.length === 0) {
      setQueue([]);
      setCurrentIndex(-1);
    } else {
      setQueue(newQueue);
      if (currentIndex === index) {
        // We removed the playing track, play the next one (which falls into the same index)
        if (currentIndex >= newQueue.length) {
          setCurrentIndex(newQueue.length - 1);
        }
      } else if (currentIndex > index) {
        // We removed a track before the current one
        setCurrentIndex(currentIndex - 1);
      }
    }
  };

  const toggleShuffle = () => setIsShuffled(!isShuffled);

  const toggleRepeat = () => {
    setRepeatMode(prev => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  };

  return (
    <QueueContext.Provider
      value={{
        queue,
        currentIndex,
        currentTrack,
        isShuffled,
        repeatMode,
        playContext,
        playNext,
        addToQueue,
        nextTrack,
        previousTrack,
        removeFromQueue,
        toggleShuffle,
        toggleRepeat,
      }}
    >
      {children}
    </QueueContext.Provider>
  );
};

export const useQueue = () => {
  const context = useContext(QueueContext);
  if (context === undefined) {
    throw new Error('useQueue must be used within a QueueProvider');
  }
  return context;
};
