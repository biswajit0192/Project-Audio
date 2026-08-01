import './AlbumCard.scss';
import iconPlayBtn from '../../assets/playing-tab-icons/Play Btn.svg';

export interface AlbumCardProps {
  title: string;
  artist: string;
  coverArt?: string;
  onClick?: () => void;
}

export default function AlbumCard({ title, artist, coverArt, onClick }: AlbumCardProps) {
  return (
    <div className="album-card">
      <div className="album-cover-container" onClick={onClick}>
        {coverArt ? (
          <img src={coverArt} alt={`${title} cover`} className="album-cover" />
        ) : (
          <div className="album-placeholder">
            <span className="music-note">♪</span>
          </div>
        )}
        <div className="play-overlay">
          <button className="play-btn">
            <img src={iconPlayBtn} alt="Play" />
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
