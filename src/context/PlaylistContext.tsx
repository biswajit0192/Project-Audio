import React, { createContext, useContext, useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface Playlist {
  id: string;
  name: string;
  created_at: string;
  cover_art?: string | null;
}

interface PlaylistContextType {
  playlists: Playlist[];
  favoritePaths: Set<string>;
  playlistCounts: Record<string, number>;
  toggleFavorite: (filePath: string) => Promise<void>;
  createPlaylist: (name: string) => Promise<Playlist>;
  deletePlaylist: (id: string) => Promise<void>;
  addTrackToPlaylist: (playlistId: string, filePath: string) => Promise<void>;
  removeTrackFromPlaylist: (playlistId: string, filePath: string) => Promise<void>;
  updatePlaylistCover: (playlistId: string, base64Image: string | null) => Promise<void>;
  refreshPlaylists: () => Promise<void>;
}

const PlaylistContext = createContext<PlaylistContextType | undefined>(undefined);

export const PlaylistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [favoritePaths, setFavoritePaths] = useState<Set<string>>(new Set());
  const [playlistCounts, setPlaylistCounts] = useState<Record<string, number>>({});

  const refreshPlaylists = async () => {
    try {
      const fetched: Playlist[] = await invoke('get_playlists');
      
      let favPlaylist = fetched.find(p => p.name === 'Favorites');
      if (!favPlaylist) {
        try {
          favPlaylist = await invoke('create_playlist', { name: 'Favorites' });
        } catch (e) {
          console.error("Failed to init favorites", e);
        }
      }

      const allPlaylists: Playlist[] = await invoke('get_playlists');
      setPlaylists(allPlaylists.filter(p => p.name !== 'Favorites'));

      favPlaylist = allPlaylists.find(p => p.name === 'Favorites');
      if (favPlaylist) {
        const favTracks: string[] = await invoke('get_playlist_tracks', { playlistId: favPlaylist.id });
        setFavoritePaths(new Set(favTracks));
      }

      const filtered = allPlaylists.filter(p => p.name !== 'Favorites');
      const counts: Record<string, number> = {};
      for (const p of filtered) {
        const tracks: string[] = await invoke('get_playlist_tracks', { playlistId: p.id });
        counts[p.id] = tracks.length;
      }
      setPlaylistCounts(counts);
    } catch (err) {
      console.error("Failed to refresh playlists", err);
    }
  };

  useEffect(() => {
    refreshPlaylists();
  }, []);

  const toggleFavorite = async (filePath: string) => {
    try {
      const allPlaylists: Playlist[] = await invoke('get_playlists');
      let favPlaylist = allPlaylists.find(p => p.name === 'Favorites');
      
      if (!favPlaylist) {
         favPlaylist = await invoke('create_playlist', { name: 'Favorites' });
      }

      if (!favPlaylist) return;

      if (favoritePaths.has(filePath)) {
        await invoke('remove_track_from_playlist', { playlistId: favPlaylist.id, filePath });
        setFavoritePaths(prev => {
          const next = new Set(prev);
          next.delete(filePath);
          return next;
        });
      } else {
        await invoke('add_track_to_playlist', { playlistId: favPlaylist.id, filePath });
        setFavoritePaths(prev => {
          const next = new Set(prev);
          next.add(filePath);
          return next;
        });
      }
    } catch (err) {
      console.error("Failed to toggle favorite", err);
    }
  };

  const createPlaylist = async (name: string) => {
    const newPlaylist: Playlist = await invoke('create_playlist', { name });
    setPlaylists(prev => [...prev, newPlaylist]);
    return newPlaylist;
  };

  const deletePlaylist = async (id: string) => {
    await invoke('delete_playlist', { id });
    setPlaylists(prev => prev.filter(p => p.id !== id));
  };

  const addTrackToPlaylist = async (playlistId: string, filePath: string) => {
    await invoke('add_track_to_playlist', { playlistId, filePath });
    await refreshPlaylists();
  };

  const removeTrackFromPlaylist = async (playlistId: string, filePath: string) => {
    await invoke('remove_track_from_playlist', { playlistId, filePath });
    await refreshPlaylists();
  };

  const updatePlaylistCover = async (playlistId: string, base64Image: string | null) => {
    await invoke('update_playlist_cover', { playlistId, coverArt: base64Image });
    await refreshPlaylists();
  };

  return (
    <PlaylistContext.Provider
      value={{
        playlists,
        favoritePaths,
        playlistCounts,
        toggleFavorite,
        createPlaylist,
        deletePlaylist,
        addTrackToPlaylist,
        removeTrackFromPlaylist,
        updatePlaylistCover,
        refreshPlaylists
      }}
    >
      {children}
    </PlaylistContext.Provider>
  );
};

export const usePlaylists = () => {
  const context = useContext(PlaylistContext);
  if (context === undefined) {
    throw new Error('usePlaylists must be used within a PlaylistProvider');
  }
  return context;
};
