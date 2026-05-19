/**
 * IndexedDB connection for Strata's Layer A persistence — STRATA.md §8.3.
 *
 * Three object stores: `current` (latest committed state per project),
 * `snapshots` (the ring that undo/redo and recovery traverse), `meta`
 * (small key/value: snapshot cursor, settings).
 *
 * The DB name is intentionally generic so future milestones (M5a folder
 * sync) can write the same schema to OPFS or a real filesystem.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export const DB_NAME = 'strata';
export const DB_VERSION = 1;

export const SNAPSHOT_RING_CAP = 50;

/** What we persist for a project — narrower than the live Zustand store. */
export interface PersistedState {
  nodes: unknown[];
  edges: unknown[];
  theme: string;
  /** React Flow's ColorMode union — 'light' | 'dark' | 'system'. */
  colorMode: 'light' | 'dark' | 'system';
  cpm: string;
  bpc: string;
}

export interface CurrentRecord {
  projectId: string;
  state: PersistedState;
  savedAt: number;
}

export interface SnapshotRecord {
  /** Auto-incremented primary key. */
  id?: number;
  projectId: string;
  takenAt: number;
  state: PersistedState;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

interface StrataSchema extends DBSchema {
  current: {
    key: string;
    value: CurrentRecord;
  };
  snapshots: {
    key: number;
    value: SnapshotRecord;
    indexes: { 'by-project': string };
  };
  meta: {
    key: string;
    value: MetaRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<StrataSchema>> | null = null;

export function getDb(): Promise<IDBPDatabase<StrataSchema>> {
  if (!dbPromise) {
    dbPromise = openDB<StrataSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('current')) {
          db.createObjectStore('current', { keyPath: 'projectId' });
        }
        if (!db.objectStoreNames.contains('snapshots')) {
          const store = db.createObjectStore('snapshots', {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('by-project', 'projectId');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

/** Test-seam — never used in production. */
export function _resetDbPromiseForTests() {
  dbPromise = null;
}
