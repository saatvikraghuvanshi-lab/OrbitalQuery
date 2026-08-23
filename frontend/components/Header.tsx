'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/separator';

export default function Header() {
  const router = useRouter();
  const [userName, setUserName] = useState('');

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('oq_user') || '{}');
      setUserName(user.name || user.email || 'User');
    } catch {}
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('oq_token');
    localStorage.removeItem('oq_user');
    router.push('/auth');
  };

  return (
    <header className="border-b border-white/5 sticky top-0 z-50" style={{ background: '#0c0e12' }}>
      <div className="max-w-[1800px] mx-auto px-6 py-3">
        <div className="flex items-center justify-between">
          {/* Logo — PNG already has text */}
          <div className="flex items-center">
            <Image
              src="/orbitalquery-logo.png"
              alt="ØrbitalQuery"
              width={120}
              height={36}
              className="object-contain"
              priority
            />
          </div>

          {/* Right side: Settings + User Avatar + Logout */}
          <div className="flex items-center gap-4">
            {/* Settings icon */}
            <button
              className="p-2 rounded-lg hover:bg-white/5 transition-colors text-gray-400 hover:text-white"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>

            <Separator orientation="vertical" className="h-6 bg-white/10" />

            {/* User avatar + dropdown */}
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
      </div>
    </header>
  );
}
