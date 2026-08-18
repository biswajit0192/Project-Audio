import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Pencil, Trash2, Check } from 'lucide-react';
import { EQProfile } from '../../types';
import './EqualizerView.scss';
import { useEQ, ISO_15, ISO_31, EqBandPayload } from '../../context/EQContext';
import { generateSplinePaths } from '../../utils/eqUtils';

function interpolateGainAtFrequency(targetFreq: number, sourceBands: { freq: number; gain: number }[]): number {
  if (!sourceBands || sourceBands.length === 0) return 0;
  
  const sorted = [...sourceBands].sort((a, b) => a.freq - b.freq);
  
  if (targetFreq <= sorted[0].freq) return sorted[0].gain;
  if (targetFreq >= sorted[sorted.length - 1].freq) return sorted[sorted.length - 1].gain;

  let idx = 0;
  while (idx < sorted.length - 1 && sorted[idx + 1].freq < targetFreq) {
    idx++;
  }
  const b1 = sorted[idx];
  const b2 = sorted[idx + 1];

  const log1 = Math.log10(b1.freq);
  const log2 = Math.log10(b2.freq);
  const logTarget = Math.log10(targetFreq);
  const t = (logTarget - log1) / (log2 - log1);

  const smoothT = (1 - Math.cos(t * Math.PI)) / 2;
  return Number((b1.gain + (b2.gain - b1.gain) * smoothT).toFixed(1));
}

export interface EqBandPayload {
    index: number;
    freq: number;
    gain: number;
    bandwidth?: number;
}

