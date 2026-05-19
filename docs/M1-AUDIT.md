# M1 Audit — strudel-flow → Strata

A pass over the inherited codebase. The bar is **"what feeds M2 directly"**: every node type, every codegen assumption, every store boundary that the manifest work will have to honour or replace.

## Shape

- React 19 + Vite + TypeScript, Tailwind v4, shadcn/ui, `@xyflow/react@12`, Zustand.
- 109 source files. The node component tree dominates — 28 node types under `src/components/nodes/{instruments,synths,effects}/`.
- No router (single page). No persistence (in-memory store only). No tests.
- Single Strudel init in [src/store/index.tsx:21-25](src/store/index.tsx#L21-L25) — `initStrudel()` + `samples('github:tidalcycles/dirt-samples')` at app mount.

## Two Zustand stores, by accident

- [src/store/app-store.ts](src/store/app-store.ts) — graph state (`nodes`, `edges`, `theme`, `colorMode`, drag state, connection sites). Provider-scoped via `AppStoreProvider` (so the store identity is tied to the React tree).
- [src/store/strudel-store.ts](src/store/strudel-store.ts) — `pattern` (the generated string), `cpm`, `bpc`. Module-scoped singleton.

The split is the inherited shape, not a design choice: tempo lives in a different store than the graph that drives the pattern. Strata wants both inside the `Project` model (§4), and the singleton vs provider asymmetry needs to go away.

## Codegen — single function, brittle

[src/lib/strudel.ts:43](src/lib/strudel.ts#L43) is the entire pipeline.

How it works today:
- Finds connected components in the graph ([src/lib/graph-utils.ts](src/lib/graph-utils.ts)), splits each into **sources** (`category === 'Instruments'`) and **effects** (everything else — `Synths`, `Audio Effects`, `Time Effects` all treated identically as a post-pipeline).
- Stacks active sources, then *chains every non-source node in component order* — connection direction is **ignored** for effects. There's no traversal of the effect chain. Wiring `lpf → gain` vs `gain → lpf` produces the same output.
- Each node component carries a static `.strudelOutput(node, prev) => string` method (e.g. [src/components/nodes/effects/lpf-node.tsx:66](src/components/nodes/effects/lpf-node.tsx#L66)) that concatenates the function call onto the upstream string.
- Defaults are hardcoded inside each node's `.strudelOutput`; if the user hasn't changed the knob, the node *omits itself* from output (lpf-node.tsx:68). This is unique-snowflake-per-node — exactly the 20-node-ceiling problem the design doc names.
- A regex post-pass merges adjacent `.sound("a").sound("b")` into `.sound("a b")` (strudel.ts:24).

**Implications for M2:**
- The manifest-driven Transform node (§5.2-5.6) replaces this whole module. The new codegen must traverse edges, not component-membership, for effects.
- The "omit if default" behaviour is a usability win (don't clutter the emitted code with `.gain(1)`) — port it into the manifest layer as a per-input `defaultElidable: true` rule.
- Every existing `.strudelOutput` is one manifest entry plus a per-input UI hint.

## Pattern evaluation — already good, mostly

[src/hooks/use-workflow-runner.tsx](src/hooks/use-workflow-runner.tsx) handles eval:

- Re-evaluates on `pattern` change, debounced 50 ms.
- Skips eval when the pattern hasn't actually changed (`lastEvaluatedPattern.current` compare).
- Force-evaluates on `setcpm(` / `scale(` immediately (bypass debounce).
- `hush()` when the active pattern is empty.

Close to what §5.6 wants — but 50 ms is "while you drag" territory, not "on commit." For Strata's eval-on-commit rule we want the debounce moved off keystrokes/drag-deltas and onto **pointer-up / 200 ms-keyboard-idle**, with knob nodes scheduling re-eval via a single store action instead of writing-then-debouncing.

**Keep** the hush-on-empty and "skip if unchanged" logic. **Replace** the 50 ms debounce with the commit-based scheduler.

## Persistence today — none, plus a URL share

There is no `localStorage`, no IndexedDB, no FSA. The only persistence is:
- [src/lib/state-serialization.ts](src/lib/state-serialization.ts) — `lz-string` compresses the state into a URL query param; `loadStateFromUrl()` restores it on boot.
- `saveStateToFile()` downloads a `.json` blob.
- `useUrlState` hook in [src/hooks/use-url-state.tsx](src/hooks/use-url-state.tsx) (not read in audit but referenced from share popover).

This is exactly the gap STRATA.md §8 identifies. **Replace wholesale** with Layer A (idb store + snapshot ring + `storage.persist()`).

The URL-share path is worth keeping as a "share a part" feature in M8, but it's not a save mechanism.

## What strudel-flow nodes give us for M2's manifest

Counting the existing effect/time-effect nodes, we get 19 manifest entries "for free" if we model them well:

| Existing node | Manifest entry | Inputs (default-elidable) |
|---|---|---|
| `lpf-node` | `lpf` | freq:1000, q:1 |
| `gain-node` | `gain` | gain:1 |
| `pan-node` | `pan` | pan:0.5 |
| `room-node` | `room` | room:0, roomsize:1, roomfade:0.5, roomlp:8000, roomdim:0 |
| `crush-node` | `crush` | crush:16 |
| `distort-node` | `distort` | distort:0 |
| `phaser-node` | `phaser` | phaser:0, phaserdepth:0.75 |
| `fm-node` | `fm` | fm:1 |
| `attack-node` | `attack` | attack:0 |
| `release-node` | `release` | release:0 |
| `sustain-node` | `sustain` | sustain:1 |
| `postgain-node` | `postgain` | postgain:1 |
| `fast-node` | `fast` | fast:1 |
| `slow-node` | `slow` | slow:1 |
| `rev-node` | `rev` | (no inputs) |
| `palindrome-node` | `palindrome` | (no inputs) |
| `ply-node` | `ply` | multiplier, probability (higher-order-ish) |
| `late-node` | `late` | offset, pattern |
| `mask-node` | `mask` | pattern, probability |
| `jux-node` | `jux` | (higher-order — the only inherited example) |

**Keep** the underlying React state structure of each (the existing `WorkflowNodeData` has the field name we'd map from). **Delete** the 19 bespoke node files once the generic `<TransformNode>` lands and proves out one or two of them — they collapse to data.

The Tier-1 composite source nodes — **Pad, Beat Machine, Polyrhythm, Chord, Arpeggiator, Custom, DrumSounds, SynthSelect** — stay as bespoke components. They are the inherited fork's actual value.

## Smaller findings

- [src/components/nodes/index.tsx:42-121](src/components/nodes/index.tsx#L42-L121) — `WorkflowNodeData` is a single grab-bag type for every node. M2 should narrow per-node-type as part of the manifest cutover (manifest entries can generate the per-input shape).
- [src/components/nodes/index.tsx:371-399](src/components/nodes/index.tsx#L371-L399) — `AppNode` is a 28-arm union, hand-maintained. Same fix: collapse the manifest-backed arms into one `Node<TransformNodeData, 'transform'>` arm.
- [src/main.tsx](src/main.tsx) wraps the whole app in `ReactFlowProvider`. That provider belongs *inside* the Flow route only — the Arranger does not need it.
- The `WorkflowNodeData.state` field with `'running' | 'paused' | 'stopped'` is per-source-node mute/solo. It belongs on the source nodes; transform manifest entries do not need it.
- Theme system is broad ([src/data/css/](src/data/css/) has 12 themes). Untouched by M1 — kept verbatim.
- `setcpm()` in codegen ([src/lib/strudel.ts:130-132](src/lib/strudel.ts#L130-L132)) treats `cpm` and `bpc` as separate ints — Strata's model unifies as `tempoCps: number`. Conversion: `cpm / 60` cycles-per-second, divided by `bpc`. The codegen replacement needs to emit one `setcpm(...)` from the Project's `tempoCps`.

## Keep / Replace summary

**Keep:**
- React/Vite/Tailwind/shadcn stack as-is; React Flow v12; Zustand.
- The 8 composite source-node components (Pad, Beat Machine, Polyrhythm, Chord, Arpeggiator, Custom, DrumSounds, SynthSelect) — they are the inherited value.
- Pattern-eval architecture (`useWorkflowRunner`'s hush-on-empty, skip-if-unchanged) — port forward with the commit-based scheduler.
- Theme system, shadcn UI components, sidebar layout shell (becomes the Flow route's shell).

**Replace:**
- `src/lib/strudel.ts` codegen — replaced in M2 with edge-traversing manifest-driven codegen.
- All 19 bespoke effect/time-effect node files — replaced in M2 by `<TransformNode>` + manifest entries.
- `src/store/strudel-store.ts` singleton — folded into the Project model; tempo is `tempoCps` on `Arrangement`.
- `src/lib/state-serialization.ts` — replaced in M1 by Layer A persistence (URL share kept later for "share a part").
- The single-page mount in `src/main.tsx` — replaced in M1 by the routing shell.
- `AppStoreProvider` initializing Strudel on mount — keep the init, move out of the store provider into a top-level transport module so both Flow and Arranger can use it.

**Net deletion expected after M2:** ~3000 LoC across 20 files (19 bespoke effect components + the codegen module), replaced by one `<TransformNode>` component + one manifest JSON.
