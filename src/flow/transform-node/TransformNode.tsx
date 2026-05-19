/**
 * Generic, manifest-driven transform node — STRATA.md §5.2-5.4.
 *
 * One React Flow component that renders ANY transform whose manifest
 * entry it's pointed at. The 19 inherited bespoke effect nodes collapse
 * to this component plus 19 manifest entries (M2 migration step).
 *
 * Inputs:
 *  - `pattern-in` (target, left): the upstream pattern. Multiple incoming
 *    edges → codegen wraps in `stack()`.
 *  - For higher-order entries, an extra `subchain-in` (target, bottom):
 *    a linear chain of transforms emitted as `x => x.<chain>`.
 *
 * Outputs:
 *  - `pattern-out` (source, right): the transformed pattern.
 *
 * Controls:
 *  - Number/string/boolean/enum widgets per manifest input. Patternable
 *    inputs flip between "constant" and "pattern" mode with a small
 *    toggle that swaps the slider for a text field.
 *
 * Touch sizing is intentionally generous (≥40px tap targets) — iPad
 * editing is a milestone gate (STRATA.md M2 DoD).
 */

import { useCallback } from 'react';
import { Handle, type NodeProps, Position } from '@xyflow/react';
import { Trash } from 'lucide-react';

import { BaseNode } from '@/components/base-node';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { useAppStore } from '@/store/app-context';
import {
  getEntry,
  type InputValue,
  type ManifestEntry,
  type ManifestInput,
  type NumericInput,
  type TransformNodeData,
  type TransformNodeInputs,
} from '@/flow/manifest';
import { PATTERN_IN, SUBCHAIN_IN } from '@/flow/codegen';

function defaultValue(input: ManifestInput): InputValue {
  return { mode: 'constant', value: input.default };
}

function isPattern(value: InputValue): boolean {
  return value.mode === 'pattern';
}

function inputValueFor(
  input: ManifestInput,
  inputs: TransformNodeInputs | undefined
): InputValue {
  return inputs?.[input.name] ?? defaultValue(input);
}

export function TransformNode({ id, data }: NodeProps) {
  const transformData = data as unknown as TransformNodeData;
  const entry = getEntry(transformData.fn);
  const updateNodeData = useAppStore((s) => s.updateNodeData);
  const removeNode = useAppStore((s) => s.removeNode);

  const setInput = useCallback(
    (name: string, value: InputValue) => {
      updateNodeData(id, {
        inputs: { ...transformData.inputs, [name]: value },
      });
    },
    [id, transformData.inputs, updateNodeData]
  );

  const inputs = entry.inputs;
  const isHigherOrder = entry.kind === 'higher-order';

  return (
    <BaseNode className="min-w-[280px]">
      {/* Pattern-in (left). */}
      <Handle
        type="target"
        position={Position.Left}
        id={PATTERN_IN}
        className="!h-4 !w-4 !rounded-full !border-border !bg-secondary"
      />
      {/* Pattern-out (right). */}
      <Handle
        type="source"
        position={Position.Right}
        className="!h-4 !w-4 !rounded-full !border-border !bg-secondary"
      />
      {/* Sub-chain (bottom) for higher-order entries. */}
      {isHigherOrder && (
        <Handle
          type="target"
          position={Position.Bottom}
          id={SUBCHAIN_IN}
          className="!h-4 !w-4 !rounded-full !border-amber-500 !bg-amber-500/70"
        />
      )}

      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">{entry.label}</div>
          <div className="text-xs text-muted-foreground">{entry.category}</div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Delete node"
          onClick={() => removeNode(id)}
          className="h-9 w-9 p-0"
        >
          <Trash className="h-4 w-4" />
        </Button>
      </div>

      {inputs.length === 0 ? (
        <div className="text-xs text-muted-foreground">No parameters.</div>
      ) : (
        <div className="flex flex-col gap-3">
          {inputs.map((input) => (
            <InputControl
              key={input.name}
              input={input}
              value={inputValueFor(input, transformData.inputs)}
              setValue={(v) => setInput(input.name, v)}
            />
          ))}
        </div>
      )}

      {isHigherOrder && (
        <SubchainHint label={getSubchainLabel(entry)} />
      )}
    </BaseNode>
  );
}

