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

// Standardized nav icon — used for all three tabs
function NavIcon({ type }: { type: 'ask' | 'showcase' | 'discover' }) {
  if (type === 'ask') {
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
      </svg>
    );
  }
  if (type === 'showcase') {
    return (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    );
  }
  // discover
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
    </svg>
  );
}

export default function Header({ activeTab = 'ask', onNavigate, onSettingsChange }: HeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
    onSettingsChange?.(next);
  };

  const navItems: { tab: 'ask' | 'showcase' | 'discover'; label: string }[] = [
    { tab: 'ask', label: 'Ask' },
    { tab: 'showcase', label: 'Showcase' },
    { tab: 'discover', label: 'Discover' },
  ];

  return (
    <>
      <header className="border-b border-white/5 sticky top-0 z-50" style={{ background: '#0a0e1a' }}>
        <div className="max-w-[1800px] mx-auto px-6 py-3 relative">
          {/* Main row: logo (left) | nav (center) | settings+avatar (right) */}
          <div className="flex items-center justify-between">
            {/* Logo — inline SVG mark + wordmark */}
            <div className="flex items-center gap-3 w-[240px]">
              <svg width="42" height="42" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Satellite body */}
                <rect x="12" y="10" width="8" height="12" rx="2" fill="#FF4D4D" />
                {/* Solar panel left */}
                <rect x="4" y="12" width="7" height="8" rx="1.5" stroke="#FF4D4D" strokeWidth="1.5" fill="none" />
                {/* Solar panel right */}
                <rect x="21" y="12" width="7" height="8" rx="1.5" stroke="#FF4D4D" strokeWidth="1.5" fill="none" />
                {/* Antenna dish */}
                <path d="M16 10 L16 6" stroke="#FF4D4D" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="16" cy="5" r="1.2" fill="#FF4D4D" />
                {/* Orbital ring — single bold path */}
                <ellipse cx="16" cy="16" rx="14.5" ry="5" stroke="rgba(255,77,77,0.35)" strokeWidth="1.2" fill="none" strokeDasharray="3 2" />
              </svg>
              <span className="text-[20px] font-semibold text-white tracking-[0.04em]">
                OrbitalQuery
              </span>
            </div>

            {/* Nav pills — centered */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2">
              {navItems.map(({ tab, label }) => (
                <button
                  key={tab}
                  onClick={() => onNavigate?.(tab)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-[#1e1c36] text-[#a4a0e8]'
                      : 'bg-[#14151a] text-gray-200 border border-white/5 hover:bg-[#1a1c23]'
                  }`}
                >
                  <NavIcon type={tab} />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Right side: Settings */}
            <div className="flex items-center gap-3 w-[240px] justify-end">
              <button
                onClick={() => setSettingsOpen(true)}
                className="p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white"
                title="Settings"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Settings Dialog — polished layout with sections, toggles, footer */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md" style={{ background: '#111318', border: '1px solid #33353a' }}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg">Settings</DialogTitle>
            <DialogDescription className="text-gray-400 text-sm">
              Configure your OrbitalQuery preferences
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-0">
            {/* ── Section: Map & Display ── */}
            <div className="py-4">
              <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold mb-3">Map &amp; Display</p>

              {/* Default Map Style */}
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm text-gray-300">Default Map Style</Label>
                <Select
                  value={settings.defaultMapStyle}
                  onValueChange={(v) => { if (v) updateSetting('defaultMapStyle', v); }}
                >
                  <SelectTrigger className="w-[160px]" style={{ background: '#0c0e13', border: '1px solid #33353a', color: '#e2e2e9' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: '#1e2024', border: '1px solid #33353a' }}>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="light">Voyager</SelectItem>
                    <SelectItem value="streets">Streets</SelectItem>
                    <SelectItem value="satellite">Satellite</SelectItem>
                    <SelectItem value="terrain">Dark Lite</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Animation Speed */}
              <div className="flex items-center justify-between">
                <Label className="text-sm text-gray-300">Animation Speed</Label>
                <Select
                  value={settings.animationSpeed}
                  onValueChange={(v) => { if (v) updateSetting('animationSpeed', v as 'slow' | 'normal' | 'fast'); }}
                >
                  <SelectTrigger className="w-[160px]" style={{ background: '#0c0e13', border: '1px solid #33353a', color: '#e2e2e9' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: '#1e2024', border: '1px solid #33353a' }}>
                    <SelectItem value="slow">Slow</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="fast">Fast</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="h-px bg-white/5" />

            {/* ── Section: Data ── */}
            <div className="py-4">
              <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold mb-3">Data &amp; Filtering</p>

              {/* Default Provider */}
              <div className="flex items-center justify-between mb-3">
                <Label className="text-sm text-gray-300">Default Data Provider</Label>
                <Select
                  value={settings.defaultProvider}
                  onValueChange={(v) => { if (v) updateSetting('defaultProvider', v); }}
                >
                  <SelectTrigger className="w-[160px]" style={{ background: '#0c0e13', border: '1px solid #33353a', color: '#e2e2e9' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent style={{ background: '#1e2024', border: '1px solid #33353a' }}>
                    <SelectItem value="all">All Providers</SelectItem>
                    <SelectItem value="copernicus">Copernicus</SelectItem>
                    <SelectItem value="isro">ISRO / Bhoonidhi</SelectItem>
                    <SelectItem value="nasa">NASA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Max Cloud Cover */}
              <div className="mb-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm text-gray-300">Max Cloud Cover</Label>
                  <span className="text-xs text-blue-400 font-mono">{settings.maxCloudCover}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-gray-600 w-6 text-right">0%</span>
                  <div className="flex-1">
                    <Slider
                      value={[settings.maxCloudCover]}
                      onValueChange={(val) => { const v = Array.isArray(val) ? val[0] : val; updateSetting('maxCloudCover', v as number); }}
                      min={0}
                      max={100}
                      step={5}
                    />
                  </div>
                  <span className="text-[10px] text-gray-600 w-8">100%</span>
                </div>
              </div>
            </div>

            <div className="h-px bg-white/5" />

            {/* ── Section: Behavior (toggles) ── */}
            <div className="py-4">
              <p className="text-[10px] uppercase tracking-widest text-gray-600 font-semibold mb-3">Behavior</p>

              <div className="flex items-center justify-between mb-3">
                <div className="flex flex-col gap-0.5">
                  <Label className="text-sm text-gray-300">Auto-zoom to results</Label>
                  <p className="text-[10px] text-gray-500">Map zooms to selected dataset area</p>
                </div>
                <Switch
                  checked={settings.autoZoom}
                  onCheckedChange={(v) => updateSetting('autoZoom', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <Label className="text-sm text-gray-300">Show dataset footprints</Label>
                  <p className="text-[10px] text-gray-500">Display geometry outlines on the map</p>
                </div>
                <Switch
                  checked={settings.showFootprints}
                  onCheckedChange={(v) => updateSetting('showFootprints', v)}
                />
              </div>
            </div>

            <div className="h-px bg-white/5" />

            {/* ── Footer actions ── */}
            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => {
                  setSettings(DEFAULT_SETTINGS);
                  saveSettings(DEFAULT_SETTINGS);
                  onSettingsChange?.(DEFAULT_SETTINGS);
                }}
                className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
              >
                Reset to defaults
              </button>
              <button
                onClick={() => setSettingsOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                style={{ background: 'rgba(79, 110, 245, 0.25)', border: '1px solid rgba(79, 110, 245, 0.3)' }}
              >
                Done
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
