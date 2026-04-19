import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

export function TopNav() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="h-14 bg-gray-900 border-b border-gray-700 flex items-center px-4 gap-4 shrink-0 z-10">
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z" />
          </svg>
        </div>
        <span className="font-bold text-white text-sm hidden sm:block">Cyphrax</span>
      </Link>

      {/* Nav links */}
      <nav className="flex items-center gap-1 flex-1 overflow-x-auto">
        <NavLink to="/public-rooms">Public Rooms</NavLink>
        <NavLink to="/contacts">Contacts</NavLink>
        <NavLink to="/sessions">Sessions</NavLink>
      </nav>

      {/* Profile dropdown */}
      <div className="relative shrink-0" ref={profileRef}>
        <button
          onClick={() => setProfileOpen((o) => !o)}
          className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-gray-800 transition-colors"
          aria-label="Account menu"
        >
          <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
            {currentUser?.username?.slice(0, 2).toUpperCase() ?? '?'}
          </div>
          <span className="text-sm text-gray-200 hidden sm:block max-w-[100px] truncate">
            {currentUser?.username}
          </span>
          <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {profileOpen && (
          <div className="absolute right-0 top-10 bg-gray-800 border border-gray-700 rounded-xl shadow-xl py-1 min-w-[160px] z-50">
            <button
              onClick={() => { navigate('/profile'); setProfileOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
            >
              Profile
            </button>
            <button
              onClick={() => { navigate('/sessions'); setProfileOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 transition-colors"
            >
              Sessions
            </button>
            <hr className="border-gray-700 my-1" />
            <button
              onClick={() => { void logout(); }}
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="text-xs text-gray-400 hover:text-white hover:bg-gray-800 px-2 py-1.5 rounded-lg transition-colors whitespace-nowrap"
    >
      {children}
    </Link>
  );
}
