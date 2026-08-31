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

function saveSettings(settings: AppSettings) {
  localStorage.setItem('oq_settings', JSON.stringify(settings));
}

export default function Header({ activeTab = 'ask', onNavigate, onHome, onSettingsChange }: HeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => { setSettings(loadSettings()); }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
    onSettingsChange?.(next);
  };

  const navItems: { tab: 'ask' | 'showcase' | 'discover'; label: string; icon: React.ReactNode }[] = [
    {
      tab: 'ask', label: 'Ask',
      icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>,
    },
    {
      tab: 'showcase', label: 'Explore',
      icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    },
    {
      tab: 'discover', label: 'Datasets',
      icon: <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>,
    },
  ];

  return (
    <>
      <header className="border-b border-oq-700/40 sticky top-0 z-50" style={{ background: 'rgba(4,8,6,0.92)', backdropFilter: 'blur(16px)' }}>
        <div className="max-w-[1600px] mx-auto px-6 h-nav-height flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            {onHome && (
              <button onClick={onHome} className="p-1.5 rounded-md hover:bg-oq-700/40 transition-colors text-oq-300 hover:text-lime" title="Home">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125a1.125 1.125 0 001.125 1.125H9.75v-4.875a1.125 1.125 0 011.125-1.125h2.25a1.125 1.125 0 011.125 1.125v4.875h4.125a1.125 1.125 0 001.125-1.125V9.75M8.25 21h8.25" />
                </svg>
              </button>
            )}
            {/* Logo mark */}
            <div className="relative w-7 h-7 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="14" stroke="rgba(163,246,63,0.3)" strokeWidth="1.5" fill="none" />
                <circle cx="16" cy="16" r="6" fill="rgba(163,246,63,0.15)" stroke="#A3F63F" strokeWidth="1.5" />
                <circle cx="16" cy="16" r="1.5" fill="#A3F63F" />
                <line x1="16" y1="2" x2="16" y2="8" stroke="rgba(163,246,63,0.4)" strokeWidth="1" />
                <line x1="16" y1="24" x2="16" y2="30" stroke="rgba(163,246,63,0.4)" strokeWidth="1" />
                <line x1="2" y1="16" x2="8" y2="16" stroke="rgba(163,246,63,0.4)" strokeWidth="1" />
                <line x1="24" y1="16" x2="30" y2="16" stroke="rgba(163,246,63,0.4)" strokeWidth="1" />
              </svg>
            </div>
            <span className="text-[15px] font-semibold text-oq-50 tracking-tight">
              Orbital<span className="text-lime">Query</span>
            </span>
          </div>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            {navItems.map(({ tab, label, icon }) => {
              const active = activeTab === tab;
              return (
                <button
                  key={tab}
                  onClick={() => onNavigate?.(tab)}
                  className={[
                    'flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-all',
                    active
                      ? 'bg-lime/10 text-lime border border-lime/20'
                      : 'text-oq-300 hover:text-oq-100 hover:bg-oq-700/30 border border-transparent',
                  ].join(' ')}
                >
                  {icon}
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right: Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-1.5 rounded-md hover:bg-oq-700/40 transition-colors text-oq-300 hover:text-lime"
            title="Settings"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </header>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md oq-card">
          <DialogHeader>
            <DialogTitle className="text-oq-50 text-base font-semibold">Settings</DialogTitle>
            <DialogDescription className="text-oq-300 text-sm">
              Configure your OrbitalQuery preferences
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-0">
            <div className="py-3">
              <p className="text-[10px] uppercase tracking-widest text-oq-300 font-semibold mb-2.5">Map &amp; Display</p>
              <div className="flex items-center justify-between mb-2.5">
                <Label className="text-sm text-oq-200">Default Map Style</Label>
                <Select value={settings.defaultMapStyle} onValueChange={(v) => { if (v) updateSetting('defaultMapStyle', v); }}>
                  <SelectTrigger className="w-[150px] oq-card"><SelectValue /></SelectTrigger>
                  <SelectContent className="oq-card">
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="light">Voyager</SelectItem>
                    <SelectItem value="satellite">Satellite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-sm text-oq-200">Animation Speed</Label>
                <Select value={settings.animationSpeed} onValueChange={(v) => { if (v) updateSetting('animationSpeed', v as 'slow' | 'normal' | 'fast'); }}>
                  <SelectTrigger className="w-[150px] oq-card"><SelectValue /></SelectTrigger>
                  <SelectContent className="oq-card">
                    <SelectItem value="slow">Slow</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="fast">Fast</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="h-px bg-oq-700/30" />
            <div className="py-3">
              <p className="text-[10px] uppercase tracking-widest text-oq-300 font-semibold mb-2.5">Data &amp; Filtering</p>
              <div className="flex items-center justify-between mb-2.5">
                <Label className="text-sm text-oq-200">Default Provider</Label>
                <Select value={settings.defaultProvider} onValueChange={(v) => { if (v) updateSetting('defaultProvider', v); }}>
                  <SelectTrigger className="w-[150px] oq-card"><SelectValue /></SelectTrigger>
                  <SelectContent className="oq-card">
                    <SelectItem value="all">All Providers</SelectItem>
                    <SelectItem value="copernicus">Copernicus</SelectItem>
                    <SelectItem value="isro">ISRO / Bhoonidhi</SelectItem>
                    <SelectItem value="nasa">NASA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="mb-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-sm text-oq-200">Max Cloud Cover</Label>
                  <span className="text-xs text-lime font-mono">{settings.maxCloudCover}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-oq-300 w-5 text-right">0</span>
                  <div className="flex-1"><Slider value={[settings.maxCloudCover]} onValueChange={(val) => { const v = Array.isArray(val) ? val[0] : val; updateSetting('maxCloudCover', v as number); }} min={0} max={100} step={5} /></div>
                  <span className="text-[10px] text-oq-300 w-7">100</span>
                </div>
              </div>
            </div>
            <div className="h-px bg-oq-700/30" />
            <div className="py-3">
              <p className="text-[10px] uppercase tracking-widest text-oq-300 font-semibold mb-2.5">Behavior</p>
              <div className="flex items-center justify-between mb-2.5">
                <div>
                  <Label className="text-sm text-oq-200">Auto-zoom to results</Label>
                  <p className="text-[10px] text-oq-300">Map zooms to selected dataset area</p>
                </div>
                <Switch checked={settings.autoZoom} onCheckedChange={(v) => updateSetting('autoZoom', v)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm text-oq-200">Show dataset footprints</Label>
                  <p className="text-[10px] text-oq-300">Display geometry outlines on the map</p>
                </div>
                <Switch checked={settings.showFootprints} onCheckedChange={(v) => updateSetting('showFootprints', v)} />
              </div>
            </div>
            <div className="h-px bg-oq-700/30" />
            <div className="flex items-center justify-between pt-3">
              <button onClick={() => { setSettings(DEFAULT_SETTINGS); saveSettings(DEFAULT_SETTINGS); onSettingsChange?.(DEFAULT_SETTINGS); }} className="text-xs text-oq-300 hover:text-oq-100">
                Reset to defaults
              </button>
              <button onClick={() => setSettingsOpen(false)} className="px-4 py-1.5 rounded-md text-sm font-medium bg-lime text-oq-950 hover:bg-lime-hover">
                Done
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
