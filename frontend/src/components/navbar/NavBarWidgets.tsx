import { Link } from 'react-router-dom';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import {
  selectEnabledWidgets,
  useNavbarWidgetsStore,
} from '../../store/navbar-widgets.store';
import { ClockWidget } from './ClockWidget';
import { WeatherWidget } from './WeatherWidget';

export function NavBarWidgets() {
  const widgets = useNavbarWidgetsStore((s) => s.widgets);
  const enabled = selectEnabledWidgets(widgets);
  const compact = useMediaQuery('(max-width: 767px)');

  if (enabled.length === 0) return null;

  return (
    <div
      className="nav-widgets flex items-center gap-1 shrink-0 max-w-[min(38vw,200px)] sm:max-w-[min(42vw,280px)] sm:gap-1.5 overflow-hidden"
      aria-label="Navbar widgets"
    >
      {enabled.map((widget) => (
        <WidgetRenderer key={widget.id} widget={widget} compact={compact} />
      ))}
    </div>
  );
}

function WidgetRenderer({
  widget,
  compact,
}: {
  widget: ReturnType<typeof selectEnabledWidgets>[number];
  compact: boolean;
}) {
  if (widget.type === 'clock') {
    return <ClockWidget config={widget.config} compact={compact} />;
  }
  return <WeatherWidget config={widget.config} compact={compact} />;
}

/** Shown when no widgets are configured — subtle nudge on larger screens */
export function NavBarWidgetsEmptyHint() {
  const count = useNavbarWidgetsStore((s) => s.widgets.length);
  if (count > 0) return null;

  return (
    <Link
      to="/settings"
      state={{ tab: 'display' }}
      className="hidden md:flex items-center gap-1 text-[10px] text-gray-500 hover:text-cyan-400/90 transition-colors shrink-0 px-2 py-1 rounded-lg border border-dashed border-gray-700/80 hover:border-cyan-500/40"
    >
      <span aria-hidden>✦</span>
      <span>Add clock & weather</span>
    </Link>
  );
}
