/**
 * Manifest-driven graph → Strudel code generator — STRATA.md §5.6.
 *
 * Traverses a React Flow graph from the terminal node (the unconnected
 * `pattern-out`) and emits a Strudel pattern expression. Replaces the
 * inherited `src/lib/strudel.ts` codegen, which ignored edge direction
 * for effects and hard-coded one component per transform.
 *
 * Source-node handling is deferred — the tier-1 composite source nodes
 * (Pad, Beat Machine, etc.) inherited from strudel-flow are not yet
 * wired into the manifest. Callers can pass a `sourceEmitter` to bridge
 * them in. For pure transform chains (M2 testing), the upstream side is
 * omitted and the receiver-less fragment `.lpf(800)` is emitted — still
 * a valid Strudel composition target.
 */

import type { Edge, Node } from '@xyflow/react';

import {
  getEntry,
  type InputValue,
  type ManifestEntry,
  type ManifestInput,
  type TransformNodeData,
} from '../manifest';

export const PATTERN_IN = 'pattern-in';
export const PATTERN_OUT = 'pattern-out';
export const SUBCHAIN_IN = 'subchain-in';

export interface CodegenGraph {
  nodes: Node[];
  edges: Edge[];
}

export interface CodegenOptions {
  /**
   * Resolves a non-manifest node (e.g. a tier-1 composite source) to its
   * Strudel expression. If a node's type isn't a manifest id, the
   * generator consults this. Returning null skips the node.
   */
  sourceEmitter?: (node: Node) => string | null;
}

interface Ctx {
  graph: CodegenGraph;
  opts: CodegenOptions;
  visiting: Set<string>;
}

function nodeById(graph: CodegenGraph, id: string): Node | undefined {
  return graph.nodes.find((n) => n.id === id);
}

function incoming(
  graph: CodegenGraph,
  nodeId: string,
  handle: string
): Edge[] {
  return graph.edges.filter(
    (e) =>
      e.target === nodeId &&
      // Treat null/undefined targetHandle as pattern-in (the default).
      (e.targetHandle === handle ||
        (handle === PATTERN_IN && (e.targetHandle == null)))
  );
}

function outgoing(graph: CodegenGraph, nodeId: string): Edge[] {
  return graph.edges.filter((e) => e.source === nodeId);
}

function isManifestNode(node: Node): boolean {
  const data = node.data as unknown as Partial<TransformNodeData> | undefined;
  return typeof data?.fn === 'string';
}

function getManifestEntry(node: Node): ManifestEntry {
  const data = node.data as unknown as TransformNodeData;
  return getEntry(data.fn);
}

