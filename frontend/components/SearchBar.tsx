'use client';

import { useState, FormEvent, KeyboardEvent, useRef, useEffect, useCallback } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  loading: boolean;
  onToggleFilters: () => void;
  showFilters: boolean;
}

// ─── Suggestion Database ──────────────────────────────────────────────
// Organized by category for smart ranking
const SUGGESTION_DB = [
  // Deforestation & Forest
  { text: 'Deforestation near Assam 2015–2020', category: 'forest', keywords: ['deforestation', 'forest', 'assam', 'trees', 'logging', 'clearing'] },
  { text: 'Deforestation in Amazon basin', category: 'forest', keywords: ['deforestation', 'amazon', 'brazil', 'rainforest', 'forest'] },
  { text: 'Forest fire detection Western Ghats', category: 'forest', keywords: ['forest', 'fire', 'wildfire', 'burn', 'western ghats', 'smoke'] },
  { text: 'Forest cover change detection', category: 'forest', keywords: ['forest', 'cover', 'change', 'deforestation', 'vegetation'] },
  { text: 'Mangrove health Sundarbans', category: 'forest', keywords: ['mangrove', 'sundarbans', 'delta', 'coastal', 'wetland'] },
  { text: 'Tree canopy analysis urban areas', category: 'forest', keywords: ['tree', 'canopy', 'urban', 'green', 'vegetation'] },

  // Urban & Land Use
  { text: 'Urban expansion in Jaipur', category: 'urban', keywords: ['urban', 'expansion', 'jaipur', 'city', 'growth', 'built'] },
  { text: 'Urban heat island effect Mumbai', category: 'urban', keywords: ['urban', 'heat', 'island', 'mumbai', 'temperature', 'city'] },
  { text: 'Urban sprawl detection satellite', category: 'urban', keywords: ['urban', 'sprawl', 'expansion', 'city', 'growth'] },
  { text: 'Land use land cover classification', category: 'urban', keywords: ['land', 'use', 'cover', 'classification', 'lulc'] },
  { text: 'Building footprint extraction', category: 'urban', keywords: ['building', 'footprint', 'extraction', 'structure', 'urban'] },
  { text: 'Road network mapping', category: 'urban', keywords: ['road', 'network', 'mapping', 'infrastructure', 'transport'] },

  // Glacier & Snow
  { text: 'Glacier retreat in Himalayas', category: 'glacier', keywords: ['glacier', 'retreat', 'himalaya', 'ice', 'snow', 'mountain'] },
  { text: 'Snow cover monitoring Karakoram', category: 'glacier', keywords: ['snow', 'cover', 'karakoram', 'ice', 'frozen'] },
  { text: 'Glacial lake expansion Nepal', category: 'glacier', keywords: ['glacial', 'lake', 'nepal', 'expansion', 'flood'] },
  { text: 'Ice sheet mass loss Antarctica', category: 'glacier', keywords: ['ice', 'sheet', 'mass', 'loss', 'antarctica'] },
  { text: 'Permafrost degradation Arctic', category: 'glacier', keywords: ['permafrost', 'degradation', 'arctic', 'frozen', 'thaw'] },

  // Water & Ocean
  { text: 'Ocean temperature Indian Ocean', category: 'water', keywords: ['ocean', 'temperature', 'indian', 'sea', 'sst'] },
  { text: 'Flood monitoring river basin', category: 'water', keywords: ['flood', 'monitoring', 'river', 'basin', 'inundation'] },
  { text: 'Water body detection satellite', category: 'water', keywords: ['water', 'body', 'detection', 'lake', 'reservoir'] },
  { text: 'Coastal erosion assessment', category: 'water', keywords: ['coastal', 'erosion', 'shore', 'beach', 'sea level'] },
  { text: 'River discharge estimation', category: 'water', keywords: ['river', 'discharge', 'flow', 'stream', 'hydrology'] },
  { text: 'Drought assessment semi-arid', category: 'water', keywords: ['drought', 'assessment', 'dry', 'arid', 'moisture'] },
  { text: 'Wetland ecosystem monitoring', category: 'water', keywords: ['wetland', 'ecosystem', 'marsh', 'swamp', 'bog'] },
  { text: 'Marine pollution detection', category: 'water', keywords: ['marine', 'pollution', 'oil', 'spill', 'contamination'] },

  // Agriculture
  { text: 'Crop type classification India', category: 'agriculture', keywords: ['crop', 'type', 'classification', 'india', 'farming'] },
  { text: 'Agricultural drought monitoring', category: 'agriculture', keywords: ['agricultural', 'drought', 'crop', 'stress', 'irrigation'] },
  { text: 'Precision agriculture NDVI', category: 'agriculture', keywords: ['precision', 'agriculture', 'ndvi', 'vegetation', 'health'] },
  { text: 'Harvest prediction satellite', category: 'agriculture', keywords: ['harvest', 'prediction', 'yield', 'crop', 'farming'] },

  // Climate & Temperature
  { text: 'Land surface temperature global', category: 'climate', keywords: ['land', 'surface', 'temperature', 'lst', 'thermal'] },
  { text: 'Nighttime city lights India', category: 'climate', keywords: ['nighttime', 'city', 'lights', 'viirs', 'dnb'] },
  { text: 'Air quality haze detection', category: 'climate', keywords: ['air', 'quality', 'haze', 'smog', 'pollution', 'pm2.5'] },
  { text: 'Sea surface temperature anomaly', category: 'climate', keywords: ['sea', 'surface', 'temperature', 'anomaly', 'el nino'] },
  { text: 'Climate change impact assessment', category: 'climate', keywords: ['climate', 'change', 'impact', 'assessment', 'global'] },

  // Disaster
  { text: 'Earthquake damage assessment', category: 'disaster', keywords: ['earthquake', 'damage', 'assessment', 'seismic', 'destruction'] },
  { text: 'Landslide risk mapping', category: 'disaster', keywords: ['landslide', 'risk', 'mapping', 'slope', 'debris'] },
  { text: 'Cyclone impact assessment India', category: 'disaster', keywords: ['cyclone', 'impact', 'india', 'storm', 'hurricane'] },
  { text: 'Wildfire scar mapping', category: 'disaster', keywords: ['wildfire', 'scar', 'mapping', 'fire', 'burn'] },
  { text: 'Dam monitoring satellite', category: 'disaster', keywords: ['dam', 'monitoring', 'reservoir', 'water', 'level'] },

  // Vegetation & Ecology
  { text: 'NDVI vegetation health index', category: 'ecology', keywords: ['ndvi', 'vegetation', 'health', 'index', 'green'] },
  { text: 'Biodiversity hotspot monitoring', category: 'ecology', keywords: ['biodiversity', 'hotspot', 'monitoring', 'species', 'habitat'] },
  { text: 'Coral reef health Great Barrier Reef', category: 'ecology', keywords: ['coral', 'reef', 'health', 'great barrier', 'bleaching'] },
  { text: 'Desertification monitoring Thar', category: 'ecology', keywords: ['desertification', 'monitoring', 'thar', 'degradation', 'sand'] },
  { text: 'Soil moisture estimation', category: 'ecology', keywords: ['soil', 'moisture', 'estimation', 'ground', 'terrain'] },

  // Mining & Industry
  { text: 'Mining impact detection satellite', category: 'industry', keywords: ['mining', 'impact', 'detection', 'excavation', 'quarry'] },
  { text: 'Oil spill detection ocean', category: 'industry', keywords: ['oil', 'spill', 'detection', 'ocean', 'marine'] },
  { text: 'Industrial thermal pollution', category: 'industry', keywords: ['industrial', 'thermal', 'pollution', 'factory', 'heat'] },

  // India-specific
  { text: 'Ganges river water quality', category: 'india', keywords: ['ganges', 'ganga', 'river', 'water', 'quality', 'india'] },
  { text: 'Thar desert sand dune dynamics', category: 'india', keywords: ['thar', 'desert', 'sand', 'dune', 'rajasthan'] },
  { text: 'Western Ghats biodiversity', category: 'india', keywords: ['western', 'ghats', 'biodiversity', 'forest', 'ecology'] },
  { text: 'Brahmaputra flood mapping Assam', category: 'india', keywords: ['brahmaputra', 'flood', 'mapping', 'assam', 'river'] },
  { text: 'Kashmir snow cover monitoring', category: 'india', keywords: ['kashmir', 'snow', 'cover', 'monitoring', 'winter'] },
  { text: 'Chennai urban flooding', category: 'india', keywords: ['chennai', 'urban', 'flooding', 'rain', 'city'] },
  { text: 'ISRO Bhuvan satellite data', category: 'india', keywords: ['isro', 'bhuvan', 'satellite', 'india', 'data'] },
];

