'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';

interface HeaderProps {
  activeTab?: 'ask' | 'discover';
  onNavigate?: (tab: 'ask' | 'discover') => void;
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

export default function Header({ activeTab = 'ask', onNavigate, onSettingsChange }: HeaderProps) {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(loadSettings());
    try {
      const user = JSON.parse(localStorage.getItem('oq_user') || '{}');
      setUserName(user.name || user.email || 'User');
    } catch {}
  }, []);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
    onSettingsChange?.(next);
  };

  const handleLogout = () => {
    localStorage.removeItem('oq_token');
    localStorage.removeItem('oq_user');
    router.push('/auth');
  };

  return (
    <>
      <header className="border-b border-white/5 sticky top-0 z-50" style={{ background: '#0a0e1a' }}>
        <div className="max-w-[1800px] mx-auto px-6 py-3 relative">
          {/* Main row: logo (left) | spacer (right) */}
          <div className="flex items-center justify-between">
            <div className="flex items-center w-[200px]">
              <Image
                src="/orbitalquery-logo.png"
                alt="ØrbitalQuery"
                width={120}
                height={36}
                className="object-contain"
                priority
              />
            </div>
            <div className="w-[200px]" />
          </div>

          {/* Nav pills — absolutely centered in header */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3">
            <button
              onClick={() => onNavigate?.('ask')}
              className={`flex items-center space-x-2 px-5 py-2 rounded-full text-sm font-medium transition-colors ${
                activeTab === 'ask'
                  ? 'bg-[#1e1c36] text-[#a4a0e8]'
                  : 'bg-[#14151a] text-gray-200 border border-white/5 hover:bg-[#1a1c23]'
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Ask OrbitalQuery</span>
            </button>
            <button
              onClick={() => onNavigate?.('discover')}
              className={`flex items-center space-x-2 px-5 py-2 rounded-full text-sm font-medium transition-colors ${
                activeTab === 'discover'
                  ? 'bg-[#1e1c36] text-[#a4a0e8]'
                  : 'bg-[#14151a] text-gray-200 border border-white/5 hover:bg-[#1a1c23]'
              }`}
            >
              <svg className="w-4 h-4" style={{ color: '#d48b59' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
              <span>Dataset Discovery</span>
            </button>
          </div>

          {/* Right side: Settings + Avatar — absolutely positioned */}
          <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-4">
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

            <Separator orientation="vertical" className="h-6 bg-white/10" />

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-full hover:bg-white/5 transition-colors px-2 py-1 outline-none">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#571bc1] to-[#dc2626] flex items-center justify-center text-white text-xs font-bold">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs text-gray-400 hidden sm:block">{userName}</span>
                <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48" style={{ background: '#1e2024', border: '1px solid #33353a' }}>
                <DropdownMenuItem className="text-xs text-gray-300 cursor-default">
                  <div className="flex flex-col">
                    <span className="font-medium text-white">{userName}</span>
                    <span className="text-gray-500">Researcher</span>
                  </div>
                </DropdownMenuItem>
                <Separator className="my-1 bg-white/10" />
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="text-xs text-red-400 cursor-pointer focus:text-red-300 focus:bg-red-500/10"
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Settings Dialog */}
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="sm:max-w-md" style={{ background: '#111318', border: '1px solid #33353a' }}>
          <DialogHeader>
            <DialogTitle className="text-white text-lg">Settings</DialogTitle>
            <DialogDescription className="text-gray-400 text-sm">
              Configure your OrbitalQuery preferences
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-6 py-4">
            {/* Default Map Style */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm text-gray-300">Default Map Style</Label>
              <Select
                value={settings.defaultMapStyle}
                onValueChange={(v) => { if (v) updateSetting('defaultMapStyle', v); }}
              >
                <SelectTrigger style={{ background: '#0c0e13', border: '1px solid #33353a', color: '#e2e2e9' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: '#1e2024', border: '1px solid #33353a' }}>
                  <SelectItem value="dark">🌑 Dark</SelectItem>
                  <SelectItem value="light">🗺️ Voyager</SelectItem>
                  <SelectItem value="streets">🌍 Streets</SelectItem>
                  <SelectItem value="satellite">🛰️ Satellite</SelectItem>
                  <SelectItem value="terrain">🌑 Dark Lite</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Default Provider */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm text-gray-300">Default Data Provider</Label>
              <Select
                value={settings.defaultProvider}
                onValueChange={(v) => { if (v) updateSetting('defaultProvider', v); }}
              >
                <SelectTrigger style={{ background: '#0c0e13', border: '1px solid #33353a', color: '#e2e2e9' }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent style={{ background: '#1e2024', border: '1px solid #33353a' }}>
                  <SelectItem value="all">All Providers</SelectItem>
                  <SelectItem value="copernicus">🇪🇺 Copernicus</SelectItem>
                  <SelectItem value="isro">🇮🇳 ISRO / Bhoonidhi</SelectItem>
                  <SelectItem value="nasa">🇺🇸 NASA</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Max Cloud Cover */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-gray-300">Max Cloud Cover</Label>
                <span className="text-xs text-gray-500">{settings.maxCloudCover}%</span>
              </div>
              <Slider
                value={[settings.maxCloudCover]}
                onValueChange={(val) => { const v = Array.isArray(val) ? val[0] : val; updateSetting('maxCloudCover', v as number); }}
                min={0}
                max={100}
                step={5}
              />
            </div>

            {/* Auto Zoom */}
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <Label className="text-sm text-gray-300">Auto-zoom to results</Label>
                <p className="text-[10px] text-gray-500">Map zooms to selected dataset area</p>
              </div>
              <Switch
                checked={settings.autoZoom}
                onCheckedChange={(v) => updateSetting('autoZoom', v)}
              />
            </div>

            {/* Show Footprints */}
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

            {/* Animation Speed */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm text-gray-300">Animation Speed</Label>
              <Select
                value={settings.animationSpeed}
                onValueChange={(v) => { if (v) updateSetting('animationSpeed', v as 'slow' | 'normal' | 'fast'); }}
              >
                <SelectTrigger style={{ background: '#0c0e13', border: '1px solid #33353a', color: '#e2e2e9' }}>
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
        </DialogContent>
      </Dialog>
    </>
  );
}
