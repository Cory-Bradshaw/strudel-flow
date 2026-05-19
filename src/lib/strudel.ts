/**
 * Strudel pattern generation and optimization.
 *
 * M2 transition: components containing the new manifest-driven
 * TransformNode are emitted through src/flow/codegen (the new
 * edge-traversing generator) with a sourceEmitter that bridges
 * inherited Tier-1 composite source nodes (Pad, Beat Machine, ...).
 *
 * Components with only inherited nodes still run through the old
 * connected-component pipeline — those nodes will collapse onto
 * manifest entries during the M2 migration step and the old branch
 * can then be deleted.
 */

import { Edge } from '@xyflow/react';
import { AppNode } from '@/components/nodes';
import nodesConfig from '@/components/nodes';
import { useStrudelStore } from '@/store/strudel-store';
import { getNodeStrudelOutput } from './node-registry';
import { findConnectedComponents } from './graph-utils';
import { emitPart } from '@/flow/codegen';
import { TRANSFORM_NODE_TYPE } from '@/flow/transform-node';

/**
 * Optimize consecutive .sound() calls by combining them recursively
 */
function optimizeSoundCalls(strudelString: string): string {
  let optimized = strudelString;
  let previousLength = 0;

  // Keep applying optimization until no more changes are made
  while (optimized.length !== previousLength) {
    previousLength = optimized.length;
    // Replace consecutive .sound() calls with combined ones
    // This regex matches: .sound("something").sound("something else")
    optimized = optimized.replace(
      /\.sound\("([^"]+)"\)\.sound\("([^"]+)"\)/g,
      '.sound("$1 $2")'
    );
  }

  return optimized;
}
/**
 * Check if a node generates patterns (vs processes/modifies them)
 */
function isSoundSource(node: AppNode): boolean {
  const category = nodesConfig[node.type]?.category;
  return category === 'Instruments';
}

/**
 * Generate complete Strudel output from nodes and edges
 */
export function generateOutput(
  nodes: AppNode[],
  edges: Edge[],
  cpm?: string,
  bpc?: string
): string {
  // Use passed values or fallback to store values
  const currentCpm = cpm || useStrudelStore.getState().cpm;
  const currentBpc = bpc || useStrudelStore.getState().bpc;

  const nodePatterns: Record<string, string> = {};
  for (const node of nodes) {
    const strudelOutput = getNodeStrudelOutput(node.type);
    if (!strudelOutput) continue;

    try {
      const pattern = strudelOutput(node, '');
      if (pattern?.trim()) {
        nodePatterns[node.id] = pattern;
      }
    } catch (err) {
      console.warn(`Error generating pattern for node ${node.type}:`, err);
    }
  }

  const components = findConnectedComponents(nodes, edges);
  const finalPatterns: { pattern: string; paused: boolean }[] = [];

  for (const componentNodeIds of components) {
    const componentNodes = componentNodeIds
      .map((id) => nodes.find((n) => n.id === id))
      .filter(Boolean) as AppNode[];

    const sources = componentNodes.filter(isSoundSource);
    if (sources.length === 0) continue;

    const allSourcesPaused = sources.every(
      (node) => node.data.state === 'paused'
    );

    // Cast: AppNode union doesn't yet include the M2 transform arm, but
    // React Flow stores the type string verbatim. See M1 audit.
    const hasTransformNodes = componentNodes.some(
      (n) => (n.type as string) === TRANSFORM_NODE_TYPE
    );

    if (hasTransformNodes) {
      // New manifest-driven path: walk back from the terminal, bridging
      // inherited source nodes via the sourceEmitter callback.
      const componentIdSet = new Set(componentNodeIds);
      const subgraph = {
        nodes: componentNodes,
        edges: edges.filter(
          (e) => componentIdSet.has(e.source) && componentIdSet.has(e.target)
        ),
      };
      const code = emitPart(subgraph, {
        sourceEmitter: (node) => nodePatterns[node.id] ?? null,
      });
      if (code) {
        finalPatterns.push({
          pattern: optimizeSoundCalls(code),
          paused: allSourcesPaused,
        });
      }
      continue;
    }

    // Legacy path: inherited-only components.
    const effects = componentNodes.filter((n) => !isSoundSource(n));
    const activePatterns = (
      allSourcesPaused
        ? sources
        : sources.filter((node) => node.data.state !== 'paused')
    )
      .map((node) => nodePatterns[node.id])
      .filter(Boolean);

    if (activePatterns.length === 0) continue;

    let pattern =
      activePatterns.length === 1
        ? activePatterns[0]
        : `stack(${activePatterns.join(', ')})`;

    for (const effect of effects) {
      const strudelOutput = getNodeStrudelOutput(effect.type);
      if (strudelOutput && pattern) {
        pattern = strudelOutput(effect, pattern);
      }
    }

    if (pattern) {
      finalPatterns.push({
        pattern: optimizeSoundCalls(pattern),
        paused: allSourcesPaused,
      });
    }
  }

  if (finalPatterns.length === 0) return '';

  const result = finalPatterns
    .map(({ pattern, paused }) => {
      const line = `$: ${pattern}`;
      return paused ? `// ${line}` : line;
    })
    .join('\n');

  // Always add setcpm if there's sound (like other node outputs)
  if (result) {
    const bpm = parseInt(currentCpm) || 120;
    const beatsPerCycle = parseInt(currentBpc) || 4;
    return `setcpm(${bpm}/${beatsPerCycle})\n${result}`;
  }

  return result;
}
