'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import OrbitalLogo from '@/components/OrbitalLogo';

type AuthMode = 'login' | 'register';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const token = localStorage.getItem('oq_token');
    if (token) router.push('/');
  }, [router]);

  if (!mounted) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0c0e12' }}>
      <div className="text-sm" style={{ color: '#9f8c8a' }}>Loading...</div>
    </div>
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body: any = { email, password };
      if (mode === 'register' && name) body.name = name;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Authentication failed');
        setLoading(false);
        return;
      }

      localStorage.setItem('oq_token', data.token);
      localStorage.setItem('oq_user', JSON.stringify(data.user));
      router.push('/');
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{
        background: 'radial-gradient(circle at 50% 50%, rgba(17, 19, 24, 0.8) 0%, rgba(12, 14, 18, 1) 100%)',
      }}
    >
      {/* Decorative orbital rings */}
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 800, height: 800,
          border: '1px solid #33353a',
          opacity: 0.2,
          top: -200, right: -200,
        }}
      />
      <div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: 1200, height: 1200,
          border: '1px solid #33353a',
          opacity: 0.1,
          bottom: -400, left: -400,
        }}
      />

      {/* Main content */}
      <div className="w-full max-w-md relative z-10 flex flex-col items-center mt-16">
        {/* Logo */}
        <div className="mb-10 text-center">
          <OrbitalLogo size="lg" showText={true} />
        </div>

        {/* Login Card */}
        <div
          className="w-full p-8 shadow-2xl flex flex-col gap-6 rounded-lg"
          style={{
            background: '#111318',
            border: '1px solid #33353a',
          }}
        >
          {/* Title */}
          <div className="text-center">
            <h1 className="text-2xl font-semibold mb-1" style={{ color: '#e2e2e9' }}>
              Authentication
            </h1>
            <p className="text-xs" style={{ color: '#d7c2bf' }}>
              Access Research-Grade Earth Observation Platform
            </p>
          </div>

          {/* Error */}
          {error && (
            <div
              className="p-3 rounded-lg text-xs text-center"
              style={{ background: 'rgba(255, 84, 78, 0.1)', border: '1px solid rgba(255, 84, 78, 0.2)', color: '#ffb4ab' }}
            >
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {/* Name (register only) */}
            {mode === 'register' && (
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium" style={{ color: '#e2e2e9' }}>Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Researcher Name"
                  className="w-full px-4 py-3 text-sm outline-none rounded-lg transition-all"
                  style={{
                    background: '#0c0e13',
                    border: '1px solid #33353a',
                    color: '#e2e2e9',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#571bc1'; e.target.style.boxShadow = '0 0 0 1px #571bc1'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#33353a'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            )}

            {/* Email */}
            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium" style={{ color: '#e2e2e9' }}>Gmail ID</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="researcher@institute.edu"
                required
                className="w-full px-4 py-3 text-sm outline-none rounded-lg transition-all"
                style={{
                  background: '#0c0e13',
                  border: '1px solid #33353a',
                  color: '#e2e2e9',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#571bc1'; e.target.style.boxShadow = '0 0 0 1px #571bc1'; }}
                onBlur={(e) => { e.target.style.borderColor = '#33353a'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-baseline">
                <label className="text-xs font-medium" style={{ color: '#e2e2e9' }}>Password</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    className="text-[11px] hover:underline transition-colors"
                    style={{ color: '#ffb3ac' }}
                    onClick={() => setError('Password reset coming soon')}
                  >
                    Reset Key
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  minLength={6}
                  className="w-full px-4 py-3 pr-10 text-sm outline-none rounded-lg transition-all"
                  style={{
                    background: '#0c0e13',
                    border: '1px solid #33353a',
                    color: '#e2e2e9',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = '#571bc1'; e.target.style.boxShadow = '0 0 0 1px #571bc1'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#33353a'; e.target.style.boxShadow = 'none'; }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 hover:opacity-80 transition-opacity"
                  style={{ color: '#d7c2bf' }}
                >
                  {showPassword ? (
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg text-xs font-medium uppercase tracking-wider transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              style={{
                background: '#ff544e',
                color: 'white',
              }}
              onMouseEnter={(e) => { if (!loading) (e.target as HTMLElement).style.opacity = '0.9'; }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.opacity = '1'; }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Authenticating...
                </span>
              ) : (
                'Initialize Session'
              )}
            </button>
          </form>

          {/* Toggle mode */}
          <p className="text-center text-xs" style={{ color: '#d7c2bf' }}>
            {mode === 'login' ? (
              <>
                No active clearance?{' '}
                <button
                  onClick={() => { setMode('register'); setError(''); }}
                  className="hover:underline transition-colors"
                  style={{ color: '#e2e2e9' }}
                >
                  Request Access
                </button>
              </>
            ) : (
              <>
                Already have clearance?{' '}
                <button
                  onClick={() => { setMode('login'); setError(''); }}
                  className="hover:underline transition-colors"
                  style={{ color: '#e2e2e9' }}
                >
                  Sign In
                </button>
              </>
            )}
          </p>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center">
          <p className="text-xs" style={{ color: '#9f8c8a', opacity: 0.6 }}>
            OrbitalQuery — Powered by Bhoonidhi (ISRO), Copernicus & Sentinel data. Built for researchers and decision-makers.
          </p>
        </footer>
      </div>
    </div>
  );
}
