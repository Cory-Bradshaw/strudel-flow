import { describe, expect, it } from 'vitest';

import { createProject } from './project';
import { SCHEMA_VERSION } from './types';

describe('model — Project construction', () => {
  it('stamps the current schema version', () => {
    const p = createProject('Test');
    expect(p.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('seeds with one section and no parts', () => {
    const p = createProject();
    expect(p.parts).toEqual([]);
    expect(p.arrangement.sections).toHaveLength(1);
    expect(p.arrangement.sectionOrder).toHaveLength(1);
    expect(p.arrangement.sectionOrder[0]).toBe(
      p.arrangement.sections[0].id
    );
  });

  it('gives unique ids on each call', () => {
    const a = createProject();
    const b = createProject();
    expect(a.id).not.toBe(b.id);
  });
});
