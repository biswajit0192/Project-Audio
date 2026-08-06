import { useEffect, useState } from 'react';
import { usePlaylists, Playlist } from '../../context/PlaylistContext';
import { Track } from '../../types';
import { useQueue } from '../../context/QueueContext';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { Music, Trash2 } from 'lucide-react';
import TrackRow from '../TrackRow/TrackRow';
import './PlaylistDetail.scss';

interface PlaylistDetailProps {
  playlistId: string;
  musicFiles: Track[];
}

export default function PlaylistDetail({ playlistId, musicFiles }: PlaylistDetailProps) {
  const { playlists, removeTrackFromPlaylist, deletePlaylist } = usePlaylists();
  const { playContext, currentTrack } = useQueue();
  const [playlistTracks, setPlaylistTracks] = useState<Track[]>([]);
  const [playlistInfo, setPlaylistInfo] = useState<{name: string; isFavorites: boolean} | null>(null);

  const fetchPlaylistData = async () => {
    // 1. Identify Playlist
    let name = "Unknown Playlist";
    let isFavorites = false;
    let actualId = playlistId;

    if (playlistId === 'favorites') {
      name = "Favorites";
      isFavorites = true;
      // We need the backend UUID of favorites to query tracks if it exists
      const backendPlaylists: Playlist[] = await invoke('get_playlists');
      const fav = backendPlaylists.find(p => p.name === 'Favorites');
      if (fav) actualId = fav.id;
    } else {
      const found = playlists.find(p => p.id === playlistId);
      if (found) name = found.name;
    }

    setPlaylistInfo({ name, isFavorites });

    // 2. Fetch tracks
    try {
      const paths: string[] = await invoke('get_playlist_tracks', { playlistId: actualId });
      // Map paths to Track objects from global `musicFiles` array
      const mappedTracks = paths.map(path => musicFiles.find(t => t.path === path)).filter((t): t is Track => t !== undefined);
      setPlaylistTracks(mappedTracks);
    } catch (err) {
      console.error("Failed to fetch playlist tracks:", err);
      setPlaylistTracks([]);
    }
  };

  useEffect(() => {
    fetchPlaylistData();
  }, [playlistId, musicFiles, playlists]); // Re-run if playlists update (e.g. track removed)

  const handlePlayAll = () => {
    if (playlistTracks.length > 0) {
      playContext(playlistTracks, 0);
    }
  };

  const handleShuffle = () => {
    if (playlistTracks.length > 0) {
      const shuffled = [...playlistTracks].sort(() => Math.random() - 0.5);
      playContext(shuffled, 0);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete "${playlistInfo?.name}"?`)) {
      await deletePlaylist(playlistId);
      // Let Dashboard handle route reversion (it will probably unmount this if Sidebar triggers a navigate home)
    }
  };

  const handleRemoveTrack = async (filePath: string) => {
    let actualId = playlistId;
    if (playlistId === 'favorites') {
      const backendPlaylists: Playlist[] = await invoke('get_playlists');
      const fav = backendPlaylists.find(p => p.name === 'Favorites');
      if (fav) actualId = fav.id;
    }
    await removeTrackFromPlaylist(actualId, filePath);
    // State re-sync happens automatically via useEffect dependency on `playlists`, wait... `playlists` doesn't change when tracks do.
    // Need to trigger a local re-fetch
    fetchPlaylistData();
  };

  const totalDurationSecs = playlistTracks.reduce((acc, t) => acc + (t.durationSecs || 0), 0);
  const formatDurationStr = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const hours = Math.floor(mins / 60);
    if (hours > 0) {
      return `${hours} hr ${mins % 60} min`;
    }
    return `${mins} min`;
  };

  // Collage Logic
  const coverArts = playlistTracks.map(t => t.coverArt).filter((c): c is string => !!c);
  let uniqueCovers = Array.from(new Set(coverArts));
  
  if (uniqueCovers.length >= 4) {
    uniqueCovers = uniqueCovers.slice(0, 4);
  } else if (uniqueCovers.length > 1) {
    // Pad to exactly 4 by repeating, so 2x2 grid always works if there is >1 unique cover
    const base = [...uniqueCovers];
    while (uniqueCovers.length < 4) {
      uniqueCovers.push(base[uniqueCovers.length % base.length]);
    }
  }

  return (
    <div className="playlist-detail-view">
      <div className="playlist-header">
        <div className={`playlist-collage ${uniqueCovers.length >= 4 ? 'grid-mode' : uniqueCovers.length > 0 ? 'single-mode' : 'empty-mode'}`}>
          {uniqueCovers.length >= 4 ? (
            uniqueCovers.map((src, i) => <img key={i} src={convertFileSrc(src)} alt={`Cover ${i}`} />)
          ) : uniqueCovers.length > 0 ? (
            <img src={convertFileSrc(uniqueCovers[0])} alt="Cover" />
          ) : (
            <Music size={64} />
          )}
        </div>

        <div className="playlist-meta">
          <div className="playlist-type">{playlistInfo?.isFavorites ? 'System Playlist' : 'Playlist'}</div>
          <h1 className="playlist-title">{playlistInfo?.name}</h1>
          <div className="playlist-stats">
            {playlistTracks.length} {playlistTracks.length === 1 ? 'song' : 'songs'} • {formatDurationStr(totalDurationSecs)}
          </div>
          
          <div className="playlist-actions">
            <button className="btn-play" onClick={handlePlayAll}>Play All</button>
            <button className="btn-shuffle" onClick={handleShuffle}>Shuffle</button>
            {!playlistInfo?.isFavorites && (
              <button className="btn-delete" onClick={handleDelete} title="Delete Playlist">
                <Trash2 size={20} />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="playlist-tracks">
        {playlistTracks.map((track, idx) => (
          <TrackRow 
            key={`${track.path}-${idx}`}
            trackNumber={idx + 1}
            title={track.title}
            artist={track.artist !== 'Unknown Artist' ? track.artist : 'Unknown Artist'}
            album={track.album !== 'Unknown Album' ? track.album : undefined}
            duration={Math.floor(track.durationSecs / 60) + ':' + (track.durationSecs % 60).toString().padStart(2, '0')}
            coverArt={track.coverArt}
            sampleRate={track.sampleRate}
            bitDepth={track.bitDepth}
            bitrate={track.bitrate}
            filePath={track.path}
            variant="wide"
            isActive={track.id === currentTrack?.id}
            isCloud={false}
            onClick={() => playContext(playlistTracks, idx)}
            onRemove={() => handleRemoveTrack(track.path)}
          />
        ))}
      </div>
    </div>
  );
}
