import { useNetworkStore } from '../../store/network.store';

export default function OfflineBanner() {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const queueSize = useNetworkStore((s) => s.queueSize);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-0 left-0 right-0 z-40 flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-amber-950 text-sm font-medium shadow"
      style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
      <span>
        You&apos;re offline
        {queueSize > 0 && (
          <span className="ml-1 font-semibold">
            — {queueSize} action{queueSize !== 1 ? 's' : ''} queued
          </span>
        )}
      </span>
    </div>
  );
}
