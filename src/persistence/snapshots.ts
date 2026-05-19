/**
 * Snapshot ring — STRATA.md §8.3.
 *
 * Append-only ring keyed by autoincrement IDs. Old entries past
 * SNAPSHOT_RING_CAP are pruned. Undo/redo navigate by id (M1 spec:
 * "Undo/redo wired onto the snapshot ring").
 *
 * The ring intentionally never deletes the most recent snapshot — even
 * after redo-truncation, the head stays alive so the recovery path
 * always has something to restore.
 */

import {
  getDb,
  type PersistedState,
  type SnapshotRecord,
  SNAPSHOT_RING_CAP,
} from './db';

export interface SnapshotMeta {
  id: number;
  takenAt: number;
}

/** Append a snapshot, prune the oldest if we're past cap. Returns its id. */
export async function appendSnapshot(
  projectId: string,
  state: PersistedState
): Promise<number> {
  const db = await getDb();
  const tx = db.transaction('snapshots', 'readwrite');
  const store = tx.objectStore('snapshots');
  const id = (await store.add({
    projectId,
    takenAt: Date.now(),
    state,
  } as SnapshotRecord)) as number;

  const all = await store.index('by-project').getAllKeys(projectId);
  if (all.length > SNAPSHOT_RING_CAP) {
    const surplus = all.length - SNAPSHOT_RING_CAP;
    for (let i = 0; i < surplus; i++) {
      await store.delete(all[i]);
    }
  }

  await tx.done;
  return id;
}

/** All snapshot metadata for a project, oldest → newest. */
export async function listSnapshots(
  projectId: string
): Promise<SnapshotMeta[]> {
  const db = await getDb();
  const records = await db.getAllFromIndex(
    'snapshots',
    'by-project',
    projectId
  );
  return records.map((r) => ({ id: r.id!, takenAt: r.takenAt }));
}

export async function getSnapshot(id: number): Promise<SnapshotRecord | null> {
  const db = await getDb();
  const record = await db.get('snapshots', id);
  return record ?? null;
}

/**
 * Trim every snapshot after `id` for this project. Called when the user
 * makes an edit after undoing — that branch is gone, standard undo/redo
 * semantics.
 */
export async function truncateAfter(
  projectId: string,
  id: number
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('snapshots', 'readwrite');
  const store = tx.objectStore('snapshots');
  const keys = await store.index('by-project').getAllKeys(projectId);
  for (const k of keys) {
    if (k > id) await store.delete(k);
  }
  await tx.done;
}
