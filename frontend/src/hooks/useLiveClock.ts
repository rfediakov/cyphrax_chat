import { useEffect, useState } from 'react';
import type { ClockWidgetConfig } from '../types/navbar-widgets';

export interface ClockParts {
  time: string;
  date: string;
  period?: string;
}

function formatClock(now: Date, config: ClockWidgetConfig): ClockParts {
  const tz = config.timezone === 'local' ? undefined : config.timezone;
  const opts: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
    second: config.showSeconds ? '2-digit' : undefined,
    hour12: config.format === '12',
    timeZone: tz,
  };

  const timeFormatter = new Intl.DateTimeFormat(undefined, opts);
  const parts = timeFormatter.formatToParts(now);

  let hour = '';
  let minute = '';
  let second = '';
  let period = '';

  for (const p of parts) {
    if (p.type === 'hour') hour = p.value;
    if (p.type === 'minute') minute = p.value;
    if (p.type === 'second') second = p.value;
    if (p.type === 'dayPeriod') period = p.value;
  }

  const time =
    config.showSeconds && second
      ? `${hour}:${minute}:${second}`
      : `${hour}:${minute}`;

  const date = config.showDate
    ? new Intl.DateTimeFormat(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: tz,
      }).format(now)
    : '';

  return {
    time,
    date,
    period: config.format === '12' && period ? period : undefined,
  };
}

export function useLiveClock(config: ClockWidgetConfig) {
  const [parts, setParts] = useState(() => formatClock(new Date(), config));

  useEffect(() => {
    const tick = () => setParts(formatClock(new Date(), config));
    tick();
    const ms = config.showSeconds ? 1000 : 30_000;
    const id = window.setInterval(tick, ms);
    return () => window.clearInterval(id);
  }, [config.format, config.showSeconds, config.showDate, config.timezone]);

  return parts;
}
