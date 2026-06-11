import { Gamepad2, LogOut } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useState } from 'react';
import type { PageId } from '../../App';

interface HeaderProps {
  onNavigate: (page: PageId) => void;
  onOpenAuth: (mode: 'signin' | 'signup') => void;
}

export function Header({ onNavigate, onOpenAuth }: HeaderProps) {
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="lg:hidden sticky top-0 z-40 bg-rz-bg/80 backdrop-blur-xl border-b border-rz-border">
      <div className="flex items-center justify-between px-4 h-14">
        <button onClick={() => onNavigate('home')} className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-accent flex items-center justify-center">
            <Gamepad2 className="w-4 h-4 text-white" />
          </div>
          <div>
            <span className="text-sm font-extrabold tracking-tight">REDZONE</span>
            <span className="text-[9px] font-medium text-rz-accent tracking-[0.15em] ml-1">ARENA</span>
          </div>
        </button>

        <div className="flex items-center gap-2">
          {!profile ? (
            <button onClick={() => onOpenAuth('signin')} className="btn-primary !py-1.5 !px-3 text-xs">
              Sign In
            </button>
          ) : (
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="w-8 h-8 rounded-full bg-rz-card border border-rz-border flex items-center justify-center overflow-hidden"
            >
              {profile.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-bold text-rz-accent">
                  {profile.username.charAt(0).toUpperCase()}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {menuOpen && profile && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-14 right-2 w-56 glass-strong rounded-xl p-2 shadow-glass animate-fade-in z-50">
            <div className="px-3 py-2 border-b border-rz-border mb-1">
              <p className="text-sm font-semibold">{profile.username}</p>
              <p className="text-xs text-rz-text-secondary capitalize">{profile.role}</p>
            </div>
            <button
              onClick={() => { onNavigate('profile'); setMenuOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-rz-text-secondary hover:text-rz-text hover:bg-rz-card rounded-lg transition-colors"
            >
              Profile
            </button>
            <button
              onClick={() => { onNavigate('teams'); setMenuOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-rz-text-secondary hover:text-rz-text hover:bg-rz-card rounded-lg transition-colors"
            >
              Teams
            </button>
            {profile.role === 'admin' && (
              <button
                onClick={() => { onNavigate('admin'); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-rz-accent hover:bg-rz-card rounded-lg transition-colors"
              >
                Admin Panel
              </button>
            )}
            <div className="border-t border-rz-border mt-1 pt-1">
              <button
                onClick={() => { signOut(); setMenuOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-rz-error hover:bg-rz-card rounded-lg transition-colors flex items-center gap-2"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign Out
              </button>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
