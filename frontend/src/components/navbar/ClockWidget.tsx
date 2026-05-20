import type { ClockWidgetConfig } from '../../types/navbar-widgets';
import { useLiveClock } from '../../hooks/useLiveClock';

interface ClockWidgetProps {
  config: ClockWidgetConfig;
  compact?: boolean;
}

export function ClockWidget({ config, compact }: ClockWidgetProps) {
  const { time, date, period } = useLiveClock(config);

  return (
    <div
      className={`nav-widget nav-widget--clock ${compact ? 'nav-widget--compact' : ''}`}
      aria-label={`Current time ${time}${period ? ` ${period}` : ''}`}
    >
      <span className="nav-widget__clock-icon" aria-hidden>
        <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
          <path
            d="M12 7v5l3 2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="nav-widget__clock-body">
        <span className="nav-widget__clock-time">
          <span className="nav-widget__digits">{time}</span>
          {period && <span className="nav-widget__period">{period}</span>}
        </span>
        {!compact && date && (
          <span className="nav-widget__clock-date">{date}</span>
        )}
      </span>
    </div>
  );
}
