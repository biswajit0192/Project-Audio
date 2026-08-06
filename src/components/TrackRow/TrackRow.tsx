import './TrackRow.scss';
import { Cloud, Folder, PlusCircle, Heart, MoreVertical, MinusCircle } from 'lucide-react';
import playBtnIcon from '../../assets/playing-tab-icons/Play Btn.svg';
import { convertFileSrc } from '@tauri-apps/api/core';
import { usePlaylists } from '../../context/PlaylistContext';
import { useState, useRef, useEffect } from 'react';

export interface TrackRowProps {
  trackNumber?: number;
  coverArt?: string;
  title: string;
  artist: string;
  album?: string;
  duration?: string;
  sampleRate?: number | null;
  bitDepth?: number | null;
  bitrate?: number | null;
  filePath?: string;
  variant?: 'compact' | 'wide';
  isActive?: boolean;
  isCloud?: boolean;
  onRemove?: () => void;
  onClick?: () => void;
}

export default function TrackRow({
  trackNumber,
  coverArt,
  title,
  artist,
  album,
  duration,
  sampleRate,
  bitDepth,
  bitrate,
  filePath,
  variant = 'wide',
  isActive = false,
  isCloud = false,
  onRemove,
  onClick
}: TrackRowProps) {
  const { playlists, favoritePaths, toggleFavorite, addTrackToPlaylist, createPlaylist } = usePlaylists();
  const [showDropdown, setShowDropdown] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setIsCreating(false);
      }
    };
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const handleFavoriteClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (filePath) {
      await toggleFavorite(filePath);
    }
  };

  const handleAddTrack = async (e: React.MouseEvent, playlistId: string) => {
    e.stopPropagation();
    if (filePath) {
      await addTrackToPlaylist(playlistId, filePath);
      setShowDropdown(false);
    }
  };

  const handleCreateAndAdd = async (e: React.MouseEvent | React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!newPlaylistName.trim() || !filePath) return;

    try {
      const p = await createPlaylist(newPlaylistName.trim());
      await addTrackToPlaylist(p.id, filePath);
      setNewPlaylistName('');
      setIsCreating(false);
      setShowDropdown(false);
    } catch (err) {
      console.error("Failed to create playlist", err);
    }
  };

  const audioBadge = (() => {
    if ((sampleRate && sampleRate >= 88200) || (bitDepth && bitDepth > 16)) {
      return 'HR'; // Hi-Res
    } else if (bitDepth === 16 || (bitrate && bitrate >= 320)) {
      return 'SQ'; // Standard Quality
    }
    return null;
  })();

  return (
    <div className={`track-row ${variant} ${isActive ? 'active' : ''}`} onClick={onClick}>
      {/* 1. Track Number or Play Icon (Hover State) */}
      {variant === 'wide' && trackNumber && (
        <div className="track-number-col">
          <span className="number">{trackNumber}</span>
          <img src={playBtnIcon} className="play-icon custom-play-btn" alt="Play" />
        </div>
      )}

      {/* 2. Cover Art & Info Wrapper for Title column */}
      <div className="track-title-col">
        {coverArt ? (
          <img src={coverArt.startsWith('data:') ? coverArt : convertFileSrc(coverArt)} alt={`${title} art`} className="track-art" />
        ) : (
          <div className="track-art-placeholder">
            <span className="music-note">♪</span>
          </div>
        )}

        {/* 3. Title & Artist */}
        <div className="track-info">
          <span className="track-title">{title}</span>
          <div className="track-artist-wrapper">
            {audioBadge && <span className={`audio-badge badge-${audioBadge.toLowerCase()}`}>{audioBadge}</span>}
            <span className="track-artist">{artist}</span>
          </div>
        </div>
      </div>

      {/* 4. Album (Wide Only) */}
      {variant === 'wide' && (
        <div className="track-album-col">
          <span className="track-album">{album || 'Unknown Album'}</span>
        </div>
      )}

      {/* 5. Duration */}
      {duration && (
        <div className="track-duration-col">
          <span className="track-duration">{duration}</span>
        </div>
      )}

      {/* 6. Source (Wide Only) */}
      {variant === 'wide' && (
        <div className="track-source-col">
          <button className="action-btn">
            {isCloud ? <Cloud size={18} /> : <Folder size={18} />}
          </button>
        </div>
      )}

      {/* 7. Actions (Wide Only) */}
      {variant === 'wide' && (
        <div className="track-action-col">
          <div className="dropdown-container" ref={dropdownRef}>
            <button className="action-btn" onClick={(e) => { e.stopPropagation(); setShowDropdown(!showDropdown); }}>
              <PlusCircle size={18} />
            </button>
            {showDropdown && (
              <div className="playlist-dropdown" onClick={(e) => e.stopPropagation()}>
                <div className="dropdown-header">Add to Playlist</div>
                <div className="dropdown-list">
                  {playlists.map(p => (
                    <div key={p.id} className="dropdown-item" onClick={(e) => handleAddTrack(e, p.id)}>
                      {p.name}
                    </div>
                  ))}
                </div>
                <div className="dropdown-footer">
                  {isCreating ? (
                    <form className="new-playlist-form" onSubmit={handleCreateAndAdd}>
                      <input 
                        autoFocus
                        type="text" 
                        value={newPlaylistName} 
                        onChange={e => setNewPlaylistName(e.target.value)} 
                        placeholder="Playlist name..."
                      />
                      <button type="submit" className="save-btn">Save</button>
                    </form>
                  ) : (
                    <div className="new-playlist-trigger" onClick={(e) => { e.stopPropagation(); setIsCreating(true); }}>
                      + New Playlist
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <button 
            className={`action-btn fav-btn ${filePath && favoritePaths.has(filePath) ? 'is-fav' : ''}`}
            onClick={handleFavoriteClick}
            title="Toggle Favorite"
          >
            <Heart 
              size={18} 
              fill={filePath && favoritePaths.has(filePath) ? 'currentColor' : 'none'} 
            />
          </button>
          
          {onRemove && (
            <button className="action-btn remove-btn" onClick={(e) => { e.stopPropagation(); onRemove(); }} title="Remove from playlist">
              <MinusCircle size={18} />
            </button>
          )}

          <button className="action-btn">
            <MoreVertical size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
