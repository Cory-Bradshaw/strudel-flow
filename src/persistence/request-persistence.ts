/**
 * Eviction protection — STRATA.md §8.3.
 *
 * "navigator.storage.persist() in M1 is mandatory — it IS the original
 * 'lost work' bug." This module asks the browser to make our storage
 * non-evictable and reports back what it got.
 *
 * No throw on failure: Layer A still functions without persistence
 * grant, the user just sees a different "storage protected: no" indicator.
 */

export type PersistenceState =
  | { supported: false }
  | { supported: true; granted: boolean };

export async function requestPersistence(): Promise<PersistenceState> {
  if (!navigator.storage?.persist) {
    return { supported: false };
  }
  const already = await navigator.storage.persisted();
  if (already) return { supported: true, granted: true };
  const granted = await navigator.storage.persist();
  return { supported: true, granted };
}
