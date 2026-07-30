import './AlbumCard.scss';
import { Play } from 'lucide-react';

export interface AlbumCardProps {
  title: string;
  artist: string;
  coverArt?: string;
  onClick?: () => void;
}

export default function AlbumCard({ title, artist, coverArt, onClick }: AlbumCardProps) {
  return (
    <div className="album-card" onClick={onClick}>
      <div className="album-cover-container">
        {coverArt ? (
          <img src={coverArt} alt={`${title} cover`} className="album-cover" />
        ) : (
          <div className="album-placeholder">
            <span className="music-note">♪</span>
          </div>
        )}
        <div className="play-overlay">
          <button className="play-btn">
            <Play fill="currentColor" size={24} />
          </button>
        </div>
      </div>
      <div className="album-info">
        <h3 className="album-title">{title}</h3>
        <p className="album-artist">{artist}</p>
      </div>
    </div>
  );
}
