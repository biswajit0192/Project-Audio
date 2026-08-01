import { useState } from 'react';
import './RightPanel.scss';
import { useQueue } from '../../context/QueueContext';
import { PlusCircle, MoreVertical } from 'lucide-react';

export default function RightPanel() {
  const { queue, currentIndex, removeFromQueue, playContext } = useQueue();


  const formatDuration = (secs: number) => {
    if (!secs) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleJumpToTrack = (indexInQueue: number) => {
    playContext(queue, indexInQueue);
  };

  return (
    <div className="dashboard-right-panel">
      <div className="right-panel-header">
        <h2 className="section-title">Queue</h2>
      </div>

      <div className="right-panel-content">
        <div className="queue-view">
          <div className="queue-list-section">
              {queue.length === 0 ? (
                <div className="placeholder-text">Queue is empty</div>
              ) : (
                <div className="queue-list">
                  {queue.map((track, i) => {
                    const isPlaying = i === currentIndex;
                    return (
                      <div 
                        key={`${track.id}-${i}`} 
                        className={`queue-item ${isPlaying ? 'playing' : ''}`}
                        onClick={() => handleJumpToTrack(i)}
                      >
                        <div className="item-left-group">
                          {track.coverArt ? (
                            <img src={track.coverArt} className="item-cover" alt="" />
                          ) : (
                            <div className="item-cover-placeholder" />
                          )}
                          <div className="item-info">
                            <div className="item-title">{track.title}</div>
                            <div className="item-artist">{track.artist}</div>
                          </div>
                        </div>
                        <div className="item-meta">
                          <span className="item-duration">{formatDuration(track.durationSecs)}</span>
                          <button className="action-btn">
                            <PlusCircle size={18} strokeWidth={1.5} />
                          </button>
                          <button className="action-btn">
                            <MoreVertical size={18} strokeWidth={1.5} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
    </div>
  );
}
