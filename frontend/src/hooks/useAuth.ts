import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import * as authApi from '../api/auth.api';

export function useAuth() {
  const { accessToken, user, setAuth, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await authApi.login({ email, password });
      setAuth(data.accessToken, data.user);
      navigate('/');
    },
    [setAuth, navigate]
  );

  const register = useCallback(
    async (email: string, username: string, password: string) => {
      const { data } = await authApi.register({ email, username, password });
      setAuth(data.accessToken, data.user);
      navigate('/');
    },
    [setAuth, navigate]
  );

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      // best-effort logout
    } finally {
      clearAuth();
      navigate('/login');
    }
  }, [clearAuth, navigate]);

  return {
    currentUser: user,
    accessToken,
    isAuthenticated: !!accessToken,
    login,
    register,
    logout,
  };
}
