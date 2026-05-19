import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import axios from 'axios';
import { useAuthStore, type AuthUser } from './store/auth.store';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Chat from './pages/Chat';
import Sessions from './pages/Sessions';
import Profile from './pages/Profile';
import PublicRooms from './pages/PublicRooms';
import Contacts from './pages/Contacts';
import Map from './pages/Map';
import Settings from './pages/Settings';
import MeshInspector from './pages/MeshInspector';
import { ToastProvider } from './components/ui/Toast';
import InstallBanner from './components/pwa/InstallBanner';
import OfflineBanner from './components/pwa/OfflineBanner';
import BottomNav from './components/layout/BottomNav';
import IncomingCallModal from './components/calls/IncomingCallModal';
import ActiveCallOverlay from './components/calls/ActiveCallOverlay';
import SOSButton from './components/sos/SOSButton';
import SOSAlertModal from './components/sos/SOSAlertModal';
import { useOfflineSync } from './hooks/useOfflineSync';
import { TopNav } from './components/layout/TopNav';
import { AppVersion } from './components/ui/AppVersion';
// Import network store to activate the singleton watcher
import './store/network.store';

function PWAWrapper({ children }: { children: React.ReactNode }) {
  useOfflineSync();
  return (
    <>
      <InstallBanner />
      <OfflineBanner />
      {children}
      {/* Call overlays are rendered at root level so they overlay the entire app */}
      <IncomingCallModal />
      <ActiveCallOverlay />
      {/* SOS overlays — rendered at root level so they always appear */}
      <SOSAlertModal />
    </>
  );
}

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const { bootstrapped, setAuth, setBootstrapped } = useAuthStore();

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const { data } = await axios.post<{ accessToken: string }>(
          '/api/v1/auth/refresh',
          {},
          { withCredentials: true },
        );

        // On a fresh device the persisted `user` is null, so the cached value
        // can't be trusted here. Always re-fetch /users/me with the new token
        // so the in-memory user matches the refreshed session.
        const stored = useAuthStore.getState().user;
        let user: AuthUser | null = stored;
        try {
          const me = await axios.get<{ id: string; email: string; username: string }>(
            '/api/v1/users/me',
            {
              headers: { Authorization: `Bearer ${data.accessToken}` },
              withCredentials: true,
            },
          );
          user = { _id: me.data.id, email: me.data.email, username: me.data.username };
        } catch {
          // If /users/me fails, fall back to whatever we already had (may still be null,
          // in which case we treat the refresh as failed and stay logged out).
        }

        if (cancelled) return;

        if (user) {
          setAuth(data.accessToken, user);
        }
      } catch {
        // no valid refresh cookie — stay logged out
      } finally {
        if (!cancelled) setBootstrapped();
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!bootstrapped) return null;

  return <>{children}</>;
}

function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden bg-gray-900">
      <TopNav />
      <div className="flex-1 min-h-0 overflow-y-auto pb-16">{children}</div>
    </div>
  );
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }
  return (
    <>
      <AuthenticatedLayout>{children}</AuthenticatedLayout>
      <BottomNav />
      <SOSButton />
    </>
  );
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (accessToken) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

const PUBLIC_ROUTE_PREFIXES = ['/login', '/register', '/forgot-password', '/reset-password'];

function VersionBadge() {
  const { pathname } = useLocation();
  const isPublicRoute = PUBLIC_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isPublicRoute) return null;

  return (
    <div className="pointer-events-none fixed left-1/2 bottom-3 z-30 -translate-x-1/2 rounded-full bg-gray-900/80 px-3 py-1 ring-1 ring-white/10 backdrop-blur">
      <AppVersion className="text-gray-400" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <VersionBadge />
        <PWAWrapper>
        <AuthBootstrap>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnly>
                <Login />
              </PublicOnly>
            }
          />
          <Route
            path="/register"
            element={
              <PublicOnly>
                <Register />
              </PublicOnly>
            }
          />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Chat />
              </RequireAuth>
            }
          />
          <Route
            path="/sessions"
            element={
              <RequireAuth>
                <Sessions />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <Profile />
              </RequireAuth>
            }
          />
          <Route
            path="/public-rooms"
            element={
              <RequireAuth>
                <PublicRooms />
              </RequireAuth>
            }
          />
          <Route
            path="/contacts"
            element={
              <RequireAuth>
                <Contacts />
              </RequireAuth>
            }
          />
          <Route
            path="/map"
            element={
              <RequireAuth>
                <Map />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <Settings />
              </RequireAuth>
            }
          />
          {import.meta.env.DEV && (
            <Route
              path="/dev/mesh"
              element={
                <RequireAuth>
                  <MeshInspector />
                </RequireAuth>
              }
            />
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </AuthBootstrap>
        </PWAWrapper>
      </ToastProvider>
    </BrowserRouter>
  );
}
