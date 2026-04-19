import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
  _id: string;
  username: string;
  email: string;
}

interface AuthState {
  accessToken: string | null;
  user: AuthUser | null;
  bootstrapped: boolean;
  setAuth: (token: string, user: AuthUser) => void;
  clearAuth: () => void;
  setBootstrapped: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      user: null,
      bootstrapped: false,
      setAuth: (token, user) => set({ accessToken: token, user }),
      clearAuth: () => set({ accessToken: null, user: null }),
      setBootstrapped: () => set({ bootstrapped: true }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user }),
    }
  )
);
