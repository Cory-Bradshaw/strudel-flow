/**
 * `current` store — the latest committed state per project.
 *
 * On launch we read this to restore the working state. Layer A's job is
 * "never lose work"; this is the entry point.
 */

import { getDb, type CurrentRecord, type PersistedState } from './db';

export async function saveCurrent(
  projectId: string,
  state: PersistedState
): Promise<void> {
  const db = await getDb();
  await db.put('current', {
    projectId,
    state,
    savedAt: Date.now(),
  } satisfies CurrentRecord);
}

export async function loadCurrent(
  projectId: string
): Promise<CurrentRecord | null> {
  const db = await getDb();
  const record = await db.get('current', projectId);
  return record ?? null;
}
