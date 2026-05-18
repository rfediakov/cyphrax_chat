import webpush from 'web-push';
import { config } from '../config.js';
import { PushSubscription } from '../models/pushSubscription.model.js';
import type { Types } from 'mongoose';

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

let vapidConfigured = false;

function ensureVapidConfigured(): void {
  if (vapidConfigured) return;
  if (!config.vapidPublicKey || !config.vapidPrivateKey) {
    console.warn('[Push] VAPID keys not set — push notifications disabled. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env');
    return;
  }
  webpush.setVapidDetails(config.vapidContact, config.vapidPublicKey, config.vapidPrivateKey);
  vapidConfigured = true;
}

export async function sendPushToUser(
  userId: Types.ObjectId | string,
  payload: PushPayload,
): Promise<void> {
  ensureVapidConfigured();
  if (!vapidConfigured) return;

  const subscriptions = await PushSubscription.find({ userId });
  if (subscriptions.length === 0) return;

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    icon: payload.icon ?? '/icons/pwa-192.png',
    badge: payload.badge ?? '/icons/pwa-192.png',
    tag: payload.tag,
    data: payload.data,
  });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        body,
      ),
    ),
  );

  // Remove subscriptions that returned 410 Gone (unsubscribed by browser)
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      const err = result.reason as { statusCode?: number };
      if (err?.statusCode === 410) {
        await PushSubscription.deleteOne({ _id: subscriptions[i]._id });
      }
    }
  }
}

export async function sendPushToMany(
  userIds: Array<Types.ObjectId | string>,
  payload: PushPayload,
): Promise<void> {
  await Promise.allSettled(userIds.map((uid) => sendPushToUser(uid, payload)));
}

export function getVapidPublicKey(): string {
  return config.vapidPublicKey;
}
