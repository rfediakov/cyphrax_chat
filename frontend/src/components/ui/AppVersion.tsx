import { APP_VERSION } from '../../version';

interface AppVersionProps {
  className?: string;
}

/** Displays the full semver from /VERSION (e.g. v2.3.0). */
export function AppVersion({ className = '' }: AppVersionProps) {
  return (
    <span
      className={`shrink-0 font-mono text-[10px] sm:text-xs text-gray-500 tabular-nums ${className}`}
      title={`SafeGroup v${APP_VERSION}`}
    >
      v{APP_VERSION}
    </span>
  );
}
