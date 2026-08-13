import { useState, useEffect, useRef } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './PlayerBar.scss';
import { Heart } from 'lucide-react';

// Center Icons
import IconShuffle from '../../assets/playing-tab-icons/Suffle Songs.svg?react';
import IconShuffleActive from '../../assets/playing-tab-icons/Suffle Songs Active.svg?react';
import IconPlay from '../../assets/playing-tab-icons/Play Btn.svg?react';
import IconPause from '../../assets/playing-tab-icons/Pause Btn.svg?react';
import IconPrev from '../../assets/playing-tab-icons/Next Track.svg?react';
import IconNext from '../../assets/playing-tab-icons/Previous Track.svg?react';
import IconRepeat from '../../assets/playing-tab-icons/Repeat Btn.svg?react';

// Right Icons
import IconQueue from '../../assets/playing-tab-icons/Queue.svg?react';
import IconEq from '../../assets/playing-tab-icons/Equalizer.svg?react';
import IconVolume from '../../assets/playing-tab-icons/Volume.svg?react';
import IconMute from '../../assets/playing-tab-icons/mute.svg?react';
import IconLock from '../../assets/playing-tab-icons/Lock.svg?react';
import IconHeadphones from '../../assets/playing-tab-icons/Headphones.svg?react';
import { useQueue } from '../../context/QueueContext';

