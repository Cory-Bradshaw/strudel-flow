/**
 * Golden codegen tests — one per manifest entry, plus structural cases.
 * Per STRATA.md M2: "one per manifest entry" is the regression net that
 * lets the manifest grow safely.
 */

import { describe, expect, it } from 'vitest';
import type { Edge, Node } from '@xyflow/react';

import {
  emitFromNode,
  emitPart,
  PATTERN_IN,
  SUBCHAIN_IN,
} from './codegen';

function transformNode(
  id: string,
  fn: string,
  inputs: Record<string, unknown> = {}
): Node {
  return {
    id,
    type: 'transform',
    position: { x: 0, y: 0 },
    data: { fn, inputs },
  };
}

function sourceStub(id: string, expr: string): Node {
  return {
    id,
    type: 'source-stub',
    position: { x: 0, y: 0 },
    data: { expr },
  };
}

function patternEdge(id: string, source: string, target: string): Edge {
  return { id, source, target, targetHandle: PATTERN_IN };
}

function subchainEdge(id: string, source: string, target: string): Edge {
  return { id, source, target, targetHandle: SUBCHAIN_IN };
}

const sourceEmitter = (node: Node) =>
  (node.data as { expr?: string }).expr ?? null;

describe('codegen — lpf', () => {
  it('elides the default cutoff', () => {
    const node = transformNode('a', 'lpf', {
      cutoff: { mode: 'constant', value: 1000 },
    });
    expect(emitFromNode('a', { nodes: [node], edges: [] })).toBe('.lpf()');
  });

  it('emits a non-default constant', () => {
    const node = transformNode('a', 'lpf', {
      cutoff: { mode: 'constant', value: 400 },
    });
    expect(emitFromNode('a', { nodes: [node], edges: [] })).toBe('.lpf(400)');
  });

  it('quotes a pattern-mode value', () => {
    const node = transformNode('a', 'lpf', {
      cutoff: { mode: 'pattern', pattern: '200 800 1600' },
    });
    expect(emitFromNode('a', { nodes: [node], edges: [] })).toBe(
      '.lpf("200 800 1600")'
    );
  });

  it('attaches to an upstream source', () => {
    const src = sourceStub('s', 's("bd sd")');
    const node = transformNode('a', 'lpf', {
      cutoff: { mode: 'constant', value: 800 },
    });
    expect(
      emitFromNode(
        'a',
        { nodes: [src, node], edges: [patternEdge('e', 's', 'a')] },
        { sourceEmitter }
      )
    ).toBe('s("bd sd").lpf(800)');
  });
});

describe('codegen — gain', () => {
  it('elides the default gain of 1', () => {
    const node = transformNode('a', 'gain', {
      gain: { mode: 'constant', value: 1 },
    });
    expect(emitFromNode('a', { nodes: [node], edges: [] })).toBe('.gain()');
  });

  it('emits a fractional gain', () => {
    const node = transformNode('a', 'gain', {
      gain: { mode: 'constant', value: 0.8 },
    });
    expect(emitFromNode('a', { nodes: [node], edges: [] })).toBe('.gain(0.8)');
  });
});

describe('codegen — jux (higher-order)', () => {
  it('emits `x => x` with an empty sub-chain', () => {
    const node = transformNode('a', 'jux');
    expect(emitFromNode('a', { nodes: [node], edges: [] })).toBe(
      '.jux(x => x)'
    );
  });

  it('emits a one-transform sub-chain', () => {
    const j = transformNode('j', 'jux');
    const rev = transformNode('r', 'lpf', {
      cutoff: { mode: 'constant', value: 400 },
    });
    expect(
      emitFromNode('j', {
        nodes: [j, rev],
        edges: [subchainEdge('e', 'r', 'j')],
      })
    ).toBe('.jux(x => x.lpf(400))');
  });

  it('emits a two-transform sub-chain (linear)', () => {
    const j = transformNode('j', 'jux');
    const lpf = transformNode('l', 'lpf', {
      cutoff: { mode: 'constant', value: 400 },
    });
    const gain = transformNode('g', 'gain', {
      gain: { mode: 'constant', value: 0.5 },
    });
    expect(
      emitFromNode('j', {
        nodes: [j, lpf, gain],
        edges: [
          subchainEdge('e1', 'l', 'j'),
          patternEdge('e2', 'l', 'g'),
        ],
      })
    ).toBe('.jux(x => x.lpf(400).gain(0.5))');
  });

  it('composes on an upstream source', () => {
    const src = sourceStub('s', 's("bd sd")');
    const j = transformNode('j', 'jux');
    const lpf = transformNode('l', 'lpf', {
      cutoff: { mode: 'constant', value: 400 },
    });
    expect(
      emitFromNode(
        'j',
        {
          nodes: [src, j, lpf],
          edges: [
            patternEdge('e1', 's', 'j'),
            subchainEdge('e2', 'l', 'j'),
          ],
        },
        { sourceEmitter }
      )
    ).toBe('s("bd sd").jux(x => x.lpf(400))');
  });
});

describe('codegen — graph structure', () => {
  it('stacks multiple pattern-in upstreams', () => {
    const a = sourceStub('a', 's("bd sd")');
    const b = sourceStub('b', 'note("c2 g2")');
    const gain = transformNode('g', 'gain', {
      gain: { mode: 'constant', value: 0.5 },
    });
    expect(
      emitFromNode(
        'g',
        {
          nodes: [a, b, gain],
          edges: [patternEdge('e1', 'a', 'g'), patternEdge('e2', 'b', 'g')],
        },
        { sourceEmitter }
      )
    ).toBe('stack(s("bd sd"), note("c2 g2")).gain(0.5)');
  });

  it('emitPart finds the terminal automatically', () => {
    const src = sourceStub('s', 's("bd sd")');
    const lpf = transformNode('l', 'lpf', {
      cutoff: { mode: 'constant', value: 400 },
    });
    const gain = transformNode('g', 'gain', {
      gain: { mode: 'constant', value: 0.5 },
    });
    const code = emitPart(
      {
        nodes: [src, lpf, gain],
        edges: [patternEdge('e1', 's', 'l'), patternEdge('e2', 'l', 'g')],
      },
      { sourceEmitter }
    );
    expect(code).toBe('s("bd sd").lpf(400).gain(0.5)');
  });

  it('returns empty string for an empty graph', () => {
    expect(emitPart({ nodes: [], edges: [] })).toBe('');
  });

  it('throws on a cycle', () => {
    const a = transformNode('a', 'gain', {
      gain: { mode: 'constant', value: 0.5 },
    });
    const b = transformNode('b', 'lpf', {
      cutoff: { mode: 'constant', value: 400 },
    });
    expect(() =>
      emitFromNode('a', {
        nodes: [a, b],
        edges: [patternEdge('e1', 'a', 'b'), patternEdge('e2', 'b', 'a')],
      })
    ).toThrow(/Cycle/);
  });
});