function getSubchainLabel(entry: ManifestEntry): string {
  if (entry.kind === 'higher-order') {
    return entry.subchainLabel ?? 'modify with';
  }
  return '';
}

function SubchainHint({ label }: { label: string }) {
  return (
    <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-amber-600 dark:text-amber-400">↓ connect chain</span>
    </div>
  );
}

interface InputControlProps {
  input: ManifestInput;
  value: InputValue;
  setValue: (v: InputValue) => void;
}

function InputControl({ input, value, setValue }: InputControlProps) {
  const togglePatternMode = () => {
    if (isPattern(value)) {
      setValue({ mode: 'constant', value: input.default });
    } else {
      const seed =
        value.mode === 'constant' && typeof value.value !== 'boolean'
          ? String(value.value)
          : String(input.default);
      setValue({ mode: 'pattern', pattern: seed });
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium">{input.label ?? input.name}</label>
        {isPatternable(input) && (
          <button
            type="button"
            onClick={togglePatternMode}
            className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${
              isPattern(value)
                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
            aria-label={isPattern(value) ? 'Use constant value' : 'Use pattern'}
          >
            {isPattern(value) ? 'pattern' : 'const'}
          </button>
        )}
      </div>

      {value.mode === 'pattern' ? (
        <PatternField
          value={value.pattern}
          onChange={(p) => setValue({ mode: 'pattern', pattern: p })}
        />
      ) : (
        renderConstantControl(input, value, setValue)
      )}
    </div>
  );
}

function isPatternable(input: ManifestInput): boolean {
  return 'patternable' in input ? Boolean(input.patternable) : false;
}

function renderConstantControl(
  input: ManifestInput,
  value: InputValue,
  setValue: (v: InputValue) => void
) {
  if (input.type === 'number') {
    return (
      <NumberSlider
        input={input}
        value={
          value.mode === 'constant' && typeof value.value === 'number'
            ? value.value
            : input.default
        }
        onChange={(n) => setValue({ mode: 'constant', value: n })}
      />
    );
  }

  if (input.type === 'enum') {
    const current =
      value.mode === 'constant' && typeof value.value === 'string'
        ? value.value
        : input.default;
    return (
      <select
        value={current}
        onChange={(e) => setValue({ mode: 'constant', value: e.target.value })}
        className="h-10 rounded border border-border bg-background px-2 text-sm"
      >
        {input.options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    );
  }

  if (input.type === 'boolean') {
    const current =
      value.mode === 'constant' && typeof value.value === 'boolean'
        ? value.value
        : input.default;
    return (
      <button
        type="button"
        onClick={() => setValue({ mode: 'constant', value: !current })}
        className={`h-10 rounded border border-border px-3 text-left text-sm ${
          current ? 'bg-primary text-primary-foreground' : 'bg-background'
        }`}
      >
        {current ? 'on' : 'off'}
      </button>
    );
  }

  // String
  const current =
    value.mode === 'constant' && typeof value.value === 'string'
      ? value.value
      : input.default;
  return (
    <Input
      value={current}
      onChange={(e) => setValue({ mode: 'constant', value: e.target.value })}
      className="h-10"
    />
  );
}

function NumberSlider({
  input,
  value,
  onChange,
}: {
  input: NumericInput;
  value: number;
  onChange: (v: number) => void;
}) {
  const min = input.min ?? 0;
  const max = input.max ?? 100;
  const step = input.step ?? 1;
  return (
    <div className="flex flex-col gap-1">
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(arr) => onChange(arr[0])}
        className="touch-manipulation"
      />
      <div className="text-right text-[10px] text-muted-foreground">
        {value}
      </div>
    </div>
  );
}

function PatternField({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="mini-notation, e.g. 200 800 1600"
      className="h-10 font-mono text-sm"
    />
  );
}