export default function PlayerBar() {
  const { currentTrack, nextTrack, previousTrack, isShuffled, toggleShuffle, repeatMode, toggleRepeat } = useQueue();
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
    window.dispatchEvent(new CustomEvent('player-state-changed', { detail: { isPlaying } }));
  }, [isPlaying]);

  useEffect(() => {
    const handleRequest = () => {
      window.dispatchEvent(new CustomEvent('player-state-changed', { detail: { isPlaying: isPlayingRef.current } }));
    };
    window.addEventListener('request-player-state', handleRequest);
    return () => window.removeEventListener('request-player-state', handleRequest);
  }, []);

  const [playingTrackPath, setPlayingTrackPath] = useState<string | null>(currentTrack?.path || null);
  const isLoadedInBackend = useRef(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [waveformData, setWaveformData] = useState<number[]>([]);
  const [isWaveformLoading, setIsWaveformLoading] = useState(false);
  const currentTimeRef = useRef(currentTime);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const [isDragging, setIsDragging] = useState(false);
  const progressTrackRef = useRef<HTMLDivElement>(null);

  const [volumeDb, setVolumeDb] = useState<number>(-4.0);
  const [prevVolumeDb, setPrevVolumeDb] = useState<number>(-4.0);
  const isVolumeDraggingRef = useRef(false);
  const volumeTrackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchWaveform = async () => {
      if (currentTrack) {
        setIsWaveformLoading(true);
        try {
          if (currentTrack.waveformData) {
            setWaveformData(currentTrack.waveformData);
          } else {
            const data: number[] = await invoke('get_or_generate_waveform', { filePath: currentTrack.path });
            setWaveformData(data);
          }
        } catch (e) {
          console.error("Failed to load waveform:", e);
          setWaveformData([]);
        } finally {
          setIsWaveformLoading(false);
        }
      }
    };

    fetchWaveform();
  }, [currentTrack]);

  const volumeDbRef = useRef(volumeDb);
  useEffect(() => {
    volumeDbRef.current = volumeDb;
  }, [volumeDb]);

  const nextTrackRef = useRef(nextTrack);
  useEffect(() => {
    nextTrackRef.current = nextTrack;
  }, [nextTrack]);

  const previousTrackRef = useRef(previousTrack);
  useEffect(() => {
    previousTrackRef.current = previousTrack;
  }, [previousTrack]);

  const handlePlayClickRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let unlistenFn: (() => void) | undefined;
    let unlistenNext: (() => void) | undefined;
    let unlistenPrev: (() => void) | undefined;
    let unlistenToggle: (() => void) | undefined;
    
    listen('track-ended', () => {
      nextTrackRef.current();
    }).then(f => { unlistenFn = f; });

    listen('media-next', () => {
      nextTrackRef.current();
    }).then(f => { unlistenNext = f; });

    listen('media-prev', () => {
      previousTrackRef.current();
    }).then(f => { unlistenPrev = f; });

    listen('media-toggle', () => {
      handlePlayClickRef.current();
    }).then(f => { unlistenToggle = f; });

    const handleShortcutAction = (e: Event) => {
      const action = (e as CustomEvent<{ action: string }>).detail.action;
      if (action === 'PLAY_PAUSE') {
        handlePlayClickRef.current();
      } else if (action === 'NEXT_TRACK') {
        nextTrackRef.current();
      } else if (action === 'PREV_TRACK') {
        previousTrackRef.current();
      } else if (action === 'SKIP_FORWARD_10') {
        if (!currentTrack) return;
        const newTime = Math.min(currentTimeRef.current + 10, currentTrack.durationSecs);
        invoke('seek_audio', { positionSecs: newTime }).catch(console.error);
        setCurrentTime(newTime);
      } else if (action === 'SKIP_BACKWARD_10') {
        const newTime = Math.max(0, currentTimeRef.current - 10);
        invoke('seek_audio', { positionSecs: newTime }).catch(console.error);
        setCurrentTime(newTime);
      } else if (action === 'VOLUME_UP') {
        const v = volumeDbRef.current;
        let newDb = v + 3; // +3 dB
        if (newDb > 0) newDb = 0;
        const scalar = Math.pow(10, newDb / 20);
        invoke('set_system_volume', { scalar }).catch(console.error);
        // We do not setCurrentVolumeDb because `os-volume-changed` listener updates it automatically
      } else if (action === 'VOLUME_DOWN') {
        const v = volumeDbRef.current;
        let newDb = v - 3; // -3 dB
        if (newDb < -64) newDb = -64;
        const scalar = Math.pow(10, newDb / 20);
        invoke('set_system_volume', { scalar }).catch(console.error);
      } else if (action === 'TOGGLE_MUTE') {
        if (volumeDbRef.current > -64.0) {
          invoke('set_system_volume', { scalar: 0.0 }).catch(console.error);
        } else {
          // Unmute to previous or -12dB
          const prev = prevVolumeDb > -64.0 ? prevVolumeDb : -12.0;
          const scalar = Math.pow(10, prev / 20);
          invoke('set_system_volume', { scalar }).catch(console.error);
        }
      }
    };
    window.addEventListener('shortcut-action', handleShortcutAction);

    return () => {
      if (unlistenFn) unlistenFn();
      if (unlistenNext) unlistenNext();
      if (unlistenPrev) unlistenPrev();
      if (unlistenToggle) unlistenToggle();
      window.removeEventListener('shortcut-action', handleShortcutAction);
    };
  }, [currentTrack, prevVolumeDb]);

  const isPromptingRef = useRef(false);
  const [volumeWarning, setVolumeWarning] = useState<{
    show: boolean;
    volume: number;
    resolve: ((val: boolean) => void) | null;
  }>({ show: false, volume: 0, resolve: null });

  const [showDeviceList, setShowDeviceList] = useState(false);
  const [audioDevices, setAudioDevices] = useState<{ id: string, name: string, is_default: boolean }[]>([]);
  const deviceListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (deviceListRef.current && !deviceListRef.current.contains(event.target as Node)) {
        setShowDeviceList(false);
      }
    };
    if (showDeviceList) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDeviceList]);

  const promptHighVolume = (currentVolume: number): Promise<boolean> => {
    const warningEnabled = localStorage.getItem('hertzsonic_high_volume_warning') !== 'false';
    if (!warningEnabled) {
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      setVolumeWarning({
        show: true,
        volume: currentVolume,
        resolve: (val: boolean) => {
          setVolumeWarning({ show: false, volume: 0, resolve: null });
          resolve(val);
        }
      });
    });
  };

  const handleDeviceListClick = async () => {
    if (!showDeviceList) {
      try {
        const devices = await invoke<{ id: string, name: string, is_default: boolean }[]>('get_audio_devices');
        setAudioDevices(devices);
      } catch (e) {
        console.error('Failed to get audio devices:', e);
      }
    }
    setShowDeviceList(!showDeviceList);
  };

  const handleDeviceSelect = async (deviceId: string) => {
    try {
      await invoke('switch_audio_device', { deviceId });
      setShowDeviceList(false);
      // Also fetch them again right after to update the default dot
      const devices = await invoke<{ id: string, name: string, is_default: boolean }[]>('get_audio_devices');
      setAudioDevices(devices);
    } catch (e) {
      console.error('Failed to switch audio device:', e);
    }
  };

  useEffect(() => {
    let unlistenDevices: (() => void) | undefined;

    const setupListener = async () => {
      unlistenDevices = await listen('audio-devices-changed', async () => {
        if (showDeviceList) {
          try {
            const devices = await invoke<{ id: string, name: string, is_default: boolean }[]>('get_audio_devices');
            setAudioDevices(devices);
          } catch (e) {
            console.error('Failed to get audio devices:', e);
          }
        }
      });
    };

    setupListener();

    return () => {
      if (unlistenDevices) {
        unlistenDevices();
      }
    };
  }, [showDeviceList]);

  useEffect(() => {
    const fetchInitialVolume = async () => {
      try {
        const scalar = await invoke<number>('get_system_volume');
        let db = 0;
        if (scalar <= 0.0001) {
          db = -64.0;
        } else {
          db = 20 * Math.log10(scalar);
          db = Math.max(-64.0, Math.round(db));
        }
        setVolumeDb(db);
        setPrevVolumeDb(db);
      } catch (e) {
        console.error('Failed to fetch initial volume:', e);
      }
    };
    fetchInitialVolume();

    const setupListener = async () => {
      const unlisten = await listen<number>('os-volume-changed', (event) => {
        if (!isVolumeDraggingRef.current) {
          const scalar = event.payload;
          let db = 0;
          if (scalar <= 0.0001) {
            db = -64.0;
          } else {
            db = 20 * Math.log10(scalar);
            db = Math.max(-64.0, Math.round(db));
          }
          setVolumeDb(db);
        }
      });
      return unlisten;
    };

    let unlistenFn: (() => void) | undefined;
    setupListener().then(f => { unlistenFn = f; });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isPlaying && !isDragging) {
      interval = setInterval(async () => {
        try {
          const pos = await invoke<number>('get_audio_position');
          setCurrentTime(pos);
        } catch (e) {
          console.error(e);
        }
      }, 500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPlaying, isDragging]);

  const checkHighVolumeWarning = async (currentVolume: number): Promise<boolean> => {
    const isWarningEnabled = localStorage.getItem('hertzsonic_high_volume_warning') !== 'false';
    console.log('[Volume Check] isWarningEnabled:', isWarningEnabled, 'currentVolume:', currentVolume);
    if (!isWarningEnabled) return true;

    const mode = localStorage.getItem('hertzsonic_volume_protection_mode') || 'global';
    let thresholdDb = -17.0;

    console.log('[Volume Check] mode:', mode);
    if (mode === 'dynamic') {
      try {
        const device = await invoke<{ threshold_db: number } | null>('get_current_audio_device');
        console.log('[Volume Check] get_current_audio_device result:', device);
        if (device) {
          thresholdDb = device.threshold_db;
        } else {
          const savedGlobal = localStorage.getItem('hertzsonic_high_volume_threshold');
          thresholdDb = savedGlobal ? parseFloat(savedGlobal) : -17.0;
        }
      } catch (err) {
        console.error('[Volume Check] backend error:', err);
        const savedGlobal = localStorage.getItem('hertzsonic_high_volume_threshold');
        thresholdDb = savedGlobal ? parseFloat(savedGlobal) : -17.0;
      }
    } else {
      const savedGlobal = localStorage.getItem('hertzsonic_high_volume_threshold');
      thresholdDb = savedGlobal ? parseFloat(savedGlobal) : -17.0;
    }

    console.log('[Volume Check] final thresholdDb:', thresholdDb);

    if (currentVolume > thresholdDb) {
      console.log('[Volume Check] Volume > threshold! Prompting...');
      if (isPromptingRef.current) return false;
      isPromptingRef.current = true;
      const isConfirmed = await promptHighVolume(currentVolume);
      isPromptingRef.current = false;
      return isConfirmed;
    }

    return true;
  };

  useEffect(() => {
    const playNewTrack = async () => {
      if (currentTrack && currentTrack.path !== playingTrackPath) {
        if (!isPlayingRef.current) {
          const currentVolume = volumeDbRef.current;
          const allowed = await checkHighVolumeWarning(currentVolume);
          if (!allowed) return;
        }

        try {
          await invoke('play_audio', { filePath: currentTrack.path });
          setPlayingTrackPath(currentTrack.path);
          isLoadedInBackend.current = true;
          setIsPlaying(true);
          setCurrentTime(0);
        } catch (e) {
          console.error('Failed to auto-play track:', e);
        }
      }
    };

    playNewTrack();
  }, [currentTrack, playingTrackPath]);

  const formatDuration = (secs: number) => {
    if (!secs) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  let audioQualityStr = '';
  if (currentTrack) {
    const ext = currentTrack.fileName.split('.').pop()?.toUpperCase() || '';
    const sampleRateKhz = currentTrack.sampleRate ? (currentTrack.sampleRate / 1000).toFixed(1) : '';
    const bitDepth = currentTrack.bitDepth ? currentTrack.bitDepth : '';

    audioQualityStr = ext;
    if (bitDepth && sampleRateKhz) {
      audioQualityStr += ` ${bitDepth}/${sampleRateKhz}`;
    } else if (currentTrack.bitrate) {
      audioQualityStr += ` ${currentTrack.bitrate}kbps`;
    }
  }

  const handlePlayClick = async () => {
    if (!currentTrack) return;
    try {
      if (isPlaying) {
        await invoke('pause_audio');
        setIsPlaying(false);
      } else {
        const currentVolume = volumeDbRef.current;
        const allowed = await checkHighVolumeWarning(currentVolume);
        if (!allowed) return;

        if (playingTrackPath === currentTrack.path && isLoadedInBackend.current) {
          await invoke('resume_audio');
        } else {
          await invoke('play_audio', { filePath: currentTrack.path });
          setPlayingTrackPath(currentTrack.path);
          isLoadedInBackend.current = true;
        }
        setIsPlaying(true);
      }
    } catch (e) {
      console.error('Failed to toggle audio playback:', e);
    }
  };

  useEffect(() => {
    handlePlayClickRef.current = handlePlayClick;
  }, [handlePlayClick, currentTrack, isPlaying]);

  const handleSeekUpdate = (e: React.MouseEvent | MouseEvent) => {
    if (!currentTrack || !progressTrackRef.current) return;
    const rect = progressTrackRef.current.getBoundingClientRect();
    let x = e.clientX - rect.left;
    x = Math.max(0, Math.min(x, rect.width));
    const percent = x / rect.width;
    const newTime = percent * currentTrack.durationSecs;
    setCurrentTime(newTime);
  };

  const handleSeekEnd = async (e: React.MouseEvent | MouseEvent) => {
    if (!currentTrack || !progressTrackRef.current) return;
    const rect = progressTrackRef.current.getBoundingClientRect();
    let x = e.clientX - rect.left;
    x = Math.max(0, Math.min(x, rect.width));
    const percent = x / rect.width;
    const newTime = percent * currentTrack.durationSecs;
    setCurrentTime(newTime);
    setIsDragging(false);

    document.removeEventListener('mousemove', handleSeekUpdate);
    document.removeEventListener('mouseup', handleSeekEnd);

    try {
      await invoke('seek_audio', { positionSecs: newTime });
    } catch (err) {
      console.error(err);
    }
  };

  const handleSeekStart = (e: React.MouseEvent) => {
    if (!currentTrack) return;
    setIsDragging(true);
    handleSeekUpdate(e);

    document.addEventListener('mousemove', handleSeekUpdate);
    document.addEventListener('mouseup', handleSeekEnd);
  };

  const handleVolumeUpdate = (e: React.MouseEvent | MouseEvent) => {
    if (!volumeTrackRef.current) return;
    const rect = volumeTrackRef.current.getBoundingClientRect();
    let x = e.clientX - rect.left;
    x = Math.max(0, Math.min(x, rect.width));
    const percent = x / rect.width;
    let db = -64.0 + (percent * 64.0);
    db = Math.round(db); // snap to 1.0 steps
    setVolumeDb(db);

    // Map dB (-64 to 0) to Scalar (0.0 to 1.0)
    const scalar = db <= -64.0 ? 0.0 : Math.pow(10, db / 20);
    invoke('set_system_volume', { scalar }).catch(console.error);
  };

  const handleVolumeEnd = (e: React.MouseEvent | MouseEvent) => {
    handleVolumeUpdate(e);
    isVolumeDraggingRef.current = false;
    document.removeEventListener('mousemove', handleVolumeUpdate);
    document.removeEventListener('mouseup', handleVolumeEnd);
  };

  const handleVolumeStart = (e: React.MouseEvent) => {
    isVolumeDraggingRef.current = true;
    handleVolumeUpdate(e);
    document.addEventListener('mousemove', handleVolumeUpdate);
    document.addEventListener('mouseup', handleVolumeEnd);
  };

  const handleMuteToggle = () => {
    if (volumeDb <= -64.0) {
      // Unmute
      const restoreDb = prevVolumeDb <= -64.0 ? -4.0 : prevVolumeDb;
      setVolumeDb(restoreDb);
      const scalar = Math.pow(10, restoreDb / 20);
      invoke('set_system_volume', { scalar }).catch(console.error);
    } else {
      // Mute
      setPrevVolumeDb(volumeDb);
      setVolumeDb(-64.0);
      invoke('set_system_volume', { scalar: 0.0 }).catch(console.error);
    }
  };

  return (
    <div className="dashboard-player-bar">
      {volumeWarning.show && (
        <div className="volume-warning-bar">
          <span className="warning-text">You are about to play music at a high volume ({volumeWarning.volume} dB). Are you sure you want to continue?</span>
          <div className="warning-actions">
            <button className="warning-btn cancel" onClick={() => volumeWarning.resolve?.(false)}>Cancel</button>
            <button className="warning-btn ok" onClick={() => volumeWarning.resolve?.(true)}>OK</button>
          </div>
        </div>
      )}

      {/* LEFT SECTION */}
      <div className="player-left">
        {currentTrack ? (
          <div className="track-info">
            <div className="track-art">
              {currentTrack.coverArt && (
                <img
                  src={currentTrack.coverArt.startsWith('data:') ? currentTrack.coverArt : convertFileSrc(currentTrack.coverArt)}
                  alt="Cover Art"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' }}
                />
              )}
            </div>
            <div className="track-details">
              <span className="track-name">{currentTrack.title}</span>
              <span className="track-artist">{currentTrack.artist}</span>
              {audioQualityStr && (
                <span className="audio-quality-detail">{audioQualityStr}</span>
              )}
            </div>
            <button className="like-btn" title="Like">
              <Heart size={20} strokeWidth={2} className="heart-icon" />
            </button>
          </div>
        ) : (
          <div className="startup-message" style={{ display: 'flex', alignItems: 'center', height: '100%', paddingLeft: '8px' }}>
            <span style={{ color: 'rgba(255, 255, 255, 0.45)', fontSize: '13px', fontWeight: 500, letterSpacing: '0.3px' }}>
              Select a track to start listening to some good music.
            </span>
          </div>
        )}
      </div>

      {/* CENTER SECTION */}
      <div className="player-center" style={{ opacity: currentTrack ? 1 : 0.3, pointerEvents: currentTrack ? 'auto' : 'none' }}>
        <div className="player-controls">
          <button
            className={`control-btn ${isShuffled ? 'active' : ''}`}
            onClick={toggleShuffle}
            title="Shuffle"
          >
            {isShuffled ? <IconShuffleActive /> : <IconShuffle />}
          </button>
          <button className="control-btn" onClick={previousTrack} title="Previous"><IconNext /></button>
          <button className="control-btn play-btn" onClick={handlePlayClick} title={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? (
              <IconPause />
            ) : (
              <IconPlay />
            )}
          </button>
          <button className="control-btn" onClick={nextTrack} title="Next"><IconPrev /></button>
          <button className="control-btn" onClick={toggleRepeat} title={`Repeat: ${repeatMode}`}>
            <IconRepeat style={{ filter: repeatMode === 'one' ? 'hue-rotate(90deg)' : 'none' }} />
          </button>
        </div>

        <div className="progress-bar-container">
          <span className="time current-time">{formatDuration(currentTime)}</span>
          <div
            className="progress-track"
            ref={progressTrackRef}
            onMouseDown={handleSeekStart}
          >
            <svg 
              className={`waveform-scrubber ${isWaveformLoading || waveformData.length !== 100 ? 'loading' : 'loaded'}`}
              style={{ width: '100%', height: '100%', display: 'block' }}
            >
              {(() => {
                const hasData = waveformData.length === 100;
                const playedRatio = currentTrack && currentTrack.durationSecs > 0 
                  ? (currentTime / currentTrack.durationSecs) 
                  : 0;

                const renderBars = () => Array.from({ length: 100 }).map((_, i) => {
                  const showData = hasData && !isWaveformLoading;
                  const amp = showData ? waveformData[i] : 0;
                  const height = showData ? Math.max(8, amp * 100) : 4; // 4% height for dots
                  const y = (100 - height) / 2;
                  const isPlayed = i / 100 <= playedRatio;
                  
                  return (
                    <rect
                      key={i}
                      x={`${i + 0.2}%`}
                      y={`${y}%`}
                      width="0.6%"
                      height={`${height}%`}
                      rx="2"
                      ry="2"
                      className={showData ? (isPlayed ? "bar-played entrance" : "bar-unplayed entrance") : "bar-loading"}
                      style={showData ? { animationDelay: `${i * 0.005}s` } : undefined}
                    />
                  );
                });

                return (
                  <g className="waveform-group">
                    {renderBars()}
                  </g>
                );
              })()}
            </svg>
          </div>
          <span className="time total-time">{currentTrack ? formatDuration(currentTrack.durationSecs) : '0:00'}</span>
        </div>
      </div>

      {/* RIGHT SECTION */}
      <div className="player-right">

        <div className="right-controls">
          <button className="ext-control-btn queue-btn active" title="Queue">
            <IconQueue />
          </button>
          <button className="ext-control-btn" title="Equalizer">
            <IconEq />
          </button>

          <div className="volume-section">
            <div className="gain-control">
              <button className="gain-btn" title="Decrease Gain" onClick={() => {
                const db = Math.max(-64.0, volumeDb - 1.0);
                setVolumeDb(db);
                const scalar = db <= -64.0 ? 0.0 : Math.pow(10, db / 20);
                invoke('set_system_volume', { scalar }).catch(console.error);
              }}>-</button>
              <span className="gain-value">
                {volumeDb <= -64.0 ? <><span style={{ fontSize: '1.2em' }}>-∞</span> dB</> : (volumeDb === 0 ? '0 dB' : `${volumeDb.toFixed(0)} dB`)}
              </span>
              <button className="gain-btn" title="Increase Gain" onClick={() => {
                const db = Math.min(0, volumeDb + 1.0);
                setVolumeDb(db);
                const scalar = db <= -64.0 ? 0.0 : Math.pow(10, db / 20);
                invoke('set_system_volume', { scalar }).catch(console.error);
              }}>+</button>
            </div>
            <div className="volume-bar-wrapper">
              <span 
                className="volume-icon"
                onClick={handleMuteToggle}
                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
              >
                {volumeDb <= -64.0 ? <IconMute /> : <IconVolume />}
              </span>
              <div className="volume-track" ref={volumeTrackRef} onMouseDown={handleVolumeStart}>
                <div className="volume-fill" style={{ width: `${((volumeDb + 64) / 64) * 100}%` }}>
                  <div className="volume-thumb" />
                </div>
              </div>
            </div>
          </div>

          <button className="ext-control-btn" title="Lock">
            <IconLock />
          </button>
          <div className="device-list-wrapper" ref={deviceListRef} style={{ position: 'relative' }}>
            <button className="ext-control-btn" title="Headphones output" onClick={handleDeviceListClick}>
              <IconHeadphones />
            </button>

            {showDeviceList && (
              <div className="device-list-popup">
                <div className="device-list-header">
                  Select Playback Device
                </div>
                <div className="device-list-content">
                  {audioDevices.map(device => (
                    <div
                      key={device.id}
                      className={`device-item ${device.is_default ? 'default' : ''}`}
                      onClick={() => handleDeviceSelect(device.id)}
                    >
                      <div className="device-icon">
                        {device.is_default ? <div className="active-dot" /> : null}
                      </div>
                      <span className="device-name" title={device.name}>{device.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
