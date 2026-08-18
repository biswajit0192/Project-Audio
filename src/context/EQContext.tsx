import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { EQProfile } from '../types';
import { interpolateGainAtFrequency } from '../utils/eqUtils';

export const ISO_15 = [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000];
export const ISO_31 = [20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000];

export interface EqBandPayload {
    index: number;
    freq: number;
    gain: number;
    bandwidth?: number;
}

interface EQContextType {
  bands: EqBandPayload[];
  activePreset: string;
  baselineProfileRef: EQProfile | null;
  hasUnsavedChanges: boolean;
  bandMode: '15-band' | '31-band';
  isFreqLocked: boolean;
  setIsFreqLocked: (locked: boolean) => void;
  profiles: EQProfile[];
  
  updateBandsAndPreset: (newBands: EqBandPayload[]) => void;
  resetToFlat: (mode: '15-band' | '31-band') => void;
  handleReset: () => void;
  loadProfile: (profile: EQProfile) => void;
  handleBandModeSwitch: (mode: '15-band' | '31-band') => void;
  deleteProfile: (id: string) => Promise<void>;
  
  // Modals state
  isSaveModalOpen: boolean;
  setIsSaveModalOpen: (open: boolean) => void;
  saveTab: 'update' | 'new';
  setSaveTab: (tab: 'update' | 'new') => void;
  selectedUpdateProfileId: string | null;
  setSelectedUpdateProfileId: (id: string | null) => void;
  
  isEditModalOpen: boolean;
  setIsEditModalOpen: (open: boolean) => void;
  editingProfileId: string | null;
  setEditingProfileId: (id: string | null) => void;

  newProfileName: string;
  setNewProfileName: (name: string) => void;
  linkCurrentDevice: boolean;
  setLinkCurrentDevice: (link: boolean) => void;
  autoSwitch: boolean;
  setAutoSwitch: (auto: boolean) => void;
  currentDeviceName: string;

  saveProfile: () => Promise<void>;
  saveEditProfile: () => Promise<void>;
}

const EQContext = createContext<EQContextType | undefined>(undefined);

