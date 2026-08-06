import { useState, useRef, useEffect } from 'react';
import './MainContent.scss';
import TrackRow from '../TrackRow/TrackRow';
import AlbumCard from '../AlbumCard/AlbumCard';
import { Track } from '../../types';
import iconPrevBtn from '../../assets/Previous Btn.svg';
import iconNextBtn from '../../assets/Next Btn.svg';
import iconPlayBtn from '../../assets/playing-tab-icons/Play Btn.svg';
import iconShuffle from '../../assets/playing-tab-icons/Suffle Songs.svg';
import iconShuffleActive from '../../assets/playing-tab-icons/Suffle Songs Active.svg';
import { useQueue } from '../../context/QueueContext';

interface MainContentProps {
  musicFiles: Track[];
  currentTrackId?: string | number;
  onTrackSelect?: (track: Track) => void;
  searchQuery?: string;
}

export default function MainContent({ musicFiles, currentTrackId, searchQuery = '' }: MainContentProps) {
  const recentFiles = [...musicFiles].reverse();

  const query = searchQuery.trim().toLowerCase();
  const filteredFiles = query
    ? recentFiles.filter(t =>
      t.title.toLowerCase().includes(query) ||
      t.artist.toLowerCase().includes(query) ||
      t.album.toLowerCase().includes(query) ||
      t.fileName.toLowerCase().includes(query)
    )
    : recentFiles;

  // Extract distinct albums from the reversed list (most recently added first)
  const distinctAlbums = [];
  const albumNames = new Set();
  for (const track of recentFiles) {
    if (track.album && track.album !== 'Unknown Album' && !albumNames.has(track.album)) {
      albumNames.add(track.album);
      distinctAlbums.push({
        title: track.album,
        artist: track.artist,
        coverArt: track.coverArt
      });
      if (distinctAlbums.length >= 10) break;
    }
  }
  const recentAlbums = distinctAlbums;

  const totalDuration = filteredFiles.reduce((acc, curr) => acc + curr.durationSecs, 0);
  const totalHours = Math.floor(totalDuration / 3600);
  const totalMins = Math.floor((totalDuration % 3600) / 60);
  const totalSecs = Math.floor(totalDuration % 60);
  const durationStr = totalHours > 0
    ? `${totalHours}h ${totalMins}m`
    : (totalMins > 0 ? `${totalMins}m ${totalSecs}s` : `${totalSecs}s`);

  const { playContext, isShuffled, toggleShuffle } = useQueue();

  const handleAlbumPlay = (albumTitle: string) => {
    // Find tracks in original order for playback to keep album sequences intact
    const albumTracks = musicFiles.filter(t => t.album === albumTitle);
    if (albumTracks.length > 0) {
      playContext(albumTracks, 0);
    }
  };

  const handlePlayAll = () => {
    if (filteredFiles.length > 0) {
      playContext(filteredFiles, 0);
    }
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [recentAlbums]);

  const scrollLeft = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: -320, behavior: 'smooth' });
    }
  };

  const scrollRight = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: 320, behavior: 'smooth' });
    }
  };

  return (
    <div className="home-content">
      {/* RECENT ALBUMS SECTION */}
      {!query && recentAlbums.length > 0 && (
        <div className="recent-albums-section">
          <div className="section-header">
            <h2 className="section-title">Recent albums</h2>
            <div className="section-actions">
              <span className="view-all">View all</span>
              <button
                className="nav-btn"
                onClick={scrollLeft}
                style={{ opacity: canScrollLeft ? 1 : 0.3, cursor: canScrollLeft ? 'pointer' : 'default' }}
              >
                <img src={iconPrevBtn} alt="Previous" />
              </button>
              <button
                className="nav-btn"
                onClick={scrollRight}
                style={{ opacity: canScrollRight ? 1 : 0.3, cursor: canScrollRight ? 'pointer' : 'default' }}
              >
                <img src={iconNextBtn} alt="Next" />
              </button>
            </div>
          </div>
          <div className="albums-container" ref={scrollRef} onScroll={checkScroll}>
            {recentAlbums.map((album, idx) => (
              <AlbumCard
                key={idx}
                title={album.title}
                artist={album.artist}
                coverArt={album.coverArt || undefined}
                onClick={() => handleAlbumPlay(album.title)}
              />
            ))}
          </div>
        </div>
      )}

      {/* RECENT TRACKS SECTION */}
      <div className="recent-tracks-section">
        <div className="section-header">
          <h2 className="section-title">{query ? 'Search Results' : 'Recent tracks'}</h2>
          <div className="section-actions tracks-actions">
            <span className="tracks-meta">
              {filteredFiles.length} tracks &bull; {durationStr}
            </span>
            <button className={`icon-btn shuffle-btn ${isShuffled ? 'active' : ''}`} onClick={toggleShuffle}>
              <img
                src={isShuffled ? iconShuffleActive : iconShuffle}
                alt="Shuffle"
                style={{ width: 18, height: 18 }}
              />
            </button>
            <button className="icon-btn play-all-btn" onClick={handlePlayAll}>
              <img src={iconPlayBtn} alt="Play" style={{ width: 30, height: 30 }} />
            </button>
          </div>
        </div>

        {filteredFiles.length === 0 ? (
          <p className="dashboard-empty">
            {query ? `No results found for "${searchQuery}"` : 'No music files found. Try syncing a different folder.'}
          </p>
        ) : (
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
              {filteredFiles.map((track, index) => {
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
                    isCloud={index % 2 === 0} // Just for demo, alternating source icons
                    onClick={() => playContext(filteredFiles, index)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