function emitLiteral(value: number | string | boolean): string {
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

function emitParam(
  node: Node,
  input: ManifestInput,
  ctx: Ctx
): string | null {
  // Wired param? (a separate edge to a param-in handle).
  const wired = incoming(ctx.graph, node.id, `param:${input.name}`);
  if (wired.length > 0) {
    return emit(wired[0].source, ctx);
  }

  const data = node.data as unknown as TransformNodeData;
  const value: InputValue | undefined = data.inputs?.[input.name];

  if (!value) {
    if (input.defaultElidable) return null;
    return emitLiteral(input.default);
  }

  if (value.mode === 'pattern') {
    return JSON.stringify(value.pattern);
  }

  if (value.mode === 'constant') {
    if (input.defaultElidable && value.value === input.default) return null;
    return emitLiteral(value.value);
  }

  // `wired` mode with no matching edge — treat as default.
  if (input.defaultElidable) return null;
  return emitLiteral(input.default);
}

/**
 * Walk a sub-chain (the "modify with" branch of a higher-order node).
 * Sub-chains are linear: each transform feeds the next; no stacks. The
 * result is appended as `.m1(...).m2(...)...`.
 */
function emitSubchain(startId: string, ctx: Ctx): string {
  let parts: string[] = [];
  let cur: string | null = startId;
  const guard = new Set<string>();
  while (cur) {
    if (guard.has(cur)) {
      throw new Error(`Cycle in sub-chain at node ${cur}`);
    }
    guard.add(cur);
    const node = nodeById(ctx.graph, cur);
    if (!node) break;
    if (!isManifestNode(node)) {
      throw new Error(
        `Sub-chains may only contain manifest transforms, got node ${node.id}`
      );
    }
    const entry = getManifestEntry(node);
    const args = entry.inputs
      .map((input) => emitParam(node, input, ctx))
      .filter((a): a is string => a !== null);
    if (entry.kind === 'higher-order') {
      const subEdge = incoming(ctx.graph, node.id, SUBCHAIN_IN)[0];
      const subCode = subEdge ? emitSubchain(subEdge.source, ctx) : '';
      args.push(`x => x${subCode}`);
    }
    parts.push(`.${entry.method}(${args.join(', ')})`);

    // Follow the single pattern-out → pattern-in edge.
    const next: Edge | undefined = outgoing(ctx.graph, cur).find(
      (e) => e.targetHandle == null || e.targetHandle === PATTERN_IN
    );
    cur = next ? next.target : null;
  }
  return parts.join('');
}

function emit(nodeId: string, ctx: Ctx): string {
  if (ctx.visiting.has(nodeId)) {
    throw new Error(`Cycle in graph at node ${nodeId}`);
  }
  ctx.visiting.add(nodeId);
  try {
    const node = nodeById(ctx.graph, nodeId);
    if (!node) return '';

    // Non-manifest node: defer to the source emitter.
    if (!isManifestNode(node)) {
      const expr = ctx.opts.sourceEmitter?.(node);
      return expr ?? '';
    }

    const entry = getManifestEntry(node);

    // Resolve upstream — pattern-in edges. Multiple → stack().
    const inEdges = incoming(ctx.graph, nodeId, PATTERN_IN);
    const upstreams = inEdges
      .map((e) => emit(e.source, ctx))
      .filter((s) => s.length > 0);
    let upstream: string;
    if (upstreams.length === 0) upstream = '';
    else if (upstreams.length === 1) upstream = upstreams[0];
    else upstream = `stack(${upstreams.join(', ')})`;

    const args = entry.inputs
      .map((input) => emitParam(node, input, ctx))
      .filter((a): a is string => a !== null);

    if (entry.kind === 'higher-order') {
      const subEdge = incoming(ctx.graph, nodeId, SUBCHAIN_IN)[0];
      const subCode = subEdge ? emitSubchain(subEdge.source, ctx) : '';
      args.push(`x => x${subCode}`);
    }

    const call = `${entry.method}(${args.join(', ')})`;
    return upstream ? `${upstream}.${call}` : `.${call}`;
  } finally {
    ctx.visiting.delete(nodeId);
  }
}

/**
 * Find the part's terminal — a manifest node whose `pattern-out` has no
 * outgoing edges to another node's `pattern-in`. A well-formed part has
 * exactly one.
 */
export function findTerminal(graph: CodegenGraph): Node | null {
  const incomingTargets = new Set(
    graph.edges
      .filter((e) => e.targetHandle == null || e.targetHandle === PATTERN_IN)
      .map((e) => e.source)
  );
  for (const node of graph.nodes) {
    if (isManifestNode(node) && !incomingTargets.has(node.id)) {
      return node;
    }
  }
  return null;
}

export function emitPart(
  graph: CodegenGraph,
  opts: CodegenOptions = {}
): string {
  const terminal = findTerminal(graph);
  if (!terminal) return '';
  const ctx: Ctx = { graph, opts, visiting: new Set() };
  return emit(terminal.id, ctx);
}

/** Test seam — emit starting from a specific node. */
export function emitFromNode(
  nodeId: string,
  graph: CodegenGraph,
  opts: CodegenOptions = {}
): string {
  const ctx: Ctx = { graph, opts, visiting: new Set() };
  return emit(nodeId, ctx);
}
