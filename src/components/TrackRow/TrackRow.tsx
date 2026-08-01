import './TrackRow.scss';
import { Cloud, Folder, PlusCircle, Heart, MoreVertical } from 'lucide-react';
import playBtnIcon from '../../assets/playing-tab-icons/Play Btn.svg';

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
  variant?: 'compact' | 'wide';
  isActive?: boolean;
  isCloud?: boolean;
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
  variant = 'wide',
  isActive = false,
  isCloud = false,
  onClick
}: TrackRowProps) {
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
          <img src={coverArt} alt={`${title} art`} className="track-art" />
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
          <button className="action-btn">
            <PlusCircle size={18} />
          </button>
          <button className="action-btn">
            <Heart size={18} />
          </button>
          <button className="action-btn">
            <MoreVertical size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
