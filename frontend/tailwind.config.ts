import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        oq: {
          50: '#F1F5F2',
          100: '#D8E2DB',
          200: '#A7B3AA',
          300: '#68766D',
          400: '#465249',
          500: '#29402F',
          600: '#1B3022',
          700: '#17251C',
          800: '#111E15',
          900: '#0D1711',
          925: '#08100B',
          950: '#050806',
        },
        lime: {
          DEFAULT: '#A3E635',
          hover: '#B4F45A',
          muted: '#3F6212',
          dim: 'rgba(163,230,53,0.06)',
          border: 'rgba(163,230,53,0.12)',
        },
        purple: { DEFAULT: '#A78BFA', muted: '#7C5CBF', dim: 'rgba(167,139,250,0.08)' },
        cyan: { DEFAULT: '#22D3EE', dim: 'rgba(34,211,238,0.08)' },
        semantic: {
          before: '#60A5FA',
          after: '#FB923C',
          change: '#A78BFA',
          success: '#4ADE80',
          warning: '#FBBF24',
          error: '#F87171',
          info: '#60A5FA',
        },
        cat: {
          urban: '#A78BFA',
          water: '#22D3EE',
          vegetation: '#4ADE80',
          fire: '#FB923C',
          snow: '#BAE6FD',
          soil: '#FBBF24',
          coastal: '#2DD4BF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.375rem',
        lg: '0.5rem',
        xl: '0.625rem',
        '2xl': '0.75rem',
        full: '9999px',
      },
      fontSize: {
        'display': ['20px', { lineHeight: '28px', fontWeight: '600', letterSpacing: '-0.01em' }],
        'headline': ['28px', { lineHeight: '36px', fontWeight: '700', letterSpacing: '-0.02em' }],
        'headline-xl': ['42px', { lineHeight: '52px', letterSpacing: '-0.025em', fontWeight: '700' }],
        'body': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '18px', fontWeight: '400' }],
        'label': ['11px', { lineHeight: '16px', fontWeight: '500', letterSpacing: '0.04em' }],
        'mono': ['12px', { lineHeight: '16px', fontWeight: '500' }],
        'data': ['18px', { lineHeight: '24px', fontWeight: '600' }],
        'data-sm': ['14px', { lineHeight: '20px', fontWeight: '600' }],
      },
      spacing: {
        'gutter': '24px',
        'gutter-sm': '12px',
        'gutter-lg': '32px',
        'nav-height': '48px',
        'sidebar': '340px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
      },
    },
  },
  plugins: [],
};

export default config;
