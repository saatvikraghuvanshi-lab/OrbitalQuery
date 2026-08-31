'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';

interface HeaderProps {
  activeTab?: 'ask' | 'showcase' | 'discover';
  onNavigate?: (tab: 'ask' | 'showcase' | 'discover') => void;
  onHome?: () => void;
  onSettingsChange?: (settings: AppSettings) => void;
}

export interface AppSettings {
  defaultMapStyle: string;
  defaultProvider: string;
  maxCloudCover: number;
  autoZoom: boolean;
  showFootprints: boolean;
  animationSpeed: 'slow' | 'normal' | 'fast';
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultMapStyle: 'dark',
  defaultProvider: 'all',
  maxCloudCover: 20,
  autoZoom: true,
  showFootprints: true,
  animationSpeed: 'normal',
};

export function loadSettings(): AppSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const saved = localStorage.getItem('oq_settings');
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(s: AppSettings) { localStorage.setItem('oq_settings', JSON.stringify(s)); }

export default function Header({ activeTab = 'ask', onNavigate, onHome, onSettingsChange }: HeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  useEffect(() => { setSettings(loadSettings()); }, []);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next); saveSettings(next); onSettingsChange?.(next);
  };

  const navItems: { tab: 'ask' | 'showcase' | 'discover'; label: string }[] = [
    { tab: 'ask', label: 'Ask' },
    { tab: 'showcase', label: 'Explore' },
    { tab: 'discover', label: 'Datasets' },
  ];

  return (
    <>
      <header className="border-b border-oq-700 sticky top-0 z-50" style={{ background: '#050806' }}>
        <div className="relative max-w-[1600px] mx-auto px-5 h-nav-height flex items-center justify-between">
          {/* Logo — left aligned */}
          <div className="flex items-center gap-2 relative z-10">
            {onHome && (
              <button onClick={onHome} className="p-1 rounded hover:bg-oq-800 transition-colors text-oq-300 hover:text-oq-100" title="Home">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125a1.125 1.125 0 001.125 1.125H9.75v-4.875a1.125 1.125 0 011.125-1.125h2.25a1.125 1.125 0 011.125 1.125v4.875h4.125a1.125 1.125 0 001.125-1.125V9.75M8.25 21h8.25" />
                </svg>
              </button>
            )}
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" stroke="rgba(163,230,53,0.2)" strokeWidth="1.5" fill="none" />
              <circle cx="16" cy="16" r="5" fill="rgba(163,230,53,0.1)" stroke="#A3E635" strokeWidth="1.5" />
              <circle cx="16" cy="16" r="1.5" fill="#A3E635" />
            </svg>
            <span className="text-[14px] font-semibold text-oq-50 tracking-tight">
              Orbital<span className="text-lime">Query</span>
            </span>
          </div>

          {/* Nav — centered on viewport */}
          <nav className="flex items-center gap-0.5 absolute left-1/2 -translate-x-1/2">
            {navItems.map(({ tab, label }) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => onNavigate?.(tab)}
                  className={`px-3 py-1.5 rounded text-[11px] font-medium transition-all ${
                    active
                      ? 'bg-lime-dim text-lime'
                      : 'text-oq-300 hover:text-oq-100 hover:bg-oq-800'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>

          {/* Settings */}
          <button onClick={() => setSettingsOpen(true)} className="p-1.5 rounded hover:bg-oq-800 transition-colors text-oq-300 hover:text-oq-100 relative z-10" title="Settings">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md bg-oq-900 border-oq-700">
          <DialogHeader>
            <DialogTitle className="text-oq-50 text-base font-semibold">Settings</DialogTitle>
            <DialogDescription className="text-oq-200 text-sm">Configure your preferences</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-0">
            <div className="py-3">
              <p className="text-[9px] uppercase tracking-widest text-oq-300 font-semibold mb-2.5">Map</p>
              <div className="flex items-center justify-between mb-2.5">
                <Label className="text-sm text-oq-200">Map Style</Label>
                <Select value={settings.defaultMapStyle} onValueChange={(v) => { if (v) update('defaultMapStyle', v); }}>
                  <SelectTrigger className="w-[140px] bg-oq-800 border-oq-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-oq-800 border-oq-700">
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="satellite">Satellite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="h-px bg-oq-700/40" />
            <div className="py-3">
              <p className="text-[9px] uppercase tracking-widest text-oq-300 font-semibold mb-2.5">Data</p>
              <div className="flex items-center justify-between mb-2.5">
                <Label className="text-sm text-oq-200">Provider</Label>
                <Select value={settings.defaultProvider} onValueChange={(v) => { if (v) update('defaultProvider', v); }}>
                  <SelectTrigger className="w-[140px] bg-oq-800 border-oq-700"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-oq-800 border-oq-700">
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="copernicus">Copernicus</SelectItem>
                    <SelectItem value="nasa">NASA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="mb-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-sm text-oq-200">Max Cloud Cover</Label>
                  <span className="text-xs text-lime font-mono">{settings.maxCloudCover}%</span>
                </div>
                <Slider value={[settings.maxCloudCover]} onValueChange={(val) => { const v = Array.isArray(val) ? val[0] : val; update('maxCloudCover', v as number); }} min={0} max={100} step={5} />
              </div>
            </div>
            <div className="h-px bg-oq-700/40" />
            <div className="flex items-center justify-between pt-3">
              <button onClick={() => { setSettings(DEFAULT_SETTINGS); saveSettings(DEFAULT_SETTINGS); onSettingsChange?.(DEFAULT_SETTINGS); }} className="text-xs text-oq-300 hover:text-oq-100">Reset</button>
              <button onClick={() => setSettingsOpen(false)} className="px-4 py-1.5 rounded text-sm font-medium bg-lime text-oq-950 hover:bg-lime-hover">Done</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
