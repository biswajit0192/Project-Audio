import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

const shuffleArray = (array: Track[], keepFirstItem?: Track) => {
  let toShuffle = [...array];
  if (keepFirstItem) {
    toShuffle = toShuffle.filter(t => t.id !== keepFirstItem.id);
  }
  for (let i = toShuffle.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [toShuffle[i], toShuffle[j]] = [toShuffle[j], toShuffle[i]];
  }
  if (keepFirstItem) {
    toShuffle.unshift(keepFirstItem);
  }
  return toShuffle;
};

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

  const [originalQueue, setOriginalQueue] = useState<Track[]>(() => {
    const saved = localStorage.getItem('hertzsonic_original_queue');
    return saved ? JSON.parse(saved) : [];
  });

  // Derived state
  const currentTrack = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

  useEffect(() => {
    try {
      // Safety net: never save massive base64 strings to localStorage to prevent QuotaExceededError
      const sanitizeQueue = (q: Track[]) => q.map(t => ({
        ...t,
        coverArt: t.coverArt?.startsWith('data:') ? undefined : t.coverArt
      }));

      const queueToSave = sanitizeQueue(queue);
      const originalQueueToSave = sanitizeQueue(originalQueue);
      
      localStorage.setItem('hertzsonic_queue', JSON.stringify(queueToSave));
      localStorage.setItem('hertzsonic_queue_index', currentIndex.toString());
      localStorage.setItem('hertzsonic_is_shuffled', JSON.stringify(isShuffled));
      localStorage.setItem('hertzsonic_repeat_mode', repeatMode);
      
      if (currentTrack) {
        const trackToSave = { ...currentTrack, coverArt: currentTrack.coverArt?.startsWith('data:') ? undefined : currentTrack.coverArt };
        localStorage.setItem('hertzsonic_last_track', JSON.stringify(trackToSave));
      }
      localStorage.setItem('hertzsonic_original_queue', JSON.stringify(originalQueueToSave));
    } catch (error) {
      console.error('Failed to save queue to localStorage:', error);
      alert('Failed to save queue: ' + error);
    }
  }, [queue, originalQueue, currentIndex, isShuffled, repeatMode, currentTrack]);

  const playContext = (tracks: Track[], startIndex: number) => {
    setOriginalQueue(tracks);
    if (isShuffled) {
      const startTrack = tracks[startIndex >= 0 && startIndex < tracks.length ? startIndex : 0];
      const shuffled = shuffleArray(tracks, startTrack);
      setQueue(shuffled);
      setCurrentIndex(0);
    } else {
      setQueue(tracks);
      setCurrentIndex(startIndex >= 0 && startIndex < tracks.length ? startIndex : 0);
    }
  };

  const playNext = (track: Track) => {
    if (queue.length === 0) {
      setQueue([track]);
      setOriginalQueue([track]);
      setCurrentIndex(0);
      return;
    }
    
    const newQueue = [...queue];
    newQueue.splice(currentIndex + 1, 0, track);
    setQueue(newQueue);

    const origIdx = originalQueue.findIndex(t => t.id === currentTrack?.id);
    const newOrig = [...originalQueue];
    newOrig.splice(origIdx !== -1 ? origIdx + 1 : originalQueue.length, 0, track);
    setOriginalQueue(newOrig);
  };

  const addToQueue = (track: Track) => {
    if (queue.length === 0) {
      setQueue([track]);
      setOriginalQueue([track]);
      setCurrentIndex(0);
      return;
    }
    setQueue([...queue, track]);
    setOriginalQueue([...originalQueue, track]);
  };

  const nextTrack = () => {
    if (queue.length === 0) return;

    if (currentIndex < queue.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      if (repeatMode === 'all') {
        setCurrentIndex(0);
      }
    }
  };

  const previousTrack = () => {
    if (queue.length === 0) return;
    
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    } else {
      if (repeatMode === 'all') {
        setCurrentIndex(queue.length - 1);
      } else {
        setCurrentIndex(0);
      }
    }
  };

  const removeFromQueue = (index: number) => {
    if (index < 0 || index >= queue.length) return;
    const trackToRemove = queue[index];
    
    const newQueue = [...queue];
    newQueue.splice(index, 1);
    
    const newOrig = originalQueue.filter(t => t.id !== trackToRemove.id);
    setOriginalQueue(newOrig);
    
    if (newQueue.length === 0) {
      setQueue([]);
      setCurrentIndex(-1);
    } else {
      setQueue(newQueue);
      if (currentIndex === index) {
        if (currentIndex >= newQueue.length) {
          setCurrentIndex(newQueue.length - 1);
        }
      } else if (currentIndex > index) {
        setCurrentIndex(currentIndex - 1);
      }
    }
  };

  const toggleShuffle = () => {
    setIsShuffled(prev => {
      const newState = !prev;
      if (newState) {
        if (originalQueue.length === 0) {
           setOriginalQueue(queue);
        }
        const current = queue[currentIndex];
        const shuffled = shuffleArray(originalQueue.length > 0 ? originalQueue : queue, current);
        setQueue(shuffled);
        setCurrentIndex(0);
      } else {
        if (originalQueue.length > 0) {
          setQueue(originalQueue);
          const current = queue[currentIndex];
          const newIdx = originalQueue.findIndex(t => t.id === current?.id);
          setCurrentIndex(newIdx !== -1 ? newIdx : 0);
        }
      }
      return newState;
    });
  };

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
