import { useEffect, useState } from 'react';

/**
 * First-launch disclaimer for `radio_mesh` rooms (§5.3 of the plan).
 *
 *   "You are responsible for complying with your local radio regulations.
 *    SafeGroup does not transmit RF — it only modulates audio you choose
 *    to route to a radio. Operate at your own risk."
 *
 * The acknowledgement is persisted in `localStorage` under
 * `safegroup:radio:disclaimerAccepted`. Once accepted on a given device the
 * modal never shows again (clear the key from devtools to retest).
 */

const STORAGE_KEY = 'safegroup:radio:disclaimerAccepted';

export const DISCLAIMER_TEXT =
  'You are responsible for complying with your local radio regulations. ' +
  'SafeGroup does not transmit RF — it only modulates audio you choose to ' +
  'route to a radio. Operate at your own risk.';

export function hasAcceptedRadioDisclaimer(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function acceptRadioDisclaimer(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, 'true');
  } catch {
    // ignore — private browsing, storage quota, etc.
  }
}

interface RadioDisclaimerModalProps {
  /** Whether the room is currently active. Modal shows the first time per device. */
  active: boolean;
  /** Optional override: force the modal open for re-display. */
  forceOpen?: boolean;
  /** Optional callback fired after the user accepts. */
  onAccept?: () => void;
}

export function RadioDisclaimerModal({
  active,
  forceOpen = false,
  onAccept,
}: RadioDisclaimerModalProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!active) {
      setOpen(false);
      return;
    }
    if (forceOpen) {
      setOpen(true);
      return;
    }
    setOpen(!hasAcceptedRadioDisclaimer());
  }, [active, forceOpen]);

  if (!open) return null;

  const handleAccept = () => {
    acceptRadioDisclaimer();
    setOpen(false);
    onAccept?.();
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="radio-disclaimer-title"
    >
      <div className="w-full max-w-sm rounded-2xl border border-amber-500/40 bg-gray-900 p-5 shadow-2xl">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/40 flex items-center justify-center text-amber-400">
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m0 3.75h.008v.008H12V16.5zm-9 0a9 9 0 1118 0 9 9 0 01-18 0z"
              />
            </svg>
          </div>
          <h2 id="radio-disclaimer-title" className="text-base font-semibold text-white">
            Before you key the radio
          </h2>
        </div>

        <p className="text-sm leading-relaxed text-gray-300 mb-5">{DISCLAIMER_TEXT}</p>

        <button
          type="button"
          onClick={handleAccept}
          className="w-full rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-gray-900 font-semibold py-2.5 text-sm transition-colors"
        >
          I understand
        </button>
      </div>
    </div>
  );
}
