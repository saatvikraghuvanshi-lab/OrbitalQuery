'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import OrbitalLogo from '@/components/OrbitalLogo';
import dynamic from 'next/dynamic';

const ShaderBackground = dynamic(() => import('@/components/ShaderBackground'), { ssr: false });

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
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#05060A' }}>
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
        background: 'radial-gradient(circle at 50% 50%, #090C19 0%, #05060A 100%)',
      }}
    >
      {/* Animated shader gradient background */}
      <ShaderBackground />

      {/* Main content */}
      <div className="w-full max-w-md relative z-10 flex flex-col items-center">
        {/* Auth Card */}
        <div
          className="w-full shadow-2xl flex flex-col rounded-2xl overflow-hidden"
          style={{
            background: '#16171D',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.03)',
          }}
        >
          {/* Card header */}
          <div className="px-8 pt-8 pb-5 text-center">
            <div className="flex justify-center mb-2">
              <OrbitalLogo size="lg" showText={true} />
            </div>
            <p className="text-[13px] mt-2" style={{ color: '#6B7280' }}>
              {mode === 'login'
                ? 'Sign in to access the EO exploration platform'
                : 'Join the Earth observation research community'}
            </p>
          </div>

          {/* Divider */}
          <div className="px-8">
            <div className="h-px" style={{ background: 'rgba(255, 255, 255, 0.06)' }} />
          </div>

          {/* Form area */}
          <div className="px-8 py-6">
            {/* Error */}
            {error && (
              <div
                className="p-3 rounded-xl text-xs text-center mb-4"
                style={{ background: 'rgba(255, 83, 83, 0.08)', border: '1px solid rgba(255, 83, 83, 0.15)', color: '#FF8A80' }}
              >
                {error}
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {/* Name (register only) */}
              {mode === 'register' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full px-4 py-3 text-sm outline-none rounded-xl transition-all"
                    style={{
                      background: '#0D0F14',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      color: '#E5E7EB',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = 'rgba(255, 83, 83, 0.4)'; e.target.style.boxShadow = '0 0 0 3px rgba(255, 83, 83, 0.08), 0 0 16px rgba(255, 83, 83, 0.06)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(255, 255, 255, 0.06)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              )}

              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@university.edu"
                  required
                  className="w-full px-4 py-3 text-sm outline-none rounded-xl transition-all"
                  style={{
                    background: '#0D0F14',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    color: '#E5E7EB',
                  }}
                  onFocus={(e) => { e.target.style.borderColor = 'rgba(255, 83, 83, 0.4)'; e.target.style.boxShadow = '0 0 0 3px rgba(255, 83, 83, 0.08), 0 0 16px rgba(255, 83, 83, 0.06)'; }}
                  onBlur={(e) => { e.target.style.borderColor = 'rgba(255, 255, 255, 0.06)'; e.target.style.boxShadow = 'none'; }}
                />
              </div>

              {/* Password */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-baseline">
                  <label className="text-[11px] font-medium uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Password</label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      className="text-[11px] hover:underline transition-colors"
                      style={{ color: '#FF5353' }}
                      onClick={() => setError('Password reset coming soon')}
                    >
                      Forgot password?
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
                    className="w-full px-4 py-3 pr-11 text-sm outline-none rounded-xl transition-all"
                    style={{
                      background: '#0D0F14',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      color: '#E5E7EB',
                    }}
                    onFocus={(e) => { e.target.style.borderColor = 'rgba(255, 83, 83, 0.4)'; e.target.style.boxShadow = '0 0 0 3px rgba(255, 83, 83, 0.08), 0 0 16px rgba(255, 83, 83, 0.06)'; }}
                    onBlur={(e) => { e.target.style.borderColor = 'rgba(255, 255, 255, 0.06)'; e.target.style.boxShadow = 'none'; }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 hover:opacity-80 transition-opacity"
                    style={{ color: '#4B5563' }}
                  >
                    {showPassword ? (
                      <svg className="w-[16px] h-[16px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    ) : (
                      <svg className="w-[16px] h-[16px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
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
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                style={{
                  background: '#FF5353',
                  color: 'white',
                  letterSpacing: '0.02em',
                  boxShadow: '0 4px 14px rgba(255, 83, 83, 0.25)',
                }}
                onMouseEnter={(e) => { if (!loading) { (e.target as HTMLElement).style.background = '#FF6B6B'; (e.target as HTMLElement).style.boxShadow = '0 6px 20px rgba(255, 83, 83, 0.35)'; } }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = '#FF5353'; (e.target as HTMLElement).style.boxShadow = '0 4px 14px rgba(255, 83, 83, 0.25)'; }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Signing in...
                  </span>
                ) : (
                  mode === 'login' ? 'Sign In' : 'Create Account'
                )}
              </button>
            </form>

            {/* Toggle mode */}
            <p className="text-center text-[12px] mt-5" style={{ color: '#6B7280' }}>
              {mode === 'login' ? (
                <>
                  Don&apos;t have an account?{' '}
                  <button
                    onClick={() => { setMode('register'); setError(''); }}
                    className="font-medium hover:underline transition-colors"
                    style={{ color: '#D1D5DB' }}
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    onClick={() => { setMode('login'); setError(''); }}
                    className="font-medium hover:underline transition-colors"
                    style={{ color: '#D1D5DB' }}
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
