import { Home, Gamepad2, Trophy, User } from 'lucide-react';
import type { PageId } from '../../App';

const navItems = [
  { id: 'home' as PageId, label: 'Home', icon: Home },
  { id: 'play' as PageId, label: 'Play', icon: Gamepad2 },
  { id: 'leaderboard' as PageId, label: 'Ranks', icon: Trophy },
  { id: 'profile' as PageId, label: 'Profile', icon: User },
];

interface BottomNavProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

export function BottomNav({ activePage, onNavigate }: BottomNavProps) {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-rz-surface/95 backdrop-blur-xl border-t border-rz-border safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-1.5">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activePage === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-all duration-200 min-w-[64px]
                ${isActive ? 'text-rz-accent' : 'text-rz-text-muted hover:text-rz-text-secondary'}`}
            >
              <Icon className={`w-5 h-5 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`} />
              <span className={`text-[10px] font-medium ${isActive ? 'font-semibold' : ''}`}>{label}</span>
              {isActive && (
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-rz-accent rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
