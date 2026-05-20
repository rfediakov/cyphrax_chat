import type { RoomType } from '../RoomBlueprint';
import { listAllBlueprints } from '../registry';

interface RoomTypePickerProps {
  value: RoomType;
  onChange: (type: RoomType) => void;
}

/**
 * Grid-of-tiles type picker used in the Create-Room modal.
 *
 * - Selected tile gets a coloured accent border.
 * - Unavailable types (no widget yet) are shown but disabled — they still
 *   communicate the platform vision without letting users accidentally create
 *   a non-functional room.
 */
export function RoomTypePicker({ value, onChange }: RoomTypePickerProps) {
  const blueprints = listAllBlueprints();

  return (
    <div className="grid grid-cols-3 gap-1.5">
      {blueprints.map((bp) => {
        const Icon = bp.Icon;
        const selected = bp.type === value;
        const disabled = !bp.available;
        return (
          <button
            key={bp.type}
            type="button"
            disabled={disabled}
            onClick={() => onChange(bp.type)}
            title={disabled ? `${bp.label} — coming soon` : bp.tagline}
            aria-pressed={selected}
            className={`
              flex flex-col items-center justify-center gap-1 p-2 rounded-lg border text-[10px] font-medium
              transition-colors min-h-[64px] text-center leading-tight
              ${selected
                ? 'bg-gray-700 border-current'
                : 'bg-gray-800 border-gray-700 hover:border-gray-500'}
              ${disabled ? 'opacity-40 cursor-not-allowed hover:border-gray-700' : ''}
            `}
            style={{ color: selected ? bp.accentColor : '#cbd5e1' }}
          >
            <Icon className="w-5 h-5" />
            <span className="truncate w-full">{bp.label}</span>
          </button>
        );
      })}
    </div>
  );
}
