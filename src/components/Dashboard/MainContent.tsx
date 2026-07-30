
import './MainContent.scss';
import TrackRow from '../TrackRow/TrackRow';
import { Track } from '../../types';

interface MainContentProps {
  musicFiles: Track[];
  currentTrackId?: string | number;
  onTrackSelect?: (track: Track) => void;
  searchQuery?: string;
}

export default function MainContent({ musicFiles, currentTrackId, onTrackSelect, searchQuery = '' }: MainContentProps) {
  const query = searchQuery.trim().toLowerCase();
  const filteredFiles = query
    ? musicFiles.filter(t => 
        t.title.toLowerCase().includes(query) ||
        t.artist.toLowerCase().includes(query) ||
        t.album.toLowerCase().includes(query) ||
        t.fileName.toLowerCase().includes(query)
      )
    : musicFiles;
  return (
    <div className="home-content">
      <h1 className="dashboard-title">Your Music Library</h1>
      
      {filteredFiles.length === 0 ? (
        <p className="dashboard-empty">
          {query ? `No results found for "${searchQuery}"` : 'No music files found. Try syncing a different folder.'}
        </p>
      ) : (
        <div className="music-list">
          <p className="music-count">
            {query ? `Showing ${filteredFiles.length} of ${musicFiles.length} tracks` : `Found ${musicFiles.length} tracks`}
          </p>
          <div className="music-list-header">
            <span className="col-num">#</span>
            <span className="col-title">Title</span>
            <span className="col-album">Album</span>
            <span className="col-duration">Duration</span>
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
                  variant="wide"
                  isActive={track.id === currentTrackId}
                  isCloud={index % 2 === 0} // Just for demo, alternating source icons
                  onClick={() => onTrackSelect && onTrackSelect(track)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
