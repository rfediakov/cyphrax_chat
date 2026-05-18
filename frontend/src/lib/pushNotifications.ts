import api from '../api/axios';

export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission === 'granted') return 'granted';
  return Notification.requestPermission();
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

export async function subscribePush(vapidPublicKey: string): Promise<boolean> {
  if (!isPushSupported()) return false;

  const permission = await requestPermission();
  if (permission !== 'granted') return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      // Already subscribed — ensure server has this subscription
      await syncSubscriptionWithServer(existing);
      return true;
    }

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });

    await syncSubscriptionWithServer(subscription);
    return true;
  } catch (err) {
    console.error('[Push] Subscribe failed:', err);
    return false;
  }
}

async function syncSubscriptionWithServer(subscription: PushSubscription): Promise<void> {
  const json = subscription.toJSON();
  await api.post('/push/subscribe', {
    endpoint: json.endpoint,
    keys: json.keys,
    userAgent: navigator.userAgent,
  });
}

export async function unsubscribePush(): Promise<void> {
  if (!isPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await subscription.unsubscribe();
      await api.delete('/push/subscribe');
    }
  } catch (err) {
    console.error('[Push] Unsubscribe failed:', err);
  }
}

/** Show an in-app notification when the app is in the foreground */
export function showLocalNotification(title: string, body: string, icon = '/icons/pwa-192.png'): void {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  // If the page is visible, use a toast instead of OS notification (handled by caller)
  if (!document.hidden) return;

  void navigator.serviceWorker.ready.then((reg) => {
    void reg.showNotification(title, {
      body,
      icon,
      badge: '/icons/pwa-192.png',
    });
  });
}
