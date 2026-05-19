import type { RoomBlueprint, RoomComponentProps } from '../RoomBlueprint';
import { RadioMeshIcon } from '../icons';
import { RadioComposer } from '../composers/RadioComposer';
import { RadioModemPanel } from '../widgets/RadioModemPanel';
import { useMeshRouter } from '../../hooks/useMeshRouter';

/**
 * Real `radio_mesh` blueprint — overrides the metadata-only placeholder
 * registered in `placeholderBlueprints.ts`. Registration happens via the
 * module side-effect in `index.ts`.
 */

function RadioNowStrip({ roomId }: RoomComponentProps) {
  const { audioState, audioTransport } = useMeshRouter(roomId);
  const mode = audioTransport?.getMode().id ?? 'bfsk300';

  const stateLabel = (() => {
    switch (audioState) {
      case 'transmitting':
        return 'TX';
      case 'listening':
        return 'RX';
      case 'error':
        return 'Error';
      default:
        return 'Idle';
    }
  })();

  const stateColor = (() => {
    switch (audioState) {
      case 'transmitting':
        return 'text-red-300 border-red-500/50 bg-red-900/30';
      case 'listening':
        return 'text-green-300 border-green-500/50 bg-green-900/30';
      case 'error':
        return 'text-red-300 border-red-700/50 bg-red-950/30';
      default:
        return 'text-gray-300 border-gray-700 bg-gray-800/40';
    }
  })();

  return (
    <div className="shrink-0 border-b border-amber-500/30 bg-gray-800/60 px-3 py-1.5 text-[11px] text-gray-200 flex items-center gap-2 overflow-x-auto">
      <span className="text-amber-400" aria-hidden="true">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="2" />
          <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M20.49 4.93a10 10 0 0 1 0 14.14M3.51 19.07a10 10 0 0 1 0-14.14" />
        </svg>
      </span>
      <span className="font-semibold uppercase tracking-wide text-amber-300">{mode}</span>
      <span className="text-gray-500">·</span>
      <span
        role="status"
        aria-live="polite"
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium uppercase ${stateColor}`}
      >
        {stateLabel}
      </span>
      <span className="text-gray-500 hidden sm:inline">·</span>
      <span className="text-gray-400 hidden sm:inline truncate">
        Audio modem · plug a radio into the 3.5 mm jack to bridge.
      </span>
    </div>
  );
}

export const realRadioMeshBlueprint: RoomBlueprint = {
  type: 'radio_mesh',
  label: 'Radio Mesh',
  tagline: 'Talk over AM/FM/sub-GHz via the in-app audio modem.',
  Icon: RadioMeshIcon,
  NowStrip: RadioNowStrip,
  widgets: [RadioModemPanel],
  Composer: RadioComposer,
  defaultConfig: { defaultMode: 'bfsk300', encrypted: false, keyTailMs: 250 },
  accentColor: '#f59e0b',
  available: true,
};
