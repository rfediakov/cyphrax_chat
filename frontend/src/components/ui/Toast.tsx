import { createContext, useCallback, useContext, useState } from 'react';

export type ToastVariant = 'info' | 'success' | 'error' | 'warning';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  actions?: ToastAction[];
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant, actions?: ToastAction[]) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

let nextId = 1;

const VARIANT_STYLES: Record<ToastVariant, string> = {
  info: 'bg-gray-800 border-gray-600 text-gray-100',
  success: 'bg-gray-800 border-green-600 text-gray-100',
  error: 'bg-gray-800 border-red-600 text-gray-100',
  warning: 'bg-gray-800 border-amber-500 text-gray-100',
};

const ICON: Record<ToastVariant, string> = {
  info: '💬',
  success: '✅',
  error: '❌',
  warning: '⚠️',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info', actions?: ToastAction[]) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, variant, actions }]);
      if (!actions || actions.length === 0) {
        setTimeout(() => dismiss(id), 5000);
      }
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)] pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm animate-fade-in ${VARIANT_STYLES[toast.variant]}`}
          >
            <span className="text-base shrink-0">{ICON[toast.variant]}</span>
            <span className="flex-1 leading-snug">{toast.message}</span>
            {toast.actions && (
              <div className="flex gap-1.5 shrink-0 mt-0.5">
                {toast.actions.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => { action.onClick(); dismiss(toast.id); }}
                    className="text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                  >
                    {action.label}
                  </button>
                ))}
                <button
                  onClick={() => dismiss(toast.id)}
                  className="text-xs px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            )}
            {(!toast.actions || toast.actions.length === 0) && (
              <button
                onClick={() => dismiss(toast.id)}
                className="shrink-0 text-gray-500 hover:text-gray-300 transition-colors"
                aria-label="Dismiss"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
