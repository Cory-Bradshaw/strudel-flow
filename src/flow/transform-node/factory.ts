/**
 * Factory for manifest-driven transform nodes.
 *
 * Used by the palette: clicking a manifest entry calls this to build a
 * fresh React Flow node, seeded with each input's default value so the
 * codegen has something coherent to read before the kid touches anything.
 */

import { nanoid } from 'nanoid';
import type { Node, XYPosition } from '@xyflow/react';

import {
  getEntry,
  type InputValue,
  type TransformNodeData,
  type TransformNodeInputs,
} from '../manifest';

export const TRANSFORM_NODE_TYPE = 'transform';

function seedInputs(manifestId: string): TransformNodeInputs {
  const entry = getEntry(manifestId);
  const out: TransformNodeInputs = {};
  for (const input of entry.inputs) {
    out[input.name] = {
      mode: 'constant',
      value: input.default,
    } satisfies InputValue;
  }
  return out;
}

export function createTransformNode(
  manifestId: string,
  position: XYPosition
): Node<TransformNodeData> {
  return {
    id: nanoid(),
    type: TRANSFORM_NODE_TYPE,
    position,
    data: {
      fn: manifestId,
      inputs: seedInputs(manifestId),
    },
  };
}
