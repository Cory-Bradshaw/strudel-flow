import type { TransformEntry } from '../schema';

export const lpf: TransformEntry = {
  id: 'lpf',
  label: 'Low-pass filter',
  category: 'filter',
  method: 'lpf',
  kind: 'transform',
  inputs: [
    {
      name: 'cutoff',
      label: 'Cutoff',
      type: 'number',
      default: 1000,
      defaultElidable: true,
      min: 20,
      max: 20000,
      step: 1,
      patternable: true,
      control: 'knob',
    },
  ],
};
