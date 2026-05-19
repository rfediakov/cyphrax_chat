import { getRoomBlueprint } from '../registry';

interface RoomTypeBadgeProps {
  type: string | undefined | null;
  /** When true, only render the icon (more compact for lists). */
  iconOnly?: boolean;
  className?: string;
}

/**
 * Tiny inline pill describing a room's type (Radio Mesh, FM Tuner, …).
 *
 * Falls back gracefully when `type` is missing or unknown — in that case the
 * registry returns the `chat` blueprint and we render a quiet "Chat" badge.
 */
export function RoomTypeBadge({ type, iconOnly = false, className = '' }: RoomTypeBadgeProps) {
  const blueprint = getRoomBlueprint(type);
  const Icon = blueprint.Icon;

  if (iconOnly) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded ${className}`}
        style={{ color: blueprint.accentColor }}
        title={blueprint.label}
        aria-label={blueprint.label}
      >
        <Icon className="w-3.5 h-3.5" />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${className}`}
      style={{
        color: blueprint.accentColor,
        backgroundColor: `${blueprint.accentColor}1f`,
        borderColor: `${blueprint.accentColor}4d`,
        borderWidth: 1,
      }}
      title={blueprint.tagline}
    >
      <Icon className="w-3 h-3" />
      <span>{blueprint.label}</span>
    </span>
  );
}
