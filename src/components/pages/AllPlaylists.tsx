import { useEffect, useState } from 'react';
import { usePlaylists, Playlist } from '../../context/PlaylistContext';
import { Track } from '../../types';
import { useQueue } from '../../context/QueueContext';
import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { Music, Heart, Plus } from 'lucide-react';
import IconPlayBtn from '../../assets/playing-tab-icons/Play Btn.svg?react';
import './AllPlaylists.scss';

interface AllPlaylistsProps {
  musicFiles: Track[];
  onNavigate: (view: string) => void;
}

export default function AllPlaylists({ musicFiles, onNavigate }: AllPlaylistsProps) {
  const { playlists, playlistCounts, favoritePaths, createPlaylist } = usePlaylists();
  const { playContext } = useQueue();
  const [playlistCollages, setPlaylistCollages] = useState<Record<string, string[]>>({});
  
  useEffect(() => {
    const fetchCollages = async () => {
      const collages: Record<string, string[]> = {};
      
      try {
        const backendPlaylists: Playlist[] = await invoke('get_playlists');
        const fav = backendPlaylists.find(p => p.name === 'Favorites');
        if (fav) {
          const favPaths: string[] = await invoke('get_playlist_tracks', { playlistId: fav.id });
          const favTracks = favPaths.map(p => musicFiles.find(t => t.path === p)).filter(t => t?.coverArt);
          collages['favorites'] = Array.from(new Set(favTracks.map(t => t!.coverArt as string)));
        }
        
        for (const p of playlists) {
          if (p.cover_art) continue; 
          const paths: string[] = await invoke('get_playlist_tracks', { playlistId: p.id });
          const tracks = paths.map(path => musicFiles.find(t => t.path === path)).filter(t => t?.coverArt);
          collages[p.id] = Array.from(new Set(tracks.map(t => t!.coverArt as string)));
        }
        
        setPlaylistCollages(collages);
      } catch (err) {
        console.error("Failed to fetch collages:", err);
      }
    };
    fetchCollages();
  }, [playlists, musicFiles]);

  const handlePlay = async (e: React.MouseEvent, playlistId: string) => {
    e.stopPropagation();
    let idToFetch = playlistId;
    if (playlistId === 'favorites') {
      const backendPlaylists: Playlist[] = await invoke('get_playlists');
      const fav = backendPlaylists.find(p => p.name === 'Favorites');
      if (fav) idToFetch = fav.id;
    }
    
    try {
      const paths: string[] = await invoke('get_playlist_tracks', { playlistId: idToFetch });
      const tracksToPlay = paths.map(path => musicFiles.find(t => t.path === path)).filter((t): t is Track => t !== undefined);
      
      if (tracksToPlay.length > 0) {
        playContext(tracksToPlay, 0);
      }
    } catch (err) {
      console.error("Failed to play playlist:", err);
    }
  };
  
  const handleCreatePlaylist = async () => {
    const name = prompt("Enter playlist name:");
    if (name && name.trim()) {
      const p = await createPlaylist(name.trim());
      onNavigate(`playlist_${p.id}`);
    }
  };

  const renderCollage = (playlistId: string, customCover?: string | null, isFavorites?: boolean) => {
    if (isFavorites) {
      return (
        <div className="album-placeholder favorites-cover">
          <Heart size={48} className="heart-icon" fill="currentColor" />
        </div>
      );
    }
    
    if (customCover) {
      return <img src={customCover.startsWith('data:') ? customCover : convertFileSrc(customCover)} alt="Cover" className="album-cover" />;
    }
    
    let uniqueCovers = playlistCollages[playlistId] || [];
    if (uniqueCovers.length >= 4) {
      uniqueCovers = uniqueCovers.slice(0, 4);
      return (
        <div className="grid-collage">
          {uniqueCovers.map((src, i) => <img key={i} src={convertFileSrc(src)} alt="" />)}
        </div>
      );
    } else if (uniqueCovers.length > 1) {
      const base = [...uniqueCovers];
      while (uniqueCovers.length < 4) {
        uniqueCovers.push(base[uniqueCovers.length % base.length]);
      }
      return (
        <div className="grid-collage">
          {uniqueCovers.map((src, i) => <img key={i} src={convertFileSrc(src)} alt="" />)}
        </div>
      );
    } else if (uniqueCovers.length === 1) {
      return <img src={convertFileSrc(uniqueCovers[0])} alt="Cover" className="album-cover" />;
    } else {
      return (
        <div className="album-placeholder">
          <Music size={48} />
        </div>
      );
    }
  };

  return (
    <div className="all-playlists-view">
      <div className="view-header">
        <h1 className="section-heading">All Playlists</h1>
        <button className="create-playlist-btn" onClick={handleCreatePlaylist}>
          <Plus size={18} />
          Create Playlist
        </button>
      </div>
      
      <div className="playlists-grid">
        <div className="playlist-card" onClick={() => onNavigate('playlist_favorites')}>
          <div className="playlist-cover-container">
            {renderCollage('favorites', null, true)}
            <div className="play-overlay">
              <button className="play-btn" onClick={(e) => handlePlay(e, 'favorites')}>
                <IconPlayBtn />
              </button>
            </div>
          </div>
          <div className="playlist-info">
            <h3 className="playlist-title">Favorites</h3>
            <p className="playlist-tracks-count">{favoritePaths.size} tracks</p> 
          </div>
        </div>

        {playlists.map(p => (
          <div key={p.id} className="playlist-card" onClick={() => onNavigate(`playlist_${p.id}`)}>
            <div className="playlist-cover-container">
              {renderCollage(p.id, p.cover_art)}
              <div className="play-overlay">
                <button className="play-btn" onClick={(e) => handlePlay(e, p.id)}>
                  <IconPlayBtn />
                </button>
              </div>
            </div>
            <div className="playlist-info">
              <h3 className="playlist-title">{p.name}</h3>
              <p className="playlist-tracks-count">{playlistCounts[p.id] || 0} tracks</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
