import { Home, Gamepad2, Trophy, Users, User, Shield, LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import type { PageId } from '../../App';

const navItems = [
  { id: 'home' as PageId, label: 'Home', icon: Home },
  { id: 'play' as PageId, label: 'Play', icon: Gamepad2 },
  { id: 'leaderboard' as PageId, label: 'Leaderboard', icon: Trophy },
  { id: 'teams' as PageId, label: 'Teams', icon: Users },
  { id: 'profile' as PageId, label: 'Profile', icon: User },
];

interface SidebarProps {
  activePage: PageId;
  onNavigate: (page: PageId) => void;
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { profile, signOut } = useAuth();
  const isAdmin = profile?.role === 'admin';

  return (
    <aside className="hidden lg:flex flex-col w-64 bg-rz-surface border-r border-rz-border min-h-screen fixed left-0 top-0 z-40">
      <div className="p-6 border-b border-rz-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-accent flex items-center justify-center">
            <Gamepad2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight">REDZONE</h1>
            <p className="text-[10px] font-medium text-rz-accent tracking-[0.2em] uppercase">ARENA</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={activePage === id ? 'sidebar-link-active' : 'sidebar-link'}
          >
            <Icon className="w-[18px] h-[18px]" />
            {label}
          </button>
        ))}

        {isAdmin && (
          <>
            <div className="my-3 border-t border-rz-border" />
            <button
              onClick={() => onNavigate('admin')}
              className={activePage === 'admin' ? 'sidebar-link-active' : 'sidebar-link'}
            >
              <Shield className="w-[18px] h-[18px]" />
              Admin Panel
            </button>
          </>
        )}
      </nav>

      <div className="p-4 border-t border-rz-border space-y-3">
        {profile && (
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-rz-card border border-rz-border flex items-center justify-center overflow-hidden shrink-0">
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-bold text-rz-accent">{profile.username.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{profile.username}</p>
              <p className="text-[10px] text-rz-text-muted capitalize">{profile.role}</p>
            </div>
            <button onClick={signOut} className="text-rz-text-muted hover:text-rz-error transition-colors" title="Sign Out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
        <div className="glass rounded-xl p-4">
          <p className="text-xs font-semibold text-rz-accent mb-1">STANDOFF 2</p>
          <p className="text-[11px] text-rz-text-secondary leading-relaxed">
            Competitive tournament platform for SO2 players. Join the arena.
          </p>
        </div>
      </div>
    </aside>
  );
}
