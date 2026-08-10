import { useState, useMemo, useEffect } from 'react';
import { Track } from '../../types';
import { useQueue } from '../../context/QueueContext';
import AlbumCard from '../AlbumCard/AlbumCard';
import TrackRow from '../TrackRow/TrackRow';
import IconPlayBtn from '../../assets/playing-tab-icons/Play Btn.svg?react';
import IconShuffle from '../../assets/playing-tab-icons/Suffle Songs.svg?react';
import IconShuffleActive from '../../assets/playing-tab-icons/Suffle Songs Active.svg?react';
import IconFolderClosed from '../../assets/folder-closed.svg?react';
import IconFolderOpen from '../../assets/folder-open.svg?react';
import IconMusicFile from '../../assets/music-file.svg?react';
import './Library.scss';
import { convertFileSrc } from '@tauri-apps/api/core';

interface LibraryProps {
  musicFiles: Track[];
  currentTrackId?: string | number;
  initialFilter?: { tab: string; filter?: string } | null;
}

type TabType = 'albums' | 'artists' | 'tracks' | 'genres' | 'hires' | 'folderview';

type FileNode = {
  name: string;
  type: 'file';
  track: Track;
  originalIndex: number;
};

type DirNode = {
  name: string;
  type: 'dir';
  children: { [name: string]: DirNode | FileNode };
};