export default function EqualizerView() {
  const {
    bands,
    activePreset,
    baselineProfileRef,
    hasUnsavedChanges,
    bandMode,
    isFreqLocked, setIsFreqLocked,
    profiles,
    updateBandsAndPreset,
    resetToFlat,
    handleReset,
    loadProfile,
    handleBandModeSwitch,
    deleteProfile,
    
    isSaveModalOpen, setIsSaveModalOpen,
    saveTab, setSaveTab,
    selectedUpdateProfileId, setSelectedUpdateProfileId,
    isEditModalOpen, setIsEditModalOpen,
    setEditingProfileId,
    newProfileName, setNewProfileName,
    linkCurrentDevice, setLinkCurrentDevice,
    autoSwitch, setAutoSwitch,
    currentDeviceName,
    
    saveProfile,
    saveEditProfile
  } = useEQ();

  const svgRef = useRef<SVGSVGElement>(null);

  const svgWidth = 1000;
  const svgHeight = 380;
  const plotX = 42;
  const plotWidth = 933; // 975 - 42
  const plotYTop = 45;
  const plotYBottom = 317;

  const minLog = Math.log10(20);
  const maxLog = Math.log10(20000);

  const freqToX = (freq: number) => {
    const clampedFreq = Math.max(20, Math.min(20000, freq));
    const t = (Math.log10(clampedFreq) - minLog) / (maxLog - minLog);
    return plotX + t * plotWidth;
  };
  const xToFreq = (x: number) => {
    const t = (x - plotX) / plotWidth;
    return Math.pow(10, t * (maxLog - minLog) + minLog);
  };
  const gainToY = (gain: number) => {
    const clampedGain = Math.max(-30, Math.min(30, gain));
    // Scale factor
    const midY = (plotYBottom + plotYTop) / 2;
    const heightPerDb = (plotYBottom - plotYTop) / 60; 
    return midY - (clampedGain * heightPerDb);
  };
  const yToGain = (y: number) => {
    const midY = (plotYBottom + plotYTop) / 2;
    const heightPerDb = (plotYBottom - plotYTop) / 60;
    const rawGain = (midY - y) / heightPerDb;
    return Number(Math.max(-30, Math.min(30, rawGain)).toFixed(1));
  };
  
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);


  const handlePointerDown = (e: React.PointerEvent, index: number) => {
    setDragIndex(index);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (dragIndex === null || !svgRef.current) return;
    
    const svgRect = svgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - svgRect.left, svgRect.width));
    const y = Math.max(0, Math.min(e.clientY - svgRect.top, svgRect.height));
    
    const viewX = (x / svgRect.width) * svgWidth;
    const viewY = (y / svgRect.height) * svgHeight;
    
    const newGain = yToGain(viewY);
    
    const newBands = [...bands];
    newBands[dragIndex].gain = newGain;
    
    if (!isFreqLocked) {
      let newFreq = xToFreq(viewX);
      newFreq = Math.max(20, Math.min(20000, newFreq));
      newBands[dragIndex].freq = newFreq;
    }
    
    updateBandsAndPreset(newBands);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragIndex !== null) {
      (e.target as Element).releasePointerCapture(e.pointerId);
      setDragIndex(null);
    }
  };

  const handleDoubleClick = (index: number) => {
    const newBands = [...bands];
    newBands[index].gain = 0;
    updateBandsAndPreset(newBands);
  };

  const { linePath, areaPath, points } = generateSplinePaths(bands, svgWidth, svgHeight, plotX, plotWidth, plotYTop, plotYBottom);
  
  return (
    <div className="equalizer-view">
      <div className="eq-header">
        <h2 className="section-heading">Equalizer</h2>
        <div className="eq-preset-dropdown-container" ref={dropdownRef}>
          <div 
            className="eq-preset-trigger" 
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <span>{activePreset === "Custom" ? "Custom Profile" : activePreset}</span>
            <ChevronDown size={16} />
          </div>
          
                    {isDropdownOpen && (
            <div className="eq-dropdown-menu">
              {profiles.filter(p => p.id.startsWith('default-')).map(p => (
                <div 
                  key={p.id} 
                  className={`eq-dropdown-item ${activePreset === p.name ? "active" : ""}`}
                  onClick={() => { 
                    if (p.name === 'Flat') resetToFlat(bandMode);
                    else loadProfile(p); 
                    setIsDropdownOpen(false); 
                  }}
                >
                  <span className="profile-name">{p.name}</span>
                  {activePreset === p.name && <Check size={14} className="check-icon" />}
                </div>
              ))}
              
              <div className="eq-dropdown-divider" />
              
              {profiles.filter(p => !p.id.startsWith('default-')).map(p => (
                <div 
                  key={p.id} 
                  className={`eq-dropdown-item ${activePreset === p.name ? "active" : ""}`}
                  onClick={() => { loadProfile(p); setIsDropdownOpen(false); }}
                >
                  <span className="profile-name">{p.name}</span>
                  {activePreset === p.name && <Check size={14} className="check-icon" />}
                  
                  <div className="item-actions" onClick={e => e.stopPropagation()}>
                    <button 
                      className="action-btn"
                      onClick={() => {
                        setEditingProfileId(p.id);
                        setNewProfileName(p.name);
                        setLinkCurrentDevice(!!p.linkedDeviceName);
                        setAutoSwitch(p.autoSwitchOnConnect);
                        setIsEditModalOpen(true);
                        setIsDropdownOpen(false);
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button 
                      className="action-btn delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteProfile(p.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="eq-graph-container">
        <svg 
          ref={svgRef}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="eq-svg"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >

          
          <defs>
            <linearGradient id="eq-glow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff3b30" stopOpacity="0.35"/>
              <stop offset="100%" stopColor="#dc2626" stopOpacity="0.0"/>
            </linearGradient>
          </defs>

          {/* Full Matrix Vertical Gridlines */}
          {ISO_15.map(f => {
             const x = freqToX(f);
             return <line key={`vgrid-${f}`} x1={x} y1={45} x2={x} y2={317} stroke="rgba(255, 255, 255, 0.04)" strokeWidth="1" />;
          })}

          {[30, 15, 0, -15, -30].map(gain => {
            const y = gainToY(gain);
            return (
              <g key={`y-${gain}`}>
                <line x1={plotX} y1={y} x2={plotX + plotWidth} y2={y} className={`grid-line ${gain === 0 ? 'zero-line' : ''}`} />
                <text x={34} y={y + 4} className="y-axis-label">{gain > 0 ? `+${gain}` : gain}</text>
              </g>
            );
          })}

          {[{f: 60, l: "Sub-Bass", cf: Math.sqrt(20*60)}, {f: 250, l: "Bass", cf: Math.sqrt(60*250)}, {f: 500, l: "Low Mids", cf: Math.sqrt(250*500)}, {f: 2000, l: "Midrange", cf: Math.sqrt(500*2000)}, {f: 4000, l: "Upper Mids", cf: Math.sqrt(2000*4000)}, {f: 20000, l: "Treble", cf: Math.sqrt(4000*20000)}].map((zone, i) => {
            const vx = freqToX(zone.f);
            const cx = freqToX(zone.cf);
            return (
              <g key={`zone-${zone.f}`}>
                {zone.f < 20000 && <line x1={vx} y1={45} x2={vx} y2={317} stroke="rgba(255, 255, 255, 0.18)" strokeDasharray="3 3" strokeWidth="1.2" />}
                <text x={cx} y={30} className="zone-title">{zone.l}</text>
              </g>
            );
          })}

          {ISO_15.map(f => {
            const text = f >= 1000 ? (f % 1000 === 0 ? `${f/1000}k` : `${(f/1000).toFixed(1)}k`) : `${f}`;
            return <text key={`x-${f}`} x={freqToX(f)} y={352} className="x-axis-label">{text}</text>;
          })}

          <path d={areaPath} fill="url(#eq-glow)" />
          <path d={linePath} className="eq-path-stroke" fill="none" />

          {points.map((pt, i) => (
            <circle
              key={i}
              cx={pt.x}
              cy={pt.y}
              r={dragIndex === i ? 6 : 4}
              className={`eq-node ${dragIndex === i ? 'dragging' : ''}`}
              onPointerDown={(e) => handlePointerDown(e, i)}
              onDoubleClick={() => handleDoubleClick(i)}
            >
              <title>{`${pt.b.freq < 1000 ? Math.round(pt.b.freq) + 'Hz' : (pt.b.freq/1000).toFixed(1) + 'kHz'} • ${pt.b.gain > 0 ? '+' : ''}${pt.b.gain.toFixed(1)}dB`}</title>
            </circle>
          ))}
        </svg>
      </div>

      <div className="eq-controls-rack">
        <div className="rack-header">
          <div className="mode-switcher">
            <button className={bandMode === '15-band' ? 'active' : ''} onClick={() => handleBandModeSwitch('15-band')}>15-band</button>
            <button className={bandMode === '31-band' ? 'active' : ''} onClick={() => handleBandModeSwitch('31-band')}>31-band</button>
          </div>
          <div className="actions-right" style={{ display: 'flex', gap: '8px' }}>
            <button className={`lock-toggle ${isFreqLocked ? 'locked' : ''}`} onClick={() => setIsFreqLocked(!isFreqLocked)}>
              {isFreqLocked ? 'Unlock Freq' : 'Lock Freq'}
            </button>
            <button 
              className="reset-btn ghost" 
              onClick={handleReset}
              disabled={!hasUnsavedChanges}
              title={baselineProfileRef && hasUnsavedChanges ? `Revert unsaved changes to ${baselineProfileRef.name}` : "Reset EQ"}
              style={{ opacity: hasUnsavedChanges ? 1 : 0.5 }}
            >
              Reset
            </button>
            <button className="eq-save-btn primary" onClick={() => {
              const currentCustom = profiles.find(p => p.name === activePreset && p.id.startsWith('custom-'));
              setSaveTab(currentCustom ? 'update' : 'new');
              if (currentCustom) setSelectedUpdateProfileId(currentCustom.id);
              setIsSaveModalOpen(true);
            }}>Save Profile</button>
          </div>
        </div>
        
        <div className="bands-scroll-container">
          {bands.map((band, i) => (
            <div key={i} className="band-col">
              <span className="gain-label" onDoubleClick={() => handleDoubleClick(i)} title="Double-click to reset">
                {band.gain > 0 ? '+' : ''}{band.gain.toFixed(1)}
              </span>
              <input 
                type="range"
                className="vertical-slider"
                onDoubleClick={() => handleDoubleClick(i)}
                min="-30" max="30" step="0.1"
                value={band.gain}
                onChange={(e) => {
                  const newBands = [...bands];
                  newBands[i].gain = Math.max(-30, Math.min(30, parseFloat(e.target.value)));
                  updateBandsAndPreset(newBands);
                }}
                style={{
                  '--track-bg': `linear-gradient(to top, #F92E16 ${((band.gain - (-30)) / 60) * 100}%, #2b2b2b ${((band.gain - (-30)) / 60) * 100}%)`
                } as React.CSSProperties}
              />
              <input
                type="number"
                className="freq-input"
                disabled={isFreqLocked}
                value={Math.round(band.freq)}
                onChange={(e) => {
                  const newBands = [...bands];
                  newBands[i].freq = Math.max(20, Math.min(20000, parseFloat(e.target.value) || 20));
                  updateBandsAndPreset(newBands);
                }}
              />
              <span className="band-name">B{i+1}</span>
            </div>
          ))}
        </div>
      </div>

      
      {isEditModalOpen && (
        <div className="eq-modal-overlay">
          <div className="eq-modal">
            <h3>Edit Profile Details</h3>
            <input 
              type="text" 
              placeholder="Profile Name" 
              value={newProfileName} 
              onChange={e => setNewProfileName(e.target.value)} 
              className="preset-name-input"
            />
            <label className="checkbox-label">
              <input type="checkbox" checked={linkCurrentDevice} onChange={e => setLinkCurrentDevice(e.target.checked)} />
              Link to current device ({currentDeviceName})
            </label>
            <label className="checkbox-label" style={{ opacity: linkCurrentDevice ? 1 : 0.5 }}>
              <input type="checkbox" disabled={!linkCurrentDevice} checked={autoSwitch} onChange={e => setAutoSwitch(e.target.checked)} />
              Auto-apply when connected
            </label>
            <div className="modal-actions">
              <button onClick={() => setIsEditModalOpen(false)}>Cancel</button>
              <button className="primary" onClick={saveEditProfile} disabled={!newProfileName}>Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {isSaveModalOpen && (
        <div className="eq-modal-overlay">
          <div className="eq-modal">
            <div className="eq-modal-tabs">
              <button className={saveTab === 'update' ? 'active' : ''} onClick={() => setSaveTab('update')}>Update Existing</button>
              <button className={saveTab === 'new' ? 'active' : ''} onClick={() => setSaveTab('new')}>Create New</button>
            </div>

            {saveTab === 'update' && (
              <div className="eq-modal-content">
                <div className="profiles-list">
                  {profiles.filter(p => p.id.startsWith('custom-')).map(p => (
                    <div 
                      key={p.id} 
                      className={`profile-item ${selectedUpdateProfileId === p.id ? 'selected' : ''}`}
                      onClick={() => setSelectedUpdateProfileId(p.id)}
                    >
                      <span>{p.name}</span>
                      <button className="delete-btn" onClick={(e) => deleteProfile(p.id, e)}>×</button>
                    </div>
                  ))}
                  {profiles.filter(p => p.id.startsWith('custom-')).length === 0 && (
                    <div className="no-profiles">No custom profiles saved yet.</div>
                  )}
                </div>
                <div className="modal-actions">
                  <button onClick={() => setIsSaveModalOpen(false)}>Cancel</button>
                  <button className="primary" onClick={saveProfile} disabled={!selectedUpdateProfileId}>Overwrite Profile</button>
                </div>
              </div>
            )}

            {saveTab === 'new' && (
              <div className="eq-modal-content">
                <input 
                  type="text" 
                  placeholder="Profile Name" 
                  value={newProfileName} 
                  onChange={e => setNewProfileName(e.target.value)} 
                  className="preset-name-input"
                />
                <label className="checkbox-label">
                  <input type="checkbox" checked={linkCurrentDevice} onChange={e => setLinkCurrentDevice(e.target.checked)} />
                  Link to current device ({currentDeviceName})
                </label>
                <label className="checkbox-label" style={{ opacity: linkCurrentDevice ? 1 : 0.5 }}>
                  <input type="checkbox" disabled={!linkCurrentDevice} checked={autoSwitch} onChange={e => setAutoSwitch(e.target.checked)} />
                  Auto-apply when connected
                </label>
                <div className="modal-actions">
                  <button onClick={() => setIsSaveModalOpen(false)}>Cancel</button>
                  <button className="primary" onClick={saveProfile} disabled={!newProfileName}>Save New Profile</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
