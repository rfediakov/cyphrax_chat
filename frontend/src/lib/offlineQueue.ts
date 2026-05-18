import { openDB, type IDBPDatabase } from 'idb';

export interface QueuedAction {
  id: string;
  type: string;
  payload: unknown;
  createdAt: number;
  retries: number;
}

const DB_NAME = 'safegroup-offline';
const STORE = 'queue';
const BLOB_STORE = 'blobs';
const MAX_RETRIES = 5;

let dbInstance: IDBPDatabase | null = null;

async function getDB(): Promise<IDBPDatabase> {
  if (!dbInstance) {
    dbInstance = await openDB(DB_NAME, 1, {
      upgrade(db) {
        db.createObjectStore(STORE, { keyPath: 'id' });
        db.createObjectStore(BLOB_STORE);
      },
    });
  }
  return dbInstance;
}

export async function enqueue(
  action: Omit<QueuedAction, 'id' | 'createdAt' | 'retries'>,
): Promise<string> {
  const db = await getDB();
  const id = crypto.randomUUID();
  await db.put(STORE, { ...action, id, createdAt: Date.now(), retries: 0 });
  return id;
}

export async function dequeue(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE, id);
}

export async function getAll(): Promise<QueuedAction[]> {
  const db = await getDB();
  return db.getAll(STORE);
}

export async function flush(
  onAction: (action: QueuedAction) => Promise<void>,
): Promise<{ succeeded: number; failed: number }> {
  const db = await getDB();
  const all = await db.getAll(STORE);
  let succeeded = 0;
  let failed = 0;

  // Sort by createdAt so SOS events (added with priority marker) flush first
  const sorted = [...all].sort((a, b) => {
    const aPriority = a.type === 'sos_trigger' ? -1 : 0;
    const bPriority = b.type === 'sos_trigger' ? -1 : 0;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.createdAt - b.createdAt;
  });

  for (const item of sorted) {
    try {
      await onAction(item);
      await db.delete(STORE, item.id);
      succeeded++;
    } catch {
      const updated = { ...item, retries: item.retries + 1 };
      if (updated.retries >= MAX_RETRIES) {
        // Give up on this item after too many retries
        await db.delete(STORE, item.id);
      } else {
        await db.put(STORE, updated);
      }
      failed++;
    }
  }

  return { succeeded, failed };
}

export async function getQueueSize(): Promise<number> {
  const db = await getDB();
  return db.count(STORE);
}

// Blob storage for offline audio/video message drafts
export async function saveBlob(key: string, blob: Blob): Promise<void> {
  const db = await getDB();
  await db.put(BLOB_STORE, blob, key);
}

export async function getBlob(key: string): Promise<Blob | undefined> {
  const db = await getDB();
  return db.get(BLOB_STORE, key) as Promise<Blob | undefined>;
}

export async function deleteBlob(key: string): Promise<void> {
  const db = await getDB();
  await db.delete(BLOB_STORE, key);
}
