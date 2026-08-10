import './AlbumCard.scss';
import IconPlayBtn from '../../assets/playing-tab-icons/Play Btn.svg?react';
import { convertFileSrc } from '@tauri-apps/api/core';

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
          <img src={coverArt.startsWith('data:') ? coverArt : convertFileSrc(coverArt)} alt={`${title} cover`} className="album-cover" />
        ) : (
          <div className="album-placeholder">
            <span className="music-note">♪</span>
          </div>
        )}
        <div className="play-overlay">
          <button className="play-btn">
            <IconPlayBtn />
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
