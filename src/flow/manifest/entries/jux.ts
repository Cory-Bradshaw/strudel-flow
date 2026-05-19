import type { HigherOrderEntry } from '../schema';

/**
 * `.jux(x => x.<subchain>)` — splits the pattern across stereo: left
 * channel is the original, right channel is the original with the
 * sub-chain transforms applied. Classic Tidal pattern modifier.
 *
 * jux is the simplest higher-order Strudel function — no numeric args,
 * just the sub-chain. Strata uses it as the higher-order prototype
 * (STRATA.md §5.4, M2 plan).
 */
export const jux: HigherOrderEntry = {
  id: 'jux',
  label: 'Jux',
  category: 'pattern-modifier',
  method: 'jux',
  kind: 'higher-order',
  subchainLabel: 'modify right channel with',
  inputs: [],
};
