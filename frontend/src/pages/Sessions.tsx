import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getSessions, revokeSession } from '../api/sessions.api';
import type { Session } from '../api/sessions.api';

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseUserAgent(ua: string): string {
  if (!ua) return 'Unknown device';
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS device';
  if (/Android/.test(ua)) return 'Android device';
  if (/Chrome/.test(ua) && !/Edg/.test(ua)) return 'Chrome browser';
  if (/Firefox/.test(ua)) return 'Firefox browser';
  if (/Safari/.test(ua)) return 'Safari browser';
  if (/Edg/.test(ua)) return 'Edge browser';
  return 'Unknown browser';
}

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getSessions();
      setSessions(res.data.data ?? []);
    } catch {
      setError('Failed to load sessions. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const handleRevoke = async (sessionId: string) => {
    setRevoking(sessionId);
    try {
      await revokeSession(sessionId);
      setSessions((prev) => prev.filter((s) => s._id !== sessionId));
    } catch {
      setError('Failed to revoke session.');
    } finally {
      setRevoking(null);
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
        <span className="text-sm text-gray-300">Sessions</span>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-white">Active Sessions</h1>
          <p className="text-sm text-gray-400 mt-1">
            These are the devices and browsers that are currently signed in to your account. Revoke any session you do not recognise.
          </p>
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-900/30 border border-red-800 rounded-xl px-4 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-6 h-6 border-2 border-gray-600 border-t-blue-400 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => (
              <div
                key={session._id}
                className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-4 rounded-xl border transition-colors ${
                  session.isCurrent
                    ? 'bg-blue-600/10 border-blue-600/40'
                    : 'bg-gray-900 border-gray-700 hover:border-gray-600'
                }`}
              >
                {/* Device icon */}
                <div className="shrink-0 w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white truncate">
                      {parseUserAgent(session.userAgent)}
                    </p>
                    {session.isCurrent && (
                      <span className="shrink-0 text-xs px-1.5 py-0.5 bg-blue-600/30 text-blue-400 rounded font-medium">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate" title={session.userAgent}>
                    {session.userAgent || 'Unknown user agent'}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-gray-500">
                    {session.ipAddress && <span>IP: {session.ipAddress}</span>}
                    <span>Started: {formatDate(session.createdAt)}</span>
                    <span>Expires: {formatDate(session.expiresAt)}</span>
                  </div>
                </div>

                {!session.isCurrent && (
                  <button
                    onClick={() => handleRevoke(session._id)}
                    disabled={revoking === session._id}
                    className="shrink-0 px-3 py-1.5 text-xs border border-red-700 text-red-400 hover:bg-red-600 hover:text-white hover:border-red-600 disabled:opacity-50 rounded-lg transition-colors"
                  >
                    {revoking === session._id ? 'Revoking…' : 'Revoke'}
                  </button>
                )}
              </div>
            ))}
            {sessions.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-10">No active sessions found.</p>
            )}
          </div>
        )}

        <div className="mt-6">
          <Link to="/" className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
            ← Back to chat
          </Link>
        </div>
      </main>
    </div>
  );
}
