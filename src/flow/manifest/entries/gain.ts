import type { TransformEntry } from '../schema';

export const gain: TransformEntry = {
  id: 'gain',
  label: 'Gain',
  category: 'amplitude',
  method: 'gain',
  kind: 'transform',
  inputs: [
    {
      name: 'gain',
      label: 'Gain',
      type: 'number',
      default: 1,
      defaultElidable: true,
      min: 0,
      max: 2,
      step: 0.01,
      patternable: true,
      control: 'knob',
    },
  ],
};
