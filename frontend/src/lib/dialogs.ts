import type { Dialog } from '../store/chat.store';

/** Dialog document id from GET /dialogs (`id` or legacy `_id`). */
export function getDialogRecordId(dialog: Dialog): string {
  return dialog._id ?? dialog.id ?? '';
}

/** The other participant's user id (API uses `otherUser.id`). */
export function getOtherUserId(dialog: Dialog): string | null {
  const u = dialog.otherUser;
  if (!u) return null;
  return u._id ?? u.id ?? null;
}

export function findDialogWithUser(dialogs: Dialog[], userId: string): Dialog | undefined {
  return dialogs.find((d) => {
    if (d.participants?.includes(userId)) return true;
    return getOtherUserId(d) === userId;
  });
}
