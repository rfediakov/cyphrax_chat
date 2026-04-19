import api from './axios';
import type { AuthUser } from '../store/auth.store';

export interface RegisterPayload {
  email: string;
  username: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export const register = (payload: RegisterPayload) =>
  api.post<AuthResponse>('/auth/register', payload);

export const login = (payload: LoginPayload) =>
  api.post<AuthResponse>('/auth/login', payload);

export const logout = () => api.post('/auth/logout');

export const refreshToken = () =>
  api.post<{ accessToken: string }>('/auth/refresh');

export const requestPasswordReset = (email: string) =>
  api.post('/auth/password/reset-request', { email });

export const resetPassword = (token: string, newPassword: string) =>
  api.post('/auth/password/reset', { token, newPassword });

export const changePassword = (currentPassword: string, newPassword: string) =>
  api.put('/auth/password/change', { currentPassword, newPassword });

export const deleteAccount = () => api.delete('/auth/account');
