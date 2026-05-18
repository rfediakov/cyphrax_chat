import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'pwa-install-dismissed';

export default function InstallBanner() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if previously dismissed
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // Don't show if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setPromptEvent(null);
  };

  const handleDismiss = () => {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, '1');
  };

  if (!visible) return null;

  return (
    <div
      role="banner"
      className="fixed top-0 left-0 right-0 z-50 flex items-center gap-3 bg-blue-800 px-4 py-3 text-white shadow-lg"
      style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
    >
      <img src="/icons/pwa-192.png" alt="SafeGroup" className="h-8 w-8 rounded-lg flex-shrink-0" />
      <p className="flex-1 text-sm font-medium leading-tight">
        Install <span className="font-bold">SafeGroup</span> for offline access and push notifications
      </p>
      <button
        onClick={handleInstall}
        className="rounded-md bg-white px-3 py-1.5 text-sm font-semibold text-blue-800 hover:bg-blue-50 active:scale-95 transition-transform flex-shrink-0"
        aria-label="Install SafeGroup app"
      >
        Install
      </button>
      <button
        onClick={handleDismiss}
        className="ml-1 rounded-md p-1.5 hover:bg-blue-700 active:scale-95 transition-transform flex-shrink-0"
        aria-label="Dismiss install prompt"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
    </div>
  );
}
