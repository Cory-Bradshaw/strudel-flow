/**
 * Strata core data model — see STRATA.md §4.
 *
 * The Project is the single source of truth on disk and in memory.
 * Strudel code, song expression, and the prelude are always regenerated
 * from these types; they are never stored.
 */

import type { Edge, Node } from '@xyflow/react';

/**
 * Bumped when the on-disk schema changes in a backwards-incompatible way.
 * Layer A and the .strata directory format both stamp this.
 */
export const SCHEMA_VERSION = 1 as const;

/** React Flow graph contents — Strata stores nodes+edges and nothing else. */
export interface FlowGraph {
  nodes: Node[];
  edges: Edge[];
}

export interface Part {
  id: string;
  name: string;
  /** React Flow { nodes, edges } — the Flow-surface source of truth. */
  graph: FlowGraph;
  /**
   * false → goes into arrange/stack; true → full-song mask (STRATA.md §6.3).
   * Defaulted to false at construction.
   */
  phaseContinuous: boolean;
}

export interface Section {
  id: string;
  /** "Intro", "Verse", "Drop". */
  name: string;
  lengthCycles: number;
}

export type TransitionType = 'gain-fade' | 'lpf-sweep' | 'hpf-sweep';

export interface Transition {
  type: TransitionType;
  durationCycles: number;
  from: number;
  to: number;
}

export interface ArrangementCell {
  partId: string;
  sectionId: string;
  active: boolean;
  enter?: Transition;
  exit?: Transition;
}

export interface Arrangement {
  /** Strudel uses cycles-per-second. */
  tempoCps: number;
  /** Section IDs in column order. */
  sectionOrder: string[];
  /** Part IDs in row order. */
  partOrder: string[];
  sections: Section[];
  /** Sparse — only cells the user has touched. */
  cells: ArrangementCell[];
}

export type InstrumentKind = 'builtin' | 'sample';

export interface SampleMapping {
  /** Note name (e.g. "c3", "f#4"). */
  note: string;
  /** Relative path inside instruments/<id>/. */
  file: string;
}

export interface Instrument {
  id: string;
  name: string;
  kind: InstrumentKind;
  /** kind: 'builtin' — a Strudel sound/bank name. */
  builtinName?: string;
  /** kind: 'sample' — multisample map. */
  samples?: SampleMapping[];
  /** Single-sample pitched fallback. */
  baseNote?: string;
  origin?: { tool: 'synthone' | 'other' };
}

export interface Project {
  id: string;
  name: string;
  parts: Part[];
  instruments: Instrument[];
  arrangement: Arrangement;
  schemaVersion: typeof SCHEMA_VERSION;
}
