/**
 * Undo/redo on top of the snapshot ring.
 *
 * The ring is the source of truth — this module just tracks a cursor
 * into it. After undo, the cursor moves backward; a new commit truncates
 * everything after the cursor (standard undo/redo semantics).
 *
 * Cursor lives in memory (per session) — undo doesn't survive reload
 * by design. The persistent recovery story is "restore current" + the
 * full ring browsable from the History panel (M5a).
 */

import {
  appendSnapshot,
  getSnapshot,
  listSnapshots,
  type SnapshotMeta,
  truncateAfter,
} from './snapshots';
import type { PersistedState } from './db';

export interface History {
  /** Ordered oldest → newest. */
  entries: SnapshotMeta[];
  /** Index into entries, or -1 if empty. */
  cursor: number;
}

export async function loadHistory(projectId: string): Promise<History> {
  const entries = await listSnapshots(projectId);
  return { entries, cursor: entries.length - 1 };
}

/** Commit a new snapshot; truncate any redo branch. */
export async function commit(
  history: History,
  projectId: string,
  state: PersistedState
): Promise<History> {
  if (history.cursor >= 0 && history.cursor < history.entries.length - 1) {
    const cursorId = history.entries[history.cursor].id;
    await truncateAfter(projectId, cursorId);
  }
  const id = await appendSnapshot(projectId, state);
  const entries = await listSnapshots(projectId);
  const cursor = entries.findIndex((e) => e.id === id);
  return { entries, cursor };
}

export function canUndo(history: History): boolean {
  return history.cursor > 0;
}

export function canRedo(history: History): boolean {
  return history.cursor >= 0 && history.cursor < history.entries.length - 1;
}

/** Move cursor back one and return the state at that snapshot. */
export async function undo(
  history: History
): Promise<{ history: History; state: PersistedState } | null> {
  if (!canUndo(history)) return null;
  const cursor = history.cursor - 1;
  const meta = history.entries[cursor];
  const snap = await getSnapshot(meta.id);
  if (!snap) return null;
  return { history: { ...history, cursor }, state: snap.state };
}

/** Move cursor forward one and return the state at that snapshot. */
export async function redo(
  history: History
): Promise<{ history: History; state: PersistedState } | null> {
  if (!canRedo(history)) return null;
  const cursor = history.cursor + 1;
  const meta = history.entries[cursor];
  const snap = await getSnapshot(meta.id);
  if (!snap) return null;
  return { history: { ...history, cursor }, state: snap.state };
}
