import { useState, useCallback, useEffect } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { Sidebar } from './components/layout/Sidebar';
import { BottomNav } from './components/layout/BottomNav';
import { Header } from './components/layout/Header';
import { AuthModal } from './components/auth/AuthModal';
import { HomePage } from './pages/HomePage';
import { PlayPage } from './pages/PlayPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { TeamsPage } from './pages/TeamsPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';
import { Loader2, Gamepad2 } from 'lucide-react';

export type PageId = 'home' | 'play' | 'leaderboard' | 'profile' | 'teams' | 'admin';

const PROTECTED_PAGES: PageId[] = ['play', 'leaderboard', 'profile', 'admin'];

function AppContent() {
  const [page, setPage] = useState<PageId>('home');
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [pendingPage, setPendingPage] = useState<PageId | null>(null);
  const { session, loading } = useAuth();
  const [loadTimeout, setLoadTimeout] = useState(false);

  // If loading takes more than 8s, force-continue
  useEffect(() => {
    if (!loading) {
      setLoadTimeout(false);
      return;
    }
    const t = setTimeout(() => setLoadTimeout(true), 8000);
    return () => clearTimeout(t);
  }, [loading]);

  // After login: navigate to pending page or home
  useEffect(() => {
    if (session && !authOpen) {
      if (pendingPage) {
        setPage(pendingPage);
        setPendingPage(null);
      }
    }
  }, [session, authOpen, pendingPage]);

  const navigate = useCallback((target: PageId) => {
    if (PROTECTED_PAGES.includes(target) && !session) {
      setAuthMode('signin');
      setAuthOpen(true);
      setPendingPage(target);
      return;
    }
    setPage(target);
  }, [session]);

  const openAuth = useCallback((mode: 'signin' | 'signup') => {
    setAuthMode(mode);
    setAuthOpen(true);
  }, []);

  const handleAuthClose = useCallback(() => {
    setAuthOpen(false);
  }, []);

  if (loading && !loadTimeout) {
    return (
      <div className="min-h-screen bg-rz-bg flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-rz-accent animate-spin mx-auto mb-3" />
          <p className="text-sm text-rz-text-secondary">Loading REDZONE ARENA...</p>
        </div>
      </div>
    );
  }

  const renderPage = () => {
    // Gate protected pages
    if (PROTECTED_PAGES.includes(page) && !session) {
      return (
        <div className="animate-fade-in flex flex-col items-center justify-center min-h-[50vh] text-center">
          <Gamepad2 className="w-16 h-16 text-rz-text-muted mb-4" />
          <h2 className="text-xl font-bold mb-2">Sign In Required</h2>
          <p className="text-rz-text-secondary mb-4">You need to be signed in to access this page</p>
          <button onClick={() => openAuth('signin')} className="btn-primary">
            Sign In
          </button>
        </div>
      );
    }

    switch (page) {
      case 'home': return <HomePage onNavigate={navigate} onOpenAuth={openAuth} />;
      case 'play': return <PlayPage />;
      case 'leaderboard': return <LeaderboardPage />;
      case 'teams': return <TeamsPage />;
      case 'profile': return <ProfilePage />;
      case 'admin': return <AdminPage />;
    }
  };

  return (
    <div className="min-h-screen bg-rz-bg">
      <Sidebar activePage={page} onNavigate={navigate} />
      <Header onNavigate={navigate} onOpenAuth={openAuth} />
      <main className="lg:ml-64 pb-20 lg:pb-8">
        <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
          {loadTimeout && (
            <div className="bg-rz-warning/10 border border-rz-warning/20 rounded-lg px-4 py-2.5 text-sm text-rz-warning mb-4">
              Connection is slow. Some features may be limited.
            </div>
          )}
          {renderPage()}
        </div>
      </main>
      <BottomNav activePage={page} onNavigate={navigate} />
      <AuthModal isOpen={authOpen} onClose={handleAuthClose} initialMode={authMode} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
