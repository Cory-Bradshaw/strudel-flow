/**
 * Project construction helpers — small factories so the rest of the app
 * never has to remember required fields or the schema version.
 */

import { nanoid } from 'nanoid';

import {
  type Arrangement,
  type Part,
  type Project,
  type Section,
  SCHEMA_VERSION,
} from './types';

/** Default tempo: 120 bpm at 4 beats/cycle = 0.5 cycles/sec. */
const DEFAULT_TEMPO_CPS = 0.5;

export function createPart(name = 'Untitled Part'): Part {
  return {
    id: nanoid(),
    name,
    graph: { nodes: [], edges: [] },
    phaseContinuous: false,
  };
}

export function createSection(name = 'Section', lengthCycles = 8): Section {
  return { id: nanoid(), name, lengthCycles };
}

export function createArrangement(): Arrangement {
  const intro = createSection('Intro', 4);
  return {
    tempoCps: DEFAULT_TEMPO_CPS,
    sectionOrder: [intro.id],
    partOrder: [],
    sections: [intro],
    cells: [],
  };
}

export function createProject(name = 'Untitled Project'): Project {
  return {
    id: nanoid(),
    name,
    parts: [],
    instruments: [],
    arrangement: createArrangement(),
    schemaVersion: SCHEMA_VERSION,
  };
}
