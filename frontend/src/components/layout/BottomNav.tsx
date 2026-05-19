import { NavLink } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Chat', icon: '💬' },
  { to: '/map', label: 'Map', icon: '🗺' },
  { to: '/contacts', label: 'Contacts', icon: '👥' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
  { to: '/profile', label: 'Profile', icon: '👤' },
] as const;

export default function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-0 right-0 z-50 flex bg-slate-900 border-t border-slate-700"
    >
      {navItems.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-2 gap-0.5 text-xs transition-colors ${
              isActive ? 'text-blue-400' : 'text-slate-400 hover:text-slate-200'
            }`
          }
        >
          <span className="text-lg leading-none">{icon}</span>
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
