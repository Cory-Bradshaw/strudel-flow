/**
 * Manifest registry — flat lookup of every transform entry.
 *
 * Adding a transform: drop a new entry file in `entries/`, import +
 * include it in `ALL_ENTRIES`. The generic TransformNode and the
 * codegen pick it up automatically (no React component needed).
 */

import { gain } from './entries/gain';
import { jux } from './entries/jux';
import { lpf } from './entries/lpf';
import type { ManifestEntry } from './schema';

export * from './schema';

export const ALL_ENTRIES: readonly ManifestEntry[] = [lpf, gain, jux];

export const MANIFEST: Readonly<Record<string, ManifestEntry>> =
  Object.freeze(
    Object.fromEntries(ALL_ENTRIES.map((entry) => [entry.id, entry]))
  );

/** Returns the manifest entry for an id, or throws if it doesn't exist. */
export function getEntry(id: string): ManifestEntry {
  const entry = MANIFEST[id];
  if (!entry) {
    throw new Error(`Manifest entry not found: ${id}`);
  }
  return entry;
}

/** Group entries by category for the palette/picker UI. */
export function entriesByCategory(): Map<string, ManifestEntry[]> {
  const out = new Map<string, ManifestEntry[]>();
  for (const entry of ALL_ENTRIES) {
    const list = out.get(entry.category) ?? [];
    list.push(entry);
    out.set(entry.category, list);
  }
  return out;
}
