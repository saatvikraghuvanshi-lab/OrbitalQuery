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

  // Check if already logged in
  useEffect(() => {
    const token = localStorage.getItem('oq_token');
    if (token) {
      router.push('/');
    }
  }, [router]);

  if (!mounted) return (
    <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
      <div className="text-slate-600 text-sm">Loading...</div>
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

      // Store token
      localStorage.setItem('oq_token', data.token);
      localStorage.setItem('oq_user', JSON.stringify(data.user));

      // Redirect to main app
      router.push('/');
    } catch (err) {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center px-4">
      {/* Background gradient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d1117] via-[#0d1117] to-[#161b22]" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-red-500/5 rounded-full blur-[120px]" />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="mb-8">
          <OrbitalLogo size="lg" showText={true} />
        </div>

        {/* Auth Card */}
        <div className="bg-[#161b22]/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8">
          {/* Title */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Authentication
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Access Research-Grade Earth Observation Platform
            </p>
          </div>

          {/* Google SSO Button */}
          <button
            type="button"
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-medium py-3 px-4 rounded-xl
              hover:bg-gray-100 transition-all duration-200 text-sm border border-gray-200"
            onClick={() => setError('Google SSO coming soon')}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-slate-700/50" />
            <span className="text-[10px] text-slate-500 uppercase tracking-[0.15em] font-medium">
              or standard auth
            </span>
            <div className="flex-1 h-px bg-slate-700/50" />
          </div>

          {/* Error */}
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name (register only) */}
            {mode === 'register' && (
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 font-medium uppercase tracking-wider">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Researcher Name"
                  className="w-full bg-[#0d1117] border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-white
                    placeholder-slate-600 focus:border-red-500/50 focus:outline-none transition-colors"
                />
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium uppercase tracking-wider">
                Gmail ID
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="researcher@institute.edu"
                required
                className="w-full bg-[#0d1117] border border-slate-700/50 rounded-xl px-4 py-3 text-sm text-white
                  placeholder-slate-600 focus:border-red-500/50 focus:outline-none transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                  Password
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
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
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full bg-[#0d1117] border border-slate-700/50 rounded-xl px-4 py-3 pr-10 text-sm text-white
                    placeholder-slate-600 focus:border-red-500/50 focus:outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
              className="w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider
                bg-gradient-to-r from-[#ef4444] to-[#f97316] hover:from-[#dc2626] hover:to-[#ea580c]
                text-white transition-all duration-200 shadow-lg shadow-red-500/20
                disabled:opacity-50 disabled:cursor-not-allowed
                active:scale-[0.98]"
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
          <div className="text-center mt-5">
            {mode === 'login' ? (
              <p className="text-xs text-slate-500">
                No active clearance?{' '}
                <button
                  onClick={() => { setMode('register'); setError(''); }}
                  className="text-white font-semibold underline underline-offset-2 hover:text-red-400 transition-colors"
                >
                  Request Access
                </button>
              </p>
            ) : (
              <p className="text-xs text-slate-500">
                Already have clearance?{' '}
                <button
                  onClick={() => { setMode('login'); setError(''); }}
                  className="text-white font-semibold underline underline-offset-2 hover:text-red-400 transition-colors"
                >
                  Sign In
                </button>
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-slate-600 mt-6 tracking-wide">
          Secured by Sentinel Network • L1C Encryption Active
        </p>
      </div>
    </div>
  );
}
