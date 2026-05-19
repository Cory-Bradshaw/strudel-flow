/**
 * Function manifest schema — STRATA.md §5.3.
 *
 * One entry per Strudel transform (`.lpf`, `.gain`, `.jux`, ...). The
 * same entry drives both the node UI (controls, ports) and the code
 * generator (method name, arg order, default-elision). Adding a new
 * transform is a single entry; no React component needed.
 *
 * Entries are TypeScript-typed `const` objects so the IDE catches bad
 * shapes at author time. They contain pure data — no functions — so the
 * "data, not code" intent of a JSON manifest is preserved.
 */

/** Free-string category — drives palette grouping in the node picker. */
export type ManifestCategory =
  | 'filter'
  | 'amplitude'
  | 'space'
  | 'distortion'
  | 'modulation'
  | 'time'
  | 'envelope'
  | 'pattern-modifier'
  | 'utility';

export type InputType = 'number' | 'string' | 'boolean' | 'enum';

export type ControlKind =
  /** Continuous numeric control with min/max/step. */
  | 'knob'
  /** Horizontal slider — same data shape as a knob; just a different widget. */
  | 'slider'
  /** Enum picker — uses `options`. */
  | 'dropdown'
  /** Boolean toggle. */
  | 'toggle'
  /** Freeform text input — for `string` types. */
  | 'text';

export interface NumericInput {
  name: string;
  label?: string;
  type: 'number';
  default: number;
  /** Omit the input from the generated code when the value equals the default. */
  defaultElidable?: boolean;
  min?: number;
  max?: number;
  step?: number;
  /** Whether the control can be flipped into a mini-notation pattern. */
  patternable?: boolean;
  control: 'knob' | 'slider';
}

export interface StringInput {
  name: string;
  label?: string;
  type: 'string';
  default: string;
  defaultElidable?: boolean;
  patternable?: boolean;
  control: 'text';
}

export interface BooleanInput {
  name: string;
  label?: string;
  type: 'boolean';
  default: boolean;
  defaultElidable?: boolean;
  control: 'toggle';
}

export interface EnumInput {
  name: string;
  label?: string;
  type: 'enum';
  default: string;
  defaultElidable?: boolean;
  options: readonly string[];
  control: 'dropdown';
}

export type ManifestInput =
  | NumericInput
  | StringInput
  | BooleanInput
  | EnumInput;

export interface ManifestEntryBase {
  /** Unique id — also the React Flow node `data.fn` value. */
  id: string;
  /** Human-friendly label shown in the node header. */
  label: string;
  category: ManifestCategory;
  /** Strudel method name as called on a Pattern (e.g. `lpf`, `jux`). */
  method: string;
  inputs: readonly ManifestInput[];
}

export interface TransformEntry extends ManifestEntryBase {
  kind: 'transform';
}

export interface HigherOrderEntry extends ManifestEntryBase {
  kind: 'higher-order';
  /** Label for the secondary "modify with" sub-chain handle. */
  subchainLabel?: string;
}

export type ManifestEntry = TransformEntry | HigherOrderEntry;

/* ---------- per-input runtime value ---------- */

/**
 * The Flow-time value of a node's input. Three modes:
 *
 * - `constant`: a literal stored locally on the node.
 * - `pattern`: a mini-notation string (only valid when input.patternable).
 * - `wired`: another node feeds this input via a `param-in` edge.
 *
 * Codegen handles the three cases distinctly (§5.6 `emitParam`).
 */
export type InputValue =
  | { mode: 'constant'; value: number | string | boolean }
  | { mode: 'pattern'; pattern: string }
  | { mode: 'wired' };

/** A node's per-input state — what the persistence layer round-trips. */
export type TransformNodeInputs = Record<string, InputValue>;

export interface TransformNodeData {
  /** Manifest id for the entry this node renders. */
  fn: string;
  inputs: TransformNodeInputs;
}
