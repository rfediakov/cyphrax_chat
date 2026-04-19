import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import axios from 'axios';
import { useAuthStore } from './store/auth.store';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Chat from './pages/Chat';
import Sessions from './pages/Sessions';
import Profile from './pages/Profile';
import PublicRooms from './pages/PublicRooms';
import Contacts from './pages/Contacts';
import { ToastProvider } from './components/ui/Toast';

function AuthBootstrap({ children }: { children: React.ReactNode }) {
  const { bootstrapped, setAuth, setBootstrapped } = useAuthStore();

  useEffect(() => {
    axios
      .post<{ accessToken: string }>('/api/v1/auth/refresh', {}, { withCredentials: true })
      .then(({ data }) => {
        setAuth(data.accessToken, useAuthStore.getState().user!);
      })
      .catch(() => {
        // no valid refresh cookie — stay logged out
      })
      .finally(() => {
        setBootstrapped();
      });
  }, []);

  if (!bootstrapped) return null;

  return <>{children}</>;
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore((s) => s.accessToken);
  if (accessToken) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </AuthBootstrap>
      </ToastProvider>
    </BrowserRouter>
  );
}
