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
          50: '#F0F4F1',
          100: '#D8E0DA',
          200: '#A0ADA4',
          300: '#5E6E63',
          400: '#3D4D41',
          500: '#2A382E',
          600: '#1E2D22',
          700: '#152719',
          800: '#101E15',
          900: '#0C1610',
          950: '#040806',
        },
        lime: {
          DEFAULT: '#A3F63F',
          hover: '#B8FF63',
          muted: '#7EBF32',
          dim: 'rgba(163,246,63,0.10)',
          border: 'rgba(163,246,63,0.14)',
        },
        purple: {
          DEFAULT: '#8B6CF6',
          muted: '#6F58C7',
          dim: 'rgba(139,108,246,0.10)',
          border: 'rgba(139,108,246,0.14)',
        },
        cyan: {
          DEFAULT: '#22D3EE',
          dim: 'rgba(34,211,238,0.10)',
          border: 'rgba(34,211,238,0.14)',
        },
        semantic: {
          before: '#60A5FA',
          after: '#FB923C',
          change: '#8B6CF6',
          success: '#A3F63F',
          warning: '#FBBF24',
          error: '#F87171',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
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
        'nav-height': '52px',
        'sidebar': '340px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