const FolderTreeComponent = ({ node, level = 0, onPlayTrack }: { node: DirNode, level?: number, onPlayTrack: (track: Track, idx: number) => void }) => {
  const [expanded, setExpanded] = useState(level === 0 || level === 1);
  
  const entries = Object.values(node.children).sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name);
    return a.type === 'dir' ? -1 : 1;
  });

  return (
    <div className="folder-node" style={{ paddingLeft: level > 0 ? 20 : 0 }}>
      {level > 0 && (
        <div className="folder-header" onClick={() => setExpanded(!expanded)}>
          {expanded ? <IconFolderOpen className="folder-icon" style={{ width: 16, height: 16 }} /> : <IconFolderClosed className="folder-icon" style={{ width: 16, height: 16 }} />}
          <span className="folder-name">{node.name}</span>
        </div>
      )}
      {(expanded || level === 0) && (
        <div className="folder-children">
          {entries.map(child => {
            if (child.type === 'dir') {
              return <FolderTreeComponent key={child.name} node={child as DirNode} level={level + 1} onPlayTrack={onPlayTrack} />;
            }
            const file = child as FileNode;
            return (
              <div key={file.name} className="folder-file" onClick={() => onPlayTrack(file.track, file.originalIndex)}>
                <IconMusicFile className="file-icon" style={{ width: 14, height: 14 }} />
                <span className="file-name">{file.name}</span>
                <span className="file-meta">{file.track.artist !== 'Unknown Artist' ? file.track.artist : ''}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default function Library({ musicFiles, currentTrackId, initialFilter }: LibraryProps) {
  const [activeTab, setActiveTab] = useState<TabType>('albums');
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<string | null>(null);

  useEffect(() => {
    if (initialFilter) {
      if (initialFilter.filter) {
        // It's a filtering navigation (e.g. click on an album to see its tracks)
        setActiveTab('tracks');
        if (initialFilter.tab === 'artists') {
          setSelectedArtist(initialFilter.filter);
          setSelectedAlbum(null);
        } else if (initialFilter.tab === 'albums') {
          setSelectedAlbum(initialFilter.filter);
          setSelectedArtist(null);
        }
      } else {
        // Just navigate to the tab (e.g. View All albums)
        setActiveTab(initialFilter.tab as TabType);
        setSelectedArtist(null);
        setSelectedAlbum(null);
      }
    }
  }, [initialFilter]);
  
  const { playContext, isShuffled, toggleShuffle } = useQueue();

  const TABS: { id: TabType; label: string }[] = [
    { id: 'albums', label: 'Album' },
    { id: 'artists', label: 'Artist' },
    { id: 'tracks', label: 'Tracks' },
    { id: 'genres', label: 'Genres' },
    { id: 'hires', label: 'Hi-Res' },
    { id: 'folderview', label: 'Folder View' },
  ];

  // Derive unique lists
  const { albums, artists, totalDurationStr } = useMemo(() => {
    const albumMap = new Map<string, { title: string; artist: string; coverArt?: string }>();
    const artistMap = new Map<string, { name: string; coverArt?: string }>();
    let totalSecs = 0;

    musicFiles.forEach(t => {
      totalSecs += t.durationSecs;
      
      const aTitle = t.album && t.album !== 'Unknown Album' ? t.album : 'Unknown Album';
      if (!albumMap.has(aTitle)) {
        albumMap.set(aTitle, { title: aTitle, artist: t.artist, coverArt: t.coverArt ?? undefined });
      } else if (t.coverArt) {
        const existing = albumMap.get(aTitle)!;
        if (!existing.coverArt) existing.coverArt = t.coverArt;
      }

      const aName = t.artist && t.artist !== 'Unknown Artist' ? t.artist : 'Unknown Artist';
      if (!artistMap.has(aName)) {
        artistMap.set(aName, { name: aName, coverArt: t.coverArt ?? undefined });
      } else if (t.coverArt) {
        const existing = artistMap.get(aName)!;
        if (!existing.coverArt) existing.coverArt = t.coverArt;
      }
    });

    const albumList = Array.from(albumMap.values());
    const artistList = Array.from(artistMap.values());

    const hours = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = Math.floor(totalSecs % 60);
    const durStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m ${secs}s`;

    return { 
      albums: albumList.sort((a, b) => a.title.localeCompare(b.title)), 
      artists: artistList.sort((a, b) => a.name.localeCompare(b.name)), 
      totalDurationStr: durStr 
    };
  }, [musicFiles]);

  const displayedTracks = useMemo(() => {
    let result = musicFiles;
    if (activeTab === 'tracks') {
      if (selectedArtist) result = musicFiles.filter(t => t.artist === selectedArtist);
      else if (selectedAlbum) result = musicFiles.filter(t => t.album === selectedAlbum);
    } else if (activeTab === 'hires') {
      // Show ONLY 'HR' tagged tracks based on TrackRow.tsx logic (sampleRate >= 88.2kHz OR bitDepth > 16)
      result = musicFiles.filter(t => (t.sampleRate && t.sampleRate >= 88200) || (t.bitDepth && t.bitDepth > 16));
    }
    
    // Sort all tracks alphabetically by title
    return [...result].sort((a, b) => a.title.localeCompare(b.title));
  }, [musicFiles, activeTab, selectedArtist, selectedAlbum]);

  const folderTree = useMemo(() => {
    const root: DirNode = { name: 'root', type: 'dir', children: {} };
    
    musicFiles.forEach((track, index) => {
      const sep = track.path.includes('\\') ? '\\' : '/';
      const parts = track.path.split(sep).filter(Boolean);
      
      const filename = parts.pop() || track.fileName;
      
      let currentDir = root;
      for (const part of parts) {
        if (!currentDir.children[part]) {
          currentDir.children[part] = { name: part, type: 'dir', children: {} };
        }
        currentDir = currentDir.children[part] as DirNode;
      }
      
      currentDir.children[filename] = { name: filename, type: 'file', track, originalIndex: index };
    });
    
    // Collapse singular root nodes to find actual library root
    let actualRoot = root;
    while (Object.keys(actualRoot.children).length === 1) {
      const onlyChild = Object.values(actualRoot.children)[0];
      if (onlyChild.type === 'dir') {
        actualRoot = onlyChild as DirNode;
      } else {
        break;
      }
    }

    return actualRoot;
  }, [musicFiles]);

  const handleTabClick = (tab: TabType) => {
    setActiveTab(tab);
    if (tab !== 'tracks') {
      setSelectedArtist(null);
      setSelectedAlbum(null);
    }
  };

  const handleArtistClick = (artistName: string) => {
    setSelectedArtist(artistName);
    setActiveTab('tracks');
  };

  const handlePlayAll = () => {
    if (activeTab === 'albums') {
      const sorted = [...musicFiles].sort((a, b) => (a.album || '').localeCompare(b.album || ''));
      playContext(sorted, 0);
    } else if (activeTab === 'artists') {
      const sorted = [...musicFiles].sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
      playContext(sorted, 0);
    } else if (activeTab === 'folderview' || activeTab === 'genres') {
      playContext(musicFiles, 0);
    } else {
      if (displayedTracks.length > 0) {
        playContext(displayedTracks, 0);
      }
    }
  };

  const handleAlbumPlay = (albumTitle: string) => {
    const albumTracks = musicFiles.filter(t => t.album === albumTitle);
    if (albumTracks.length > 0) {
      playContext(albumTracks, 0);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'albums':
        return (
          <div className="albums-grid">
            {albums.map((album, idx) => (
              <AlbumCard
                key={idx}
                title={album.title}
                artist={album.artist}
                coverArt={album.coverArt}
                onClick={() => handleAlbumPlay(album.title)}
              />
            ))}
          </div>
        );

      case 'artists':
        return (
          <div className="artists-grid">
            {artists.map((artist, idx) => (
              <div key={idx} className="artist-card" onClick={() => handleArtistClick(artist.name)}>
                <div className="artist-avatar-wrapper">
                  {artist.coverArt ? (
                    <img src={artist.coverArt.startsWith('data:') ? artist.coverArt : convertFileSrc(artist.coverArt)} alt={artist.name} className="artist-avatar" />
                  ) : (
                    <div className="artist-placeholder">♪</div>
                  )}
                  <div className="play-overlay">
                    <button 
                      className="play-btn" 
                      onClick={(e) => {
                        e.stopPropagation();
                        const artistTracks = musicFiles.filter(t => t.artist === artist.name);
                        if (artistTracks.length > 0) playContext(artistTracks, 0);
                      }}
                    >
                      <IconPlayBtn />
                    </button>
                  </div>
                </div>
                <span className="artist-name">{artist.name}</span>
              </div>
            ))}
          </div>
        );

      case 'hires':
      case 'tracks':
        return (
          <div className="music-list">
            <div className="music-list-header">
              <span className="col-num">#</span>
              <span className="col-title">Title</span>
              <span className="col-album">Album</span>
              <span className="col-duration">Time</span>
              <span className="col-source"></span>
              <span className="col-action">Action</span>
            </div>
            <div className="tracks-container">
              {displayedTracks.map((track, index) => {
                const durationFormatted = track.durationSecs > 0
                  ? `${Math.floor(track.durationSecs / 60)}:${(track.durationSecs % 60).toString().padStart(2, '0')}`
                  : '0:00';
                return (
                  <TrackRow
                    key={track.id}
                    trackNumber={index + 1}
                    title={track.title}
                    artist={track.artist}
                    album={track.album}
                    duration={durationFormatted}
                    coverArt={track.coverArt || undefined}
                    sampleRate={track.sampleRate}
                    bitDepth={track.bitDepth}
                    bitrate={track.bitrate}
                    filePath={track.path}
                    variant="wide"
                    isActive={track.id === currentTrackId}
                    isCloud={track.path.startsWith('http')}
                    onClick={() => playContext(displayedTracks, index)}
                  />
                );
              })}
              {displayedTracks.length === 0 && (
                <div className="dashboard-empty" style={{ marginTop: '2rem' }}>No tracks found.</div>
              )}
            </div>
          </div>
        );

      case 'folderview':
        return (
          <div className="folder-view-container">
            <FolderTreeComponent 
              node={folderTree} 
              onPlayTrack={(_track, idx) => playContext(musicFiles, idx)} 
            />
          </div>
        );

      default:
        return <div className="coming-soon">Content coming soon</div>;
    }
  };

  return (
    <div className="library-page">
      {/* Top Tabs */}
      <div className="library-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`tab-pill ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Header Actions & Stats */}
      <div className="library-action-bar">
        <div className="left-actions">
          <button className="icon-btn play-all-btn" onClick={handlePlayAll}>
            <IconPlayBtn style={{ width: 36, height: 36 }} />
          </button>
          <button className={`icon-btn shuffle-btn ${isShuffled ? 'active' : ''}`} onClick={toggleShuffle}>
            {isShuffled ? <IconShuffleActive style={{ width: 20, height: 20 }} /> : <IconShuffle style={{ width: 20, height: 20 }} />}
          </button>
          {(selectedArtist || selectedAlbum) && activeTab === 'tracks' && (
            <span className="filter-badge">
              {selectedArtist || selectedAlbum}
              <button className="clear-filter" onClick={(e) => { e.stopPropagation(); setSelectedArtist(null); setSelectedAlbum(null); }}>×</button>
            </span>
          )}
        </div>
        <div className="right-stats">
          {activeTab === 'hires' ? (
            `${displayedTracks.length} high-resolution tracks`
          ) : activeTab === 'artists' ? (
            `${artists.length} artists • ${musicFiles.length} tracks • ${totalDurationStr}`
          ) : (
            `${albums.length} albums • ${musicFiles.length} tracks • ${totalDurationStr}`
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="library-content">
        {renderContent()}
      </div>
    </div>
  );
}