export const EQProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [activePreset, setActivePreset] = useState("Flat");
  const [baselineProfileRef, setBaselineProfileRef] = useState<EQProfile | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [bandMode, setBandMode] = useState<'15-band' | '31-band'>('15-band');
  const [isFreqLocked, setIsFreqLocked] = useState(true);
  const [bands, setBands] = useState<EqBandPayload[]>([]);
  const [profiles, setProfiles] = useState<EQProfile[]>([]);
  
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [saveTab, setSaveTab] = useState<'update' | 'new'>('new');
  const [selectedUpdateProfileId, setSelectedUpdateProfileId] = useState<string | null>(null);
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  
  const [newProfileName, setNewProfileName] = useState("");
  const [linkCurrentDevice, setLinkCurrentDevice] = useState(false);
  const [autoSwitch, setAutoSwitch] = useState(false);
  const [currentDeviceName, setCurrentDeviceName] = useState("Unknown Device");

  useEffect(() => {
    invoke<EQProfile[]>('load_eq_profiles').then(setProfiles);

    invoke<EqBandPayload[]>('get_eq_state').then((state) => {
      if (state && state.length > 0) {
        setBands(state);
        setBandMode(state.length === 15 ? '15-band' : '31-band');
        const isFlat = state.every(b => b.gain === 0);
        if(!isFlat) setActivePreset("Custom");
      } else {
        resetToFlat('15-band');
      }
    });

    const unlistenDevice = listen<{ device_name: string, device_id: string }>('audio-device-changed', (event) => {
      setCurrentDeviceName(event.payload.device_name);
      
      invoke<EQProfile[]>('load_eq_profiles').then(profs => {
        setProfiles(profs);
        const match = profs.find(p => p.linkedDeviceName === event.payload.device_name && p.autoSwitchOnConnect);
        if (match) {
          console.log("[EQ] Auto-switching to profile:", match.name);
          loadProfile(match);
        }
      });
    });

    return () => {
      unlistenDevice.then(f => f());
    }
  }, []);

  const applyBands = (newBands: EqBandPayload[]) => {
    const payload = newBands.map(b => ({ ...b, bandwidth: 1.0 }));
    console.log("[UI EQ] Dispatching apply_eq_bands:", payload);
    invoke('apply_eq_bands', { bands: payload });
  };

  const updateBandsAndPreset = (newBands: EqBandPayload[]) => {
    setBands(newBands);
    setHasUnsavedChanges(true);
    if (!baselineProfileRef) {
      const freqs = bandMode === '15-band' ? ISO_15 : ISO_31;
      const isFlat = newBands.every((b, i) => b.gain === 0 && b.freq === freqs[i]);
      setActivePreset(isFlat ? "Flat" : "Custom");
    }
    applyBands(newBands);
  };

  const resetToFlat = (mode: '15-band' | '31-band') => {
    const freqs = mode === '15-band' ? ISO_15 : ISO_31;
    const newBands = freqs.map((f, i) => ({ index: i, freq: f, gain: 0 }));
    setBands(newBands);
    setActivePreset("Flat");
    setHasUnsavedChanges(false);
    setBaselineProfileRef(null);
    applyBands(newBands);
  };

  const handleReset = () => {
    if (baselineProfileRef) {
      loadProfile(baselineProfileRef);
    } else {
      resetToFlat(bandMode);
    }
  };

  const handleBandModeSwitch = (mode: '15-band' | '31-band') => {
    if (bandMode === mode) return;
    setBandMode(mode);
    
    const targetFreqs = mode === '15-band' ? ISO_15 : ISO_31;
    const newBands = targetFreqs.map((f, i) => ({
      index: i,
      freq: f,
      gain: interpolateGainAtFrequency(f, bands)
    }));
    
    updateBandsAndPreset(newBands);
  };

  const loadProfile = (profile: EQProfile) => {
    setBandMode(profile.bandMode as '15-band' | '31-band');
    try {
        const bandsData = JSON.parse(profile.bandsJson);
        let targetBands: EqBandPayload[] = [];
        if (profile.bandMode === '15-band') {
            targetBands = bandsData.bands15;
        } else {
            targetBands = bandsData.bands31;
        }
        
        if (!targetBands || targetBands.length === 0) {
            const freqs = profile.bandMode === '15-band' ? ISO_15 : ISO_31;
            targetBands = freqs.map((f, i) => ({ index: i, freq: f, gain: 0 }));
            if (profile.name === 'Bass Boost') {
                targetBands.forEach(b => { if(b.freq <= 100) b.gain = 6.0; else if(b.freq <= 250) b.gain = 3.0; });
            } else if (profile.name === 'Vocal Clarity') {
                targetBands.forEach(b => { if(b.freq >= 1000 && b.freq <= 4000) b.gain = 4.0; else if (b.freq < 250) b.gain = -2.0; });
            } else if (profile.name === 'Treble Boost') {
                targetBands.forEach(b => { if(b.freq >= 4000) b.gain = 5.0; });
            }
        }
        
        setBands(targetBands);
        setActivePreset(profile.name);
        setIsFreqLocked(profile.isFreqLocked);
        setBaselineProfileRef(profile);
        setHasUnsavedChanges(false);
        
        applyBands(targetBands);
    } catch (e) {
        console.error("Failed to parse profile JSON", e);
    }
  };

  const saveEditProfile = async () => {
    if (!editingProfileId) return;
    const existing = profiles.find(p => p.id === editingProfileId);
    if (!existing) return;
    const updated: EQProfile = {
      ...existing,
      name: newProfileName,
      linkedDeviceName: linkCurrentDevice ? currentDeviceName : null,
      autoSwitchOnConnect: autoSwitch
    };
    await invoke('save_eq_profile', { profile: updated });
    const profs = await invoke<EQProfile[]>('load_eq_profiles');
    setProfiles(profs);
    if (activePreset === existing.name) setActivePreset(updated.name);
    setIsEditModalOpen(false);
  };

  const saveProfile = async () => {
    let bands15 = [];
    let bands31 = [];
    
    if (bandMode === '15-band') {
        bands15 = bands;
        bands31 = ISO_31.map((f, i) => ({ index: i, freq: f, gain: interpolateGainAtFrequency(f, bands) }));
    } else {
        bands31 = bands;
        bands15 = ISO_15.map((f, i) => ({ index: i, freq: f, gain: interpolateGainAtFrequency(f, bands) }));
    }
    
    let profileToSave: EQProfile;

    if (saveTab === 'update' && selectedUpdateProfileId) {
      const existing = profiles.find(p => p.id === selectedUpdateProfileId);
      if (!existing) return;
      profileToSave = {
        ...existing,
        bandMode,
        bandsJson: JSON.stringify({ bands15, bands31 }),
        isFreqLocked
      };
    } else {
      if (!newProfileName) return;
      profileToSave = {
        id: "custom-" + Date.now(),
        name: newProfileName,
        bandMode,
        bandsJson: JSON.stringify({ bands15, bands31 }),
        isFreqLocked,
        linkedDeviceName: linkCurrentDevice ? currentDeviceName : null,
        autoSwitchOnConnect: autoSwitch,
        createdAt: Date.now()
      };
    }
    
    await invoke('save_eq_profile', { profile: profileToSave });
    const profs = await invoke<EQProfile[]>('load_eq_profiles');
    setProfiles(profs);
    setActivePreset(profileToSave.name);
    setBaselineProfileRef(profileToSave);
    setHasUnsavedChanges(false);
    setIsSaveModalOpen(false);
  };

  const deleteProfile = async (id: string) => {
    await invoke('delete_eq_profile', { id });
    const profs = await invoke<EQProfile[]>('load_eq_profiles');
    setProfiles(profs);
    if (activePreset === profiles.find(p => p.id === id)?.name) {
      setActivePreset("Custom");
    }
  };

  return (
    <EQContext.Provider
      value={{
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
        editingProfileId, setEditingProfileId,
        newProfileName, setNewProfileName,
        linkCurrentDevice, setLinkCurrentDevice,
        autoSwitch, setAutoSwitch,
        currentDeviceName,
        
        saveProfile,
        saveEditProfile
      }}
    >
      {children}
    </EQContext.Provider>
  );
};

export const useEQ = () => {
  const context = useContext(EQContext);
  if (context === undefined) {
    throw new Error('useEQ must be used within an EQProvider');
  }
  return context;
};
