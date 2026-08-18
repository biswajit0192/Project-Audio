import React, { useRef, useEffect } from 'react';
import { useEQ } from '../../context/EQContext';
import { generateSplinePaths } from '../../utils/eqUtils';
import { ChevronDown, Check, Pencil, Trash2 } from 'lucide-react';
import './QuickEqualizer.scss';

const MACRO_ZONES = [
  { id: 'sub-bass', label: 'Sub-Bass', range: '20Hz - 60Hz', minF: 20, maxF: 60 },
  { id: 'bass', label: 'Bass', range: '60Hz - 250Hz', minF: 60, maxF: 250 },
  { id: 'low-mids', label: 'Low Mids', range: '250Hz - 500Hz', minF: 250, maxF: 500 },
  { id: 'midrange', label: 'Midrange', range: '500Hz - 2kHz', minF: 500, maxF: 2000 },
  { id: 'upper-mids', label: 'Upper Mids', range: '2kHz - 4kHz', minF: 2000, maxF: 4000 },
  { id: 'treble', label: 'Treble', range: '4kHz - 20kHz', minF: 4000, maxF: 20000 },
];

export default function QuickEqualizer() {
  const { 
    bands, 
    updateBandsAndPreset,
    activePreset,
    profiles,
    resetToFlat,
    loadProfile,
    deleteProfile,
    bandMode,
    isDropdownOpen, setIsDropdownOpen,
    setEditingProfileId, setNewProfileName, setLinkCurrentDevice, setAutoSwitch, setIsEditModalOpen,
    setIsSaveModalOpen, setSaveTab, setSelectedUpdateProfileId, hasUnsavedChanges
  } = useEQ();

  // We need to add `isDropdownOpen` to context, or just manage it locally if it doesn't need to be shared. 
  // Wait, isDropdownOpen isn't in context. Let's manage it locally here for the sidebar pill.
  const [localDropdownOpen, setLocalDropdownOpen] = React.useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setLocalDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute macro gains
  const getMacroGain = (minF: number, maxF: number) => {
    if (!bands || bands.length === 0) return 0;
    const bandsInZone = bands.filter(b => b.freq >= minF && b.freq <= maxF);
    if (bandsInZone.length === 0) return 0;
    const sum = bandsInZone.reduce((acc, b) => acc + b.gain, 0);
    return Number((sum / bandsInZone.length).toFixed(1));
  };

  const handleMacroChange = (minF: number, maxF: number, newMacroGain: number) => {
    const currentMacroGain = getMacroGain(minF, maxF);
    const delta = newMacroGain - currentMacroGain;
    
    const newBands = bands.map(b => {
      if (b.freq >= minF && b.freq <= maxF) {
        return { ...b, gain: Math.max(-30, Math.min(30, Number((b.gain + delta).toFixed(1)))) };
      }
      return b;
    });
    
    updateBandsAndPreset(newBands);
  };

  // SVG Preview Math
  // We use a small, non-interactive version of the Catmull-Rom spline.
  const svgWidth = 320;
  const svgHeight = 160;
  const plotX = 24;
  const plotWidth = 296;
  const plotYTop = 20;
  const plotYBottom = 140;

  const { linePath, areaPath } = generateSplinePaths(bands, svgWidth, svgHeight, plotX, plotWidth, plotYTop, plotYBottom);

  const freqToX = (freq: number) => {
    const minLog = Math.log10(20);
    const maxLog = Math.log10(20000);
    const t = (Math.log10(Math.max(20, Math.min(20000, freq))) - minLog) / (maxLog - minLog);
    return plotX + t * plotWidth;
  };
  const gainToY = (gain: number) => {
    const clampedGain = Math.max(-30, Math.min(30, gain));
    const midY = (plotYBottom + plotYTop) / 2;
    const heightPerDb = (plotYBottom - plotYTop) / 60; 
    return midY - (clampedGain * heightPerDb);
  };

  return (
    <div className="quick-eq-container">
      <div className="quick-eq-header">
        <h2 className="section-heading">Equalizer</h2>
        
        <div className="eq-preset-dropdown-container" ref={dropdownRef}>
          <div 
            className="eq-preset-trigger" 
            onClick={() => setLocalDropdownOpen(!localDropdownOpen)}
          >
            <span className="truncate">{activePreset === "Custom" ? "Custom Profile" : activePreset}</span>
            <ChevronDown size={14} />
          </div>
          
          {localDropdownOpen && (
            <div className="eq-dropdown-menu">
              {profiles.filter(p => p.id.startsWith('default-')).map(p => (
                <div 
                  key={p.id} 
                  className={`eq-dropdown-item ${activePreset === p.name ? "active" : ""}`}
                  onClick={() => { 
                    if (p.name === 'Flat') resetToFlat(bandMode);
                    else loadProfile(p); 
                    setLocalDropdownOpen(false); 
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
                  onClick={() => { loadProfile(p); setLocalDropdownOpen(false); }}
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
                        setLocalDropdownOpen(false);
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button 
                      className="action-btn delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteProfile(p.id);
                      }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="quick-eq-graph">
        <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="mini-eq-svg">
          <defs>
            <linearGradient id="mini-eq-glow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.35"/>
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.0"/>
            </linearGradient>
          </defs>

          {/* Reference Gridlines & Labels */}
          {[30, 15, 0, -15, -30].map(gain => {
            const y = gainToY(gain);
            return (
              <g key={`hy-${gain}`}>
                <line x1={plotX} y1={y} x2={svgWidth} y2={y} stroke="rgba(255, 255, 255, 0.04)" strokeDasharray="2 2" strokeWidth="1" />
                <text x={0} y={y + 4} className="y-axis-label">{gain}</text>
              </g>
            );
          })}

          {[20, 60, 250, 500, 2000, 4000, 20000].map(freq => {
            const x = freqToX(freq);
            const label = freq >= 1000 ? `${freq/1000}k` : `${freq}`;
            return (
              <g key={`vx-${freq}`}>
                {freq > 20 && freq < 20000 && <line x1={x} y1={plotYTop} x2={x} y2={plotYBottom} stroke="rgba(255, 255, 255, 0.07)" strokeDasharray="2 2" strokeWidth="1" />}
                <text x={x} y={svgHeight - 4} className="x-axis-label" textAnchor={freq === 20 ? 'start' : freq === 20000 ? 'end' : 'middle'}>{label}</text>
              </g>
            );
          })}

          {MACRO_ZONES.map(zone => {
            const cx = freqToX(Math.sqrt(zone.minF * zone.maxF));
            return <text key={`zt-${zone.id}`} x={cx} y={plotYTop + 12} className="zone-title" textAnchor="middle">{zone.label}</text>;
          })}

          <path d={areaPath} fill="url(#mini-eq-glow)" />
          <path d={linePath} className="mini-eq-path-stroke" fill="none" />
        </svg>
      </div>

      <div className="quick-eq-sliders">
        {MACRO_ZONES.map(zone => {
          const gain = getMacroGain(zone.minF, zone.maxF);
          const percent = ((gain - (-30)) / 60) * 100;

          return (
            <div key={zone.id} className="macro-row">
              <div className="macro-info">
                <span className="macro-label">{zone.label}</span>
                <span className="macro-range">{zone.range}</span>
                <div className="macro-value-badge">{gain > 0 ? '+' : ''}{gain.toFixed(1)}dB</div>
              </div>
              <div className="macro-slider-container">
                <span className="limit-label">-30dB</span>
                <input 
                  type="range"
                  className="macro-slider"
                  min="-30" max="30" step="0.1"
                  value={gain}
                  onChange={(e) => handleMacroChange(zone.minF, zone.maxF, parseFloat(e.target.value))}
                  style={{
                    '--track-bg': `linear-gradient(to right, var(--color-primary) ${percent}%, #2b2b2b ${percent}%)`
                  } as React.CSSProperties}
                />
                <span className="limit-label">+30dB</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="quick-eq-actions">
        <button 
          className="btn-outline delete-btn"
          disabled={activePreset === "Flat" || activePreset === "Custom"}
          onClick={() => {
            const currentCustom = profiles.find(p => p.name === activePreset && p.id.startsWith('custom-'));
            if (currentCustom) deleteProfile(currentCustom.id);
          }}
        >
          Delete this Profile
        </button>
        <button 
          className="btn-primary save-btn"
          onClick={() => {
            const currentCustom = profiles.find(p => p.name === activePreset && p.id.startsWith('custom-'));
            setSaveTab(currentCustom ? 'update' : 'new');
            if (currentCustom) setSelectedUpdateProfileId(currentCustom.id);
            setIsSaveModalOpen(true);
          }}
        >
          Save new Profile
        </button>
      </div>
    </div>
  );
}
