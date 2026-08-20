import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';
import { ResetPassword } from './components/ResetPassword';
import { Dashboard } from './components/Dashboard';
import { EventDetails } from './components/EventDetails';
import type { Event } from './types';
import { Loader2, WifiOff } from 'lucide-react';

interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning';
  message: string;
}

const App: React.FC = () => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState('');
  
  // Navigation View: 'login' | 'register' | 'forgot-password' | 'dashboard' | 'event-details' | 'reset-password'
  const [view, setView] = useState<'login' | 'register' | 'forgot-password' | 'dashboard' | 'event-details' | 'reset-password'>('login');
  
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [isEventCreator, setIsEventCreator] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [logoutLoading, setLogoutLoading] = useState(false);

  // Theme switching state
  const [theme, setTheme] = useState<'light' | 'dark'>(() => 
    (localStorage.getItem('eventra-theme') as 'light' | 'dark') || 'dark'
  );

  // Internet connectivity state
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove('theme-light', 'theme-dark');
    document.documentElement.classList.add(`theme-${theme}`);
    localStorage.setItem('eventra-theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));

  // Toast utility helper
  const showToast = (type: 'success' | 'error' | 'warning', message: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const fetchProfileName = async (userId: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle();
      if (data) {
        setProfileName(data.full_name);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  };

  // Helper to parse hash and handle navigation
  const parseHashAndNavigate = async (currentSession: any) => {
    if (!currentSession?.user) return;

    const hash = window.location.hash;
    if (hash.startsWith('#/event/')) {
      let eventId = hash.replace('#/event/', '');
      if (eventId.includes('/')) {
        eventId = eventId.split('/')[0];
      }
      if (eventId) {
        setLoading(true);
        try {
          const { data: event, error } = await supabase
            .from('events')
            .select('*')
            .eq('id', eventId)
            .maybeSingle();

          if (error) throw error;
          if (event) {
            setSelectedEvent(event);
            setIsEventCreator(event.creator_id === currentSession.user.id);
            setView('event-details');
          } else {
            window.location.hash = '#/';
            setSelectedEvent(null);
            setView('dashboard');
          }
        } catch (err) {
          console.error('Error fetching event from hash:', err);
          window.location.hash = '#/';
          setSelectedEvent(null);
          setView('dashboard');
        } finally {
          setLoading(false);
        }
      }
    } else if (hash.includes('reset-password')) {
      setView('reset-password');
    } else {
      setSelectedEvent(null);
      setView('dashboard');
    }
  };

  useEffect(() => {
    // 1. Initial Session Check
    const checkSession = async () => {
      setLoading(true);
      try {
        const { data: { session: currSession } } = await supabase.auth.getSession();
        setSession(currSession);
        if (currSession?.user) {
          await fetchProfileName(currSession.user.id);
          await parseHashAndNavigate(currSession);
        } else {
          if (window.location.hash.includes('reset-password')) {
            setView('reset-password');
          } else {
            setView('login');
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // 2. Auth State Change Listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      setSession(currentSession);
      
      if (event === 'SIGNED_IN' && currentSession?.user) {
        await fetchProfileName(currentSession.user.id);
        await parseHashAndNavigate(currentSession);
      } else if (event === 'SIGNED_OUT') {
        setProfileName('');
        setView('login');
        setSelectedEvent(null);
        window.location.hash = ''; // Clear hash on logout
      } else if (event === 'PASSWORD_RECOVERY') {
        setView('reset-password');
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 3. Set up dynamic hash change listener that reacts to hash updates
  useEffect(() => {
    if (!session?.user) return;

    const handleHashChange = () => {
      parseHashAndNavigate(session);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [session]);

  const handleAuthSuccess = async () => {
    const { data: { session: currSession } } = await supabase.auth.getSession();
    setSession(currSession);
    if (currSession?.user) {
      await fetchProfileName(currSession.user.id);
      await parseHashAndNavigate(currSession);
      showToast('success', 'Logged in successfully!');
    }
  };

  const handleSelectEvent = (event: Event, _isCreator: boolean) => {
    window.location.hash = `#/event/${event.id}`;
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setSession(null);
      setProfileName('');
      setView('login');
      setSelectedEvent(null);
      window.location.hash = '';
      showToast('success', 'Logged out successfully!');
    } catch (err: any) {
      showToast('error', err.message || 'Logout failed.');
    } finally {
      setLogoutLoading(false);
    }
  };

  const handleResetSuccess = () => {
    setView('login');
    showToast('success', 'Password reset successfully! Please log in.');
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: 'var(--bg-main)', gap: '1rem' }}>
        <Loader2 className="animate-spin" size={40} style={{ color: 'var(--color-primary)' }} />
        <p style={{ color: 'var(--text-muted)' }}>Initializing Eventra...</p>
      </div>
    );
  }

  return (
    <>
      {/* Offline Warning Banner */}
      {!isOnline && (
        <div className="offline-banner">
          <WifiOff size={16} />
          <span>No Internet Connection</span>
        </div>
      )}

      {/* Toast Notification Container */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <span>{toast.message}</span>
          </div>
        ))}
      </div>

      {/* Main view switching */}
      {view === 'reset-password' && (
        <ResetPassword onSuccess={handleResetSuccess} />
      )}

      {(view === 'login' || view === 'register' || view === 'forgot-password') && (
        <Auth
          onAuthSuccess={handleAuthSuccess}
          setView={(v: any) => setView(v)}
          currentView={view}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}

      {view === 'dashboard' && session?.user && (
        <Dashboard
          userId={session.user.id}
          userName={profileName}
          userEmail={session.user.email || ''}
          onSelectEvent={handleSelectEvent}
          onLogout={handleLogout}
          logoutLoading={logoutLoading}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}

      {view === 'event-details' && session?.user && selectedEvent && (
        <EventDetails
          event={selectedEvent}
          isCreator={isEventCreator}
          currentUserId={session.user.id}
          onBack={() => { window.location.hash = '#/'; }}
          theme={theme}
          onToggleTheme={toggleTheme}
        />
      )}
    </>
  );
};

export default App;
