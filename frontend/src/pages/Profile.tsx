import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { changePassword, deleteAccount } from '../api/auth.api';

export default function Profile() {
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const navigate = useNavigate();

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');

  // Delete account state
  const [deleteChecked, setDeleteChecked] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError('');
    setPwdSuccess('');

    if (newPassword !== confirmPassword) {
      setPwdError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 8) {
      setPwdError('New password must be at least 8 characters.');
      return;
    }

    setPwdLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPwdSuccess('Password changed successfully.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to change password.';
      setPwdError(msg);
    } finally {
      setPwdLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteChecked) return;
    setDeleteError('');
    setDeleteLoading(true);
    try {
      await deleteAccount();
      clearAuth();
      navigate('/login', { replace: true });
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Failed to delete account.';
      setDeleteError(msg);
      setDeleteLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top bar */}
      <header className="h-14 bg-gray-900 border-b border-gray-700 flex items-center px-4 gap-4">
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z" />
            </svg>
          </div>
          <span className="font-bold text-white text-sm">Cyphrax</span>
        </Link>
        <span className="text-gray-500 text-sm">/</span>
        <span className="text-sm text-gray-300">Profile</span>
      </header>

      <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Account info */}
        <section className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white mb-4">Account information</h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Username</p>
              <p className="text-sm text-white font-mono">@{user?.username}</p>
              <p className="text-xs text-gray-600 mt-0.5">Username cannot be changed.</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Email</p>
              <p className="text-sm text-white">{user?.email}</p>
            </div>
          </div>
        </section>

        {/* Change password */}
        <section className="bg-gray-900 border border-gray-700 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white mb-4">Change password</h2>
          <form onSubmit={handleChangePassword} className="space-y-3">
            {pwdError && (
              <div className="text-xs text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
                {pwdError}
              </div>
            )}
            {pwdSuccess && (
              <div className="text-xs text-green-400 bg-green-900/30 border border-green-800 rounded-lg px-3 py-2">
                {pwdSuccess}
              </div>
            )}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Current password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">New password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Confirm new password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={pwdLoading || !currentPassword || !newPassword || !confirmPassword}
              className="w-full py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg transition-colors"
            >
              {pwdLoading ? 'Changing…' : 'Change password'}
            </button>
          </form>
        </section>

        {/* Danger zone — Delete account */}
        <section className="bg-gray-900 border border-red-900/50 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-red-400 mb-3">Danger zone</h2>
          <p className="text-xs text-gray-400 mb-4">
            Permanently deletes your account and all data associated with it — owned rooms, messages, and sessions. This cannot be undone.
          </p>
          {deleteError && (
            <div className="mb-3 text-xs text-red-400 bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
              {deleteError}
            </div>
          )}
          <label className="flex items-start gap-2 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={deleteChecked}
              onChange={(e) => setDeleteChecked(e.target.checked)}
              className="rounded mt-0.5"
            />
            <span className="text-sm text-gray-300">
              I understand this action is permanent and cannot be reversed.
            </span>
          </label>
          <button
            onClick={handleDeleteAccount}
            disabled={!deleteChecked || deleteLoading}
            className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
          >
            {deleteLoading ? 'Deleting…' : 'Delete my account'}
          </button>
        </section>

        <div className="mt-2">
          <Link to="/" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
            ← Back to chat
          </Link>
        </div>
      </main>
    </div>
  );
}
