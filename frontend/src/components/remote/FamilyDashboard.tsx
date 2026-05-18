import { useEffect, useState, useCallback } from 'react';
import { getWards, type Ward } from '../../api/remote.api';
import { usePresenceStore } from '../../store/presence.store';
import { useTelemetryStore } from '../../store/telemetry.store';
import { socketSingleton } from '../../hooks/useSocket';
import { useRemoteStore } from '../../store/remote.store';

interface FamilyDashboardProps {
  onClose: () => void;
  onMessageWard: (wardId: string) => void;
}

export default function FamilyDashboard({ onClose, onMessageWard }: FamilyDashboardProps) {
  const [wards, setWards] = useState<Ward[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);

  const statuses = usePresenceStore((s) => s.statuses);
  const telemetry = useTelemetryStore((s) => s.entries);
  const activeSession = useRemoteStore((s) => s.activeSession);

  const loadWards = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getWards();
      setWards(data.wards);
    } catch {
      // silently fail — wards list is non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWards();
  }, [loadWards]);

  const handleRequestView = useCallback(
    (wardId: string) => {
      const socket = socketSingleton;
      if (!socket) return;
      setRequesting(wardId);
      socket.emit('remote_view_request', { targetUserId: wardId });
      // Reset requesting state after 35 seconds (30s auto-deny + buffer)
      setTimeout(() => setRequesting((prev) => (prev === wardId ? null : prev)), 35_000);
    },
    [],
  );

  const isViewingWard = (wardId: string) =>
    activeSession?.isGuardian && activeSession.peerId === wardId;

  return (
    <div className="absolute top-14 right-0 z-[1500] w-72 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h2 className="text-white font-bold text-sm">Family Members</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-white text-lg leading-none focus:outline-none"
          aria-label="Close family dashboard"
        >
          ✕
        </button>
      </div>

      {/* Ward list */}
      <div className="overflow-y-auto max-h-80">
        {loading && (
          <div className="flex items-center justify-center py-8 text-gray-500 text-sm">
            Loading…
          </div>
        )}

        {!loading && wards.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="text-gray-400 text-sm">No family members linked.</p>
            <p className="text-gray-600 text-xs mt-1">
              Ask a family member to add you as their guardian.
            </p>
          </div>
        )}

        {!loading &&
          wards.map((ward) => {
            const presence = statuses[ward._id] ?? 'offline';
            const tel = telemetry[ward._id];
            const battery = tel?.battery?.level;
            const isOnline = presence === 'online';
            const isViewing = isViewingWard(ward._id);
            const isRequesting = requesting === ward._id;

            return (
              <div
                key={ward._id}
                className="px-4 py-3 border-b border-gray-800 last:border-0"
              >
                <div className="flex items-start gap-3">
                  {/* Avatar placeholder */}
                  <div
                    className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center text-lg shrink-0"
                    aria-hidden="true"
                  >
                    👤
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-white font-medium text-sm truncate">
                        {ward.username}
                      </span>
                      <span
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          isOnline ? 'bg-green-400' : 'bg-gray-500'
                        }`}
                        aria-label={isOnline ? 'Online' : 'Offline'}
                      />
                      {ward.restrictedMode && (
                        <span
                          className="text-yellow-400 text-xs shrink-0"
                          title="Restricted mode active"
                        >
                          🔒
                        </span>
                      )}
                    </div>

                    {/* Status line */}
                    <div className="flex items-center gap-2 mt-0.5">
                      {battery !== undefined && battery !== null && (
                        <span className="text-gray-400 text-xs">
                          🔋 {Math.round(battery * 100)}%
                        </span>
                      )}
                      {!isOnline && (
                        <span className="text-gray-500 text-xs">Offline</span>
                      )}
                      {isOnline && (
                        <span className="text-green-400 text-xs">Online</span>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        onClick={() => onMessageWard(ward._id)}
                        className="flex items-center gap-1 px-2 py-1 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-gray-500"
                        aria-label={`Message ${ward.username}`}
                      >
                        💬 Msg
                      </button>

                      {isViewing ? (
                        <span className="flex items-center gap-1 px-2 py-1 bg-orange-600 text-white text-xs rounded-lg">
                          📹 Viewing
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRequestView(ward._id)}
                          disabled={!isOnline || isRequesting}
                          className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors focus:outline-none focus:ring-1 focus:ring-blue-400"
                          aria-label={`Request camera view from ${ward.username}`}
                        >
                          {isRequesting ? '⏳ Requesting…' : '📹 View'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-gray-800 bg-gray-950">
        <p className="text-gray-600 text-xs text-center">
          Consent required for all remote actions
        </p>
      </div>
    </div>
  );
}