// ─── Scoring & Ranking ────────────────────────────────────────────────

function scoreSuggestion(query: string, suggestion: typeof SUGGESTION_DB[0]): number {
  const q = query.toLowerCase().trim();
  const text = suggestion.text.toLowerCase();

  // Exact match at start = highest
  if (text.startsWith(q)) return 100;

  // Contains full query
  if (text.includes(q)) return 80;

  // Word-level matching
  const queryWords = q.split(/\s+/).filter(w => w.length > 2);
  const textWords = text.split(/\s+/);

  let wordScore = 0;
  for (const qw of queryWords) {
    for (const tw of textWords) {
      if (tw === qw) wordScore += 10;
      else if (tw.startsWith(qw)) wordScore += 7;
      else if (tw.includes(qw)) wordScore += 3;
    }
  }

  // Keyword matching
  for (const kw of suggestion.keywords) {
    if (kw.includes(q) || q.includes(kw)) wordScore += 5;
  }

  return wordScore;
}

function getSuggestions(query: string, limit: number = 8): string[] {
  if (!query || query.trim().length < 2) return [];

  const scored = SUGGESTION_DB
    .map(s => ({ text: s.text, score: scoreSuggestion(query, s) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Deduplicate
  const seen = new Set<string>();
  return scored
    .filter(s => { if (seen.has(s.text)) return false; seen.add(s.text); return true; })
    .map(s => s.text);
}

// ─── Category Icons ───────────────────────────────────────────────────

const CATEGORY_ICONS: Record<string, string> = {
  forest: '🌲',
  urban: '🏙️',
  glacier: '🏔️',
  water: '🌊',
  agriculture: '🌾',
  climate: '🌡️',
  disaster: '⚠️',
  ecology: '🌿',
  industry: '🏭',
  india: '🇮🇳',
};

function getCategoryForQuery(text: string): string {
  const lower = text.toLowerCase();
  for (const s of SUGGESTION_DB) {
    if (s.text === text) return s.category;
  }
  if (lower.match(/forest|tree|deforest|mangrove/)) return 'forest';
  if (lower.match(/urban|city|building|road/)) return 'urban';
  if (lower.match(/glacier|snow|ice|frozen/)) return 'glacier';
  if (lower.match(/ocean|river|flood|water|coast|wetland/)) return 'water';
  if (lower.match(/crop|agri|harvest|ndvi/)) return 'agriculture';
  if (lower.match(/temperature|thermal|climate|light/)) return 'climate';
  if (lower.match(/earthquake|landslide|cyclone|disaster/)) return 'disaster';
  if (lower.match(/coral|biodiversity|desert|soil/)) return 'ecology';
  if (lower.match(/mining|oil|industrial/)) return 'industry';
  if (lower.match(/india|assam|jaipur|kashmir|ganges|thar|isro|bhuvan|chennai|brahmaputra/)) return 'india';
  return 'climate';
}

// ─── Component ────────────────────────────────────────────────────────

export default function SearchBar({ onSearch, loading, onToggleFilters, showFilters }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Update suggestions when query changes
  useEffect(() => {
    if (query.trim().length >= 2) {
      const results = getSuggestions(query);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
    setSelectedIdx(-1);
  }, [query]);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSubmit = useCallback((q?: string) => {
    const searchQuery = q || query.trim();
    if (searchQuery && !loading) {
      onSearch(searchQuery);
      setShowSuggestions(false);
      setQuery(searchQuery);
    }
  }, [query, loading, onSearch]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(prev => Math.max(prev - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIdx >= 0 && suggestions[selectedIdx]) {
        handleSubmit(suggestions[selectedIdx]);
      } else {
        handleSubmit();
      }
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIdx(-1);
    }
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="max-w-3xl mx-auto">
      <div ref={wrapperRef} className="relative group">
        {/* Glow ring */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-[var(--color-purple-dim)] via-[var(--color-accent-dim)] to-[var(--color-purple-dim)] rounded-2xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500 blur-sm z-0" />

        <div className="relative flex items-center bg-[var(--color-bg-elevated)] border border-[var(--color-accent-border)] rounded-2xl overflow-hidden z-10">
          {/* Search icon */}
          <div className="pl-5 pr-2 text-[var(--color-text-muted)]">
            {loading ? (
              <div className="w-5 h-5 border-2 border-[var(--color-accent)]/30 border-t-[var(--color-accent)] rounded-full animate-spin" />
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </div>

          {/* Input */}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            placeholder='Try "deforestation near Assam" or "glacier retreat Himalayas"...'
            className="flex-1 bg-transparent py-4 px-2 text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none text-sm sm:text-base"
            disabled={loading}
            autoComplete="off"
          />

          {/* Clear button */}
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setSuggestions([]); setShowSuggestions(false); inputRef.current?.focus(); }}
              className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Filter toggle */}
          <button
            type="button"
            onClick={onToggleFilters}
            className={`p-2.5 mr-1 rounded-xl transition-all duration-200 ${
              showFilters ? 'bg-[var(--color-accent-dim)] text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]'
            }`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>

          {/* Search button */}
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="mr-3 px-5 py-2 bg-[var(--color-accent)] text-[var(--color-bg-deep)] text-sm font-medium rounded-xl transition-all duration-200 hover:bg-[var(--color-accent-hover)] disabled:bg-[var(--color-bg-hover)] disabled:text-[var(--color-text-muted)]"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>

        {/* ─── Autocomplete Dropdown ─────────────────────────────── */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[var(--color-bg-card)] border border-[rgba(163,246,63,0.10)] rounded-2xl overflow-hidden z-50 shadow-2xl shadow-black/30">
            <div className="px-3 py-2 border-b border-[rgba(163,246,63,0.10)]">
              <span className="text-[10px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">
                Suggestions
              </span>
            </div>
            {suggestions.map((suggestion, idx) => {
              const category = getCategoryForQuery(suggestion);
              const icon = CATEGORY_ICONS[category] || '🔍';
              const isSelected = idx === selectedIdx;

              // Highlight matched text
              const q = query.toLowerCase();
              const matchStart = suggestion.toLowerCase().indexOf(q);
              let before = '', match = '', after = '';
              if (matchStart >= 0) {
                before = suggestion.slice(0, matchStart);
                match = suggestion.slice(matchStart, matchStart + q.length);
                after = suggestion.slice(matchStart + q.length);
              } else {
                after = suggestion;
              }

              return (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSubmit(suggestion)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  className={`w-full px-4 py-2.5 text-left flex items-center gap-3 transition-all duration-100 ${
                    isSelected
                      ? 'bg-[var(--color-accent-dim)] text-[var(--color-text-primary)]'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-accent-dim)]'
                  }`}
                >
                  <span className="text-sm flex-shrink-0">{icon}</span>
                  <span className="text-sm flex-1 truncate">
                    {before}<span className="text-[var(--color-accent)] font-medium">{match}</span>{after}
                  </span>
                  <svg className={`w-3.5 h-3.5 flex-shrink-0 text-[var(--color-text-muted)] transition-transform ${isSelected ? 'translate-x-0.5' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              );
            })}
            <div className="px-3 py-1.5 border-t border-[rgba(163,246,63,0.10)] flex items-center justify-between">
              <span className="text-[10px] text-[var(--color-text-muted)]">
                ↑↓ navigate • ↵ select • esc close
              </span>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {suggestions.length} suggestions
              </span>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
