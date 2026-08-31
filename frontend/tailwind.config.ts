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
          50: '#F2F5F0',
          100: '#E1E3E4',
          200: '#A7B2A8',
          300: '#68766C',
          400: '#4a5a4e',
          500: '#323a34',
          600: '#17291B',
          700: '#122117',
          800: '#0D1A11',
          900: '#08120B',
          950: '#050A07',
        },
        lime: {
          DEFAULT: '#A3F63F',
          hover: '#B8FF63',
          muted: '#7EBF32',
          dim: 'rgba(163,246,63,0.12)',
          border: 'rgba(163,246,63,0.16)',
        },
        purple: {
          DEFAULT: '#8B6CF6',
          muted: '#6F58C7',
          dim: 'rgba(139,108,246,0.12)',
          border: 'rgba(139,108,246,0.16)',
        },
        semantic: {
          before: '#60a5fa',
          after: '#fb923c',
          change: '#8B6CF6',
          success: '#A3F63F',
          warning: '#fbbf24',
          error: '#f87171',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
      spacing: {
        'gutter-md': '24px',
        'margin-safe': '32px',
        'control-bar-height': '48px',
        'sidebar-width': '320px',
        'unit': '4px',
        'gutter-sm': '12px',
      },
      fontSize: {
        'data-display': ['18px', { lineHeight: '24px', fontWeight: '600' }],
        'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'label-mono': ['12px', { lineHeight: '16px', letterSpacing: '0.08em', fontWeight: '500' }],
        'headline-lg-mobile': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'headline-xl': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.01em', fontWeight: '600' }],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'float': 'float 6s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
