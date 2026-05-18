interface BatteryIndicatorProps {
  level: number | null | undefined;
  charging: boolean | null | undefined;
  /** Display size — defaults to 'md' */
  size?: 'sm' | 'md';
}

function levelColor(level: number): string {
  if (level > 0.5) return 'bg-green-500';
  if (level > 0.2) return 'bg-amber-400';
  return 'bg-red-500';
}

/**
 * Battery indicator showing fill level, charging bolt, and colour states.
 *
 * Colors:
 *  - green  > 50 %
 *  - amber  20 – 50 %
 *  - red    < 20 %
 *
 * Renders "?" when the Battery Status API is unavailable.
 */
export default function BatteryIndicator({ level, charging, size = 'md' }: BatteryIndicatorProps) {
  const isSm = size === 'sm';
  const pct = level != null ? Math.round(level * 100) : null;

  // Dimensions
  const bodyW = isSm ? 'w-5' : 'w-7';
  const bodyH = isSm ? 'h-2.5' : 'h-3.5';
  const nubW = isSm ? 'w-0.5' : 'w-1';
  const nubH = isSm ? 'h-1.5' : 'h-2';
  const labelText = isSm ? 'text-[9px]' : 'text-[10px]';

  if (pct === null) {
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-gray-400 ${labelText} font-medium`}
        title="Battery status unavailable"
      >
        <svg
          className={isSm ? 'w-4 h-2.5' : 'w-5 h-3.5'}
          viewBox="0 0 20 12"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <rect x="1" y="1" width="16" height="10" rx="2" />
          <rect x="17" y="3.5" width="2" height="5" rx="0.5" fill="currentColor" stroke="none" />
        </svg>
        ?
      </span>
    );
  }

  const fillColor = levelColor(level!);
  const fillWidth = `${Math.max(2, pct)}%`;

  return (
    <span
      className={`inline-flex items-center gap-1 ${labelText} font-medium`}
      title={`Battery: ${pct}%${charging ? ' (charging)' : ''}`}
    >
      {/* Battery shell */}
      <span className="relative inline-flex items-center">
        <span className={`relative ${bodyW} ${bodyH} rounded-sm border border-gray-400 overflow-hidden`}>
          {/* Fill bar */}
          <span
            className={`absolute inset-y-0 left-0 ${fillColor} transition-all duration-500`}
            style={{ width: fillWidth }}
          />
          {/* Charging bolt overlay */}
          {charging && (
            <span className="absolute inset-0 flex items-center justify-center text-white z-10 leading-none">
              <svg viewBox="0 0 10 14" className={isSm ? 'w-2 h-2.5' : 'w-2.5 h-3'} fill="currentColor">
                <path d="M6.5 0L1 8h4l-1.5 6L9 6H5L6.5 0z" />
              </svg>
            </span>
          )}
        </span>
        {/* Nub */}
        <span className={`${nubW} ${nubH} rounded-r-sm bg-gray-400`} />
      </span>

      {/* Percentage label */}
      <span className={pct <= 20 ? 'text-red-400' : pct <= 50 ? 'text-amber-400' : 'text-green-400'}>
        {pct}%
      </span>
    </span>
  );
}
