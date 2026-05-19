# Strata — Design Document

> **Name:** *Strata* (layers / stacks). Surface names *Flow* and *Arranger* are likewise kept.
>
> A visual music tool for building songs out of reusable **parts**. Parts are authored
> on a node-graph canvas (a fork of **strudel-flow**); songs are assembled on a separate
> **Arranger** surface that generates Strudel's stacking and sequencing automatically.
> Powered by the Strudel pattern engine. Open source (AGPL-3.0).
>
> **This document supersedes and consolidates the three earlier specs**
> (`strata-architecture.md`, `strata-block-editor.md`, `strata-persistence.md`).
> Notably, the part editor is now a **React Flow node graph forked from strudel-flow**,
> *not* a Blockly block editor — see §5.

---

## 1. Overview

### 1.1 Who it's for

Two kids who co-work but don't co-edit. One likes coding music; one likes making music but not typing code. Both want to structure whole songs by combining parts — something raw Strudel makes painful (hand-written masks, no arrangement view) and a traditional DAW can't do without throwing away Strudel's algorithmic patterns.

### 1.2 Goals

- Build musical **parts** on a visual node canvas — zero typing required, but a code path stays available.
- **Full Strudel function coverage** in the visual editor (the reference project, strudel-flow, only covered a basic subset — §5.2 fixes this).
- A **wide instrument palette** — Strudel's full sound library, plus a path to import custom sounds the kids make in **AudioKit Synth One** (§7).
- A separate **Arranger** surface to assemble parts into songs — a groovebox/DAW-style page that auto-generates all stacking and masking.
- **Runs on both laptop and iPad** in a browser. Coding-heavy work (raw-Strudel Custom node, manifest authoring) is laptop-first; node-graph editing and Arranger use must work on iPad too. Touch parity is a milestone gate, not a polish item.
- **Self-hosted** on the family homelab and reached from each device's browser — see §12.
- **Never lose work** — deterministic, layered, visible persistence (§8).

### 1.3 Non-goals (v1)

- Real-time collaborative editing (kids co-work in separate projects; revisit later).
- Offline render / stereo mixdown (realtime playback only at first).
- VST/AUv3 hosting; running Synth One's synth engine in the browser (impossible — §7.4).
- A single unified UI for both part-editing and song-arrangement — deliberately **two surfaces** (§3).

---

## 2. Licensing

One license, no friction, because every upstream is already copyleft:

- **Strudel** — AGPL-3.0. Development is on Codeberg (`codeberg.org/uzu/strudel`); do not fork it back to GitHub.
- **strudel-flow** — AGPL-3.0 (xyflow's experimental React Flow UI for Strudel). Strata is a **fork** of it.
- Therefore **Strata ships AGPL-3.0** in full. AGPL §13: a network-served build must offer its complete source to users. Keep a dated change log of modifications; keep xyflow and Strudel attribution intact; no incompatible-licensed dependencies in the bundle.

Open-sourcing is the intended outcome, so this removes the only legal friction rather than creating any.

---

## 3. Two surfaces, two UIs

Strata is **two pages**, by design:

| Surface | Job | Paradigm |
|---|---|---|
| **Flow** | Author one part — a loop/pattern | Node graph (React Flow) — the strudel-flow fork |
| **Arranger** | Assemble parts into a song | Section × Part grid + mixer |

These are not merged. Part-authoring and song-arrangement are different problems with different natural layouts — the same reason a hardware groovebox, a modular rack, and a DAW timeline look nothing alike. Forcing both into one canvas would be a UX nightmare and was explicitly rejected.

**How they connect:** the Flow surface produces **Parts**; the Arranger consumes them. A Part is a named, timeless loop with no song position. The Arranger places parts into sections over linear time. Both surfaces operate on the same Project (§4); switching surfaces is a route change, not a data handoff.

---

## 4. Core data model

A project is a **directory** (§8.2). The model:

```ts
interface Project {
  id: string;
  name: string;
  parts: Part[];
  instruments: Instrument[];
  arrangement: Arrangement;
}

interface Part {
  id: string;
  name: string;
  graph: FlowGraph;          // React Flow { nodes, edges } — the Flow-surface source of truth
  phaseContinuous: boolean;  // false → goes into arrange/stack ; true → full-song mask (§6.3)
}

interface Section {
  id: string;
  name: string;              // "Intro", "Verse", "Drop"
  lengthCycles: number;
}

interface ArrangementCell {
  partId: string;
  sectionId: string;
  active: boolean;
  enter?: Transition;        // optional entry transition (§6.4)
  exit?: Transition;
}

interface Arrangement {
  tempoCps: number;          // Strudel uses cycles-per-second
  sectionOrder: string[];    // grid columns
  partOrder: string[];       // grid rows
  cells: ArrangementCell[];  // sparse
}

interface Transition {
  type: 'gain-fade' | 'lpf-sweep' | 'hpf-sweep';
  durationCycles: number;
  from: number;
  to: number;
}

interface Instrument {
  id: string;
  name: string;
  kind: 'builtin' | 'sample';
  builtinName?: string;                       // kind:builtin — a Strudel sound/bank name
  samples?: { note: string; file: string }[]; // kind:sample — multisample map
  baseNote?: string;                          // single-sample pitched fallback
  origin?: { tool: 'synthone' | 'other' };
}
```

Generated artifacts (Strudel code, song expression, prelude) are **never** stored — always regenerated from the model, so the project stays a clean source of truth. The **arrangement grid is the single source of truth for song structure** — masks and stacks are *derived* (§6), never hand-authored.

---

## 5. Surface 1 — Flow (the part editor)

### 5.1 Forked from strudel-flow

Strata's part editor starts as a fork of strudel-flow: React + TypeScript + Vite, React Flow for the canvas, Zustand for state, Tailwind + shadcn/ui for styling. The fork already provides a working Strudel-wired node canvas and a set of **composite source nodes** (Pad / step grid, Beat Machine, Arpeggiator, Chord, Polyrhythm, Custom). That inherited baseline is Tier 1 below — most of it exists on day one.

strudel-flow's three shortcomings and their root causes:

| Shortcoming | Root cause | Strata's fix |
|---|---|---|
| Covers only basic functions | Every node is a bespoke component → ~20-node ceiling | Manifest-driven generic node (§5.3) |
| Few instruments | Didn't surface Strudel's sound library | §7.2 |
| Doesn't save | No persistence layer (in-memory Zustand only) | §8 |

### 5.2 Two-tier node vocabulary

The fix for coverage is to stop hand-building one node per function.

**Tier 1 — composite source nodes.** Bespoke, musically-meaningful units — Drum Machine, Melody Grid, Chord, Arpeggiator, Polyrhythm, plus a raw-Strudel Custom node. A handful, each embedding a direct-manipulation widget (step grid, chord picker). This is the daughter's primary surface and is largely inherited from the fork.

**Tier 2 — one generic Transform node.** A *single* React Flow node component that renders **any** Strudel transform from a JSON **function manifest** (§5.3). Adding `.lpf`, `.room`, `.crush`, `.degradeBy`, `.jux`, any of Strudel's ~100+ functions is a manifest entry — not a new component. This single decision is the difference between a 20-node ceiling and full coverage.

Migrating strudel-flow's existing hand-built effect nodes onto the Tier-2 generic node is part of Milestone 2 — it deletes bespoke code *and* expands coverage at the same time.

### 5.3 The function manifest

One JSON file describes every transform. It drives **both** the node UI and the code generator — single source of truth for "what is `.lpf`."

```jsonc
{
  "id": "lpf",
  "label": "Low-pass filter",
  "category": "filter",
  "method": "lpf",
  "kind": "transform",                 // "transform" | "higher-order"
  "inputs": [
    { "name": "cutoff", "type": "number", "default": 800,
      "min": 20, "max": 20000, "patternable": true, "control": "knob" }
  ]
}
```

The generic `<TransformNode>` reads an entry and renders: the label, one control (knob/slider/dropdown) per input, a pattern **input handle**, a pattern **output handle**, and — for higher-order entries — a sub-chain handle (§5.4). `category` drives palette grouping. `patternable: true` means the control can be flipped to accept a mini-notation pattern or another node's output (typed ports — a constant, a pattern, or a wire are interchangeable).

### 5.4 Higher-order functions

Functions that take a *pattern/function* argument — `every`, `jux`, `off`, `superimpose`, `sometimes` — are manifest entries with `kind: "higher-order"`. Their node gets a secondary **"modify with"** input handle that accepts a small sub-chain of transform nodes. Codegen wraps that sub-chain as `x => x.<subchain>`. This is the node-graph equivalent of a nested block; React Flow handles multi-port nodes cleanly.

### 5.5 Connection typing

A part is one source-rooted graph. React Flow `isValidConnection` enforces:

- Handle types: `source-out`, `pattern-in`, `pattern-out`, `subchain-in`, `param-in`.
- A source node has only `pattern-out` (it cannot sit mid-chain as a transform target's nothing-special — it simply has no `pattern-in`).
- A transform has `pattern-in` + `pattern-out` (+ `subchain-in` if higher-order).
- Multiple `pattern-out` wires into one `pattern-in` → a `stack()` (§5.6).
- `param-in` accepts only value-producing nodes (signal/pattern), keeping modulation wiring distinct from the audio chain.

### 5.6 Graph → Strudel codegen

Codegen is a graph traversal from the part's terminal node (the unconnected `pattern-out`):

```js
function emit(node, graph) {
  if (node.kind === 'source') return emitSource(node);          // Tier-1 composite
  const ins = incoming(node, 'pattern-in', graph);
  const upstream = ins.length > 1
    ? `stack(${ins.map(n => emit(n, graph)).join(', ')})`
    : emit(ins[0], graph);
  const m = manifest[node.data.fn];
  const args = m.inputs.map(p => emitParam(node, p, graph)).join(', ');
  if (m.kind === 'higher-order') {
    const sub = incoming(node, 'subchain-in', graph)[0];
    const subCode = sub ? emitSubchain(sub, graph) : '';
    return `${upstream}.${m.method}(${args}${args && ', '}x => x${subCode})`;
  }
  return `${upstream}.${m.method}(${args})`;
}
```

`emitParam`: a constant → literal; a `param-in` wire → that node's expression; a pattern-mode control → quoted mini-notation. `emitSource` calls `gridToMini` (§5.7) for grid-based sources. Output example:

```
s("bd ~ sd ~").every(4, x => x.rev().lpf(400)).gain(0.8)
```

The Custom (raw-Strudel) node stores a string verbatim and emits it unchanged — opaque to the visual layer by design; no decompilation of arbitrary code is attempted.

**Eval policy.** Regenerate-and-re-eval on **edit commit**, not on every drag/keystroke — a 30-node graph re-evaling on each knob frame will glitch audio. Concretely: knob/slider drags update node state locally and only schedule a re-eval on pointer-up (or after a ~200 ms idle for keyboard edits). A small "stale, will re-eval" indicator gives the kid a visible reason for the pause. This is the audio counterpart to the §6.5 audio-lifecycle rules.

### 5.7 Step grids inside source nodes

Composite source nodes embed a step grid — a React component (trivial inside a React Flow node). `gridToMini` converts grid state to mini-notation:

- **Drums (lane-major):** each lane → a space-separated string; lanes joined with `,` inside one `s("…")`.
- **Pitched (column-major):** each step → `~`, a note, or `[c3,e3]` for chords.

The grid *is* the mini-notation underneath, so a grid edit produces a string the code path can read.

---

## 6. Surface 2 — Arranger (the song builder)

A separate page. The arrangement grid is the single source of truth; all stacking/masking is generated.

### 6.1 Section × Part grid

Rows are parts, columns are sections (`partOrder` × `sectionOrder`). Each cell is on/off (`active`) and may carry transitions. Inserting an 8-cycle section is one column insert + a regenerate — nothing in any part changes. That is the entire fix for raw Strudel's hand-edited-mask pain.

### 6.2 Arrange / stack codegen (default path)

For each section, collect its active non-phase-continuous parts; the section is a `stack()` of those parts (referenced as `const`s); the song is an `arrange()` of `[lengthCycles, sectionExpr]` pairs:

```js
const drums = /* generated from its Flow graph */;
const bass  = /* … */;
const lead  = /* … */;

arrange(
  [4, stack(drums)],
  [8, stack(drums, bass)],
  [8, stack(drums, bass, lead)],
);
```

The whole song shape is one legible expression. A column insert regenerates the entire `arrange` — no per-part editing.

> `arrange` resets the local cycle at each section boundary, so a part **re-triggers** when its section begins. Correct for most parts; the exception is §6.3.

### 6.3 Phase-continuity toggle (the one-knob mask)

When `part.phaseContinuous === true` (e.g. a bassline that must not re-trigger per section), the part is excluded from §6.2's sections and instead runs full-length, gated by a mask whose timeline is itself built with `arrange` — guaranteeing identical timing:

```js
const bassGated = bass.mask(arrange([4, "0"], [8, "1"], [8, "1"]));

stack(
  arrange( /* §6.2 sections */ ),
  bassGated,
);
```

One toggle on the part captures the whole `arrange`-vs-mask tradeoff. Either way the mask is generated, never hand-authored.

> **Verify in the REPL:** confirm `mask(arrange(...))` gates as intended against the current Strudel `mask`/`arrange` semantics. Fallback: a length-weighted mini-notation mask (`mask("0@4 1@8 1@8")`).

### 6.4 Transitions + prelude

A cell may carry an entry/exit transition. Codegen prepends a generated **prelude** of helpers and wraps the affected part within its section:

```js
// prelude (generated)
const ramp = (from, to, cyc) =>
  signal(t => Math.min(t / cyc, 1) * (to - from) + from);   // ramp then hold
```

| Transition | Generated |
|---|---|
| gain fade-in, 2 cyc | `.gain(ramp(0, 1, 2))` |
| filter-sweep build | `.lpf(ramp(200, 2000, dur))` |

This is where musical progression between parts lives — instead of binary on/off.

### 6.5 Audition vs Song output

- **Part audition** (on the Flow surface, or a mini-player in the Arranger): play one part in isolation, solo/loop.
- **Song**: the Arranger emits part `const`s + the single trailing `arrange`/`stack` expression — the finished structure.

### 6.6 Audio lifecycle across surfaces

The transport is owned by Strata, not the surface, so two rules govern it:

1. **Surface switch ≠ transport stop.** Navigating Flow → Arranger (or back) does **not** interrupt playback. A part auditioning on Flow keeps playing when the kid jumps to the Arranger to look at section structure; a song playing in the Arranger keeps playing when the kid jumps to Flow to peek at a part. The audio context, the current Strudel program, and the cycle position survive the route change.
2. **Arrangement edits stop the transport and re-prioritise to the Arranger.** Any mutation to the arrangement grid (cell toggle, transition edit, section insert, tempo change) stops the current transport and restarts it under the Arranger's authority with the newly-generated `arrange`/`stack` program — even if a Flow part was auditioning. This is intentional: arrangement edits change *what the song is*, so the song wins. A short crossfade (~50 ms) at the stop-and-restart boundary avoids the audible click.

Edits to a part on the Flow surface do **not** force a stop — the eval policy in §5.6 hot-swaps the part's program on the next commit. Switching the audio source (part audition ↔ song) is the only thing that forces a transport restart.

---

## 7. Instruments — built-in and custom import

### 7.1 Instrument model

See `Instrument` in §4. A built-in instrument is a Strudel sound/bank name. A **sample instrument** is a multisample map of audio files stored in the project directory. Source nodes reference instruments by `id`.

At project load, sample instruments are registered with Strudel via its sample-map API (`samples({ <id>: { c2: "c2.wav", c3: "c3.wav", … } }, baseUrl)`); Strudel selects the nearest sample and pitch-shifts. A source node then emits `.s("<instrumentId>")`. A built-in instrument emits `.s(name)` / `.bank(name)`.

### 7.2 Strudel sound library surfaced

strudel-flow exposed only a handful of sounds. Strata's source nodes surface Strudel's full built-in library and drum-machine banks (`RolandTR909`, etc.) through a searchable instrument picker, plus a "load sample folder" option for ad-hoc samples.

### 7.3 Custom instrument importer (audio → sample instrument)

A general pipeline — any audio becomes a playable instrument; Synth One is the motivating case.

1. **Input** — drop in one or more WAV files.
2. **Mode** — onset and pitch detection use **essentia.js** (the WebAssembly port of Essentia), with manual override at every step:
   - several files, one note each → pitch-detect per file (Essentia `PitchYinFFT`), filename hints used as a tiebreaker, manual correction available;
   - one file with notes spaced out → onset-detect (Essentia `OnsetDetection`), slice, pitch-detect each slice, manual nudge/reslice in the importer UI;
   - one file, one note → single-sample pitched instrument with a chosen base note (Strudel pitch-shifts it).
3. **Per-sample** — trim leading/trailing silence (Essentia `StartStopSilence`), normalise, optional fade. (Sustain looping is advanced — deferred.)
4. **Output** — WAVs saved to `instruments/<id>/`, instrument metadata written; it appears in the Flow instrument picker as a new source option.

Essentia is ~2 MB gzipped — load it lazily, only when the importer opens. The manual-override path is the spec contract: every automated step must be correctable, so a bad pitch-detect on a Synth One pad doesn't strand the kid.

### 7.4 Synth One capture guide (the iPad side)

Synth One's synth engine **cannot run in a browser**, so importing a `.synth1`/preset file to *recreate* the sound is not viable — and Strudel's simple synth could not faithfully reproduce Synth One's hybrid analog/FM voice anyway. The robust route is to **sample the actual audio**. Capture happens on the iPad, outside Strata:

- **On Synth One J6** — use its built-in **RECORD** button, which records the synth output and exports a WAV with no other apps needed. Cleanest path.
- **On the original Synth One** — it has no built-in audio recorder, but it is an AUv3 plug-in: host it in GarageBand / AUM / Cubasis and record there, or route via IAA/Audiobus into a recorder. Export WAV.
- **Transfer** — AirDrop / Files / iCloud the WAV(s) to the computer (or straight into the synced project folder, §8.4).
- **For a multisampled instrument** — record isolated sustained notes spread across the range (e.g. C2, C3, C4, C5), each a few seconds, as separate files or one take with gaps. More notes → more faithful pitch tracking; even a single note works.

Then run §7.3's importer. The whole flow is deliberately capture-then-import; an auto-multisampler that drives Synth One over MIDI and records it would need an audio bridge across the iPad/browser boundary — deferred to Later.

---

## 8. Persistence

strudel-flow's "doesn't save" failure was no persistence layer at all. Strata's fix is **deterministic, layered, visible** persistence — work is never lost to silent browser-storage eviction.

### 8.1 Three layers

| Layer | Mechanism | Setup | Browsers | Role |
|---|---|---|---|---|
| **A** | IndexedDB store + snapshot ring | none | all | **Safety floor** — never lose work |
| **B** | Local folder (File System Access API) | one folder pick | Chromium | Real files on disk; survives data clears |
| **C** | Git (isomorphic-git) over Layer B | opt-in | Chromium | Version history; opt-in push (e.g. Forgejo) |

Layer A guarantees no loss and runs from first launch with zero config. Layer C is for *history*, not loss-prevention — so its commits can be coarse. Do not conflate them.

### 8.2 Project-on-disk format

A project is a **directory**:

```
my-song.strata/
  project.json          # name, tempoCps, sections, partOrder, arrangement grid
  parts/<id>.json       # one file per part — the React Flow { nodes, edges } graph
  instruments/<id>/     # sample instrument: metadata + WAV files
  .git/                 # if Layer C enabled
```

Per-part files make git diffs meaningful (edit one part → one file changes) and keep folder writes small. A `.zip` export/import covers single-file portability and non-Chromium browsers.

### 8.3 Layer A — IndexedDB + snapshot ring

On startup, request eviction protection — this directly fixes "last week's work sometimes vanished":

```js
if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
  await navigator.storage.persist();
}
```

IndexedDB (via the `idb` wrapper) holds stores: `projects` (current state), `snapshots` (ring), `handles` (FSA dir handles), `settings`. Autosave is debounced ~2.5 s after the last edit; each autosave also appends a timestamped snapshot, keeping the last ~50 (or a tiered ring). On launch, if the IndexedDB copy is newer than the folder, offer **Restore unsaved changes**.

### 8.4 Layer B — local folder (File System Access API)

`window.showDirectoryPicker({ mode: 'readwrite' })` returns a `FileSystemDirectoryHandle`, persisted in IndexedDB. Permission must be re-granted once per session (`queryPermission` / `requestPermission`) — one click, and *not* a loss risk because Layer A holds the work regardless. Writes are debounced and touch only the dirty files. Chromium-only; on Firefox/Safari, Layer A remains the complete safety story and `.zip` export covers portability.

### 8.5 Layer C — git

`isomorphic-git` over an FSA-backed filesystem adapter (so `.git/` lives in the user's real folder), or LightningFS if no folder is linked. Auto-commit on **coarse** events — editor idle ≥45 s, tab hidden, or every few minutes — with generated messages; plus an explicit **Checkpoint** for named commits. Push is **opt-in**, to a user-configured remote (a self-hosted Forgejo is a natural target).

Credential rules — non-negotiable: the access token is **user-entered**, stored in the `settings` store only, **never** written into project files or committed. Project files are only music, so committing the folder is safe — the token must never enter it. Browser→git push needs a CORS proxy (self-host it; the homelab already runs Forgejo).

### 8.6 History & recovery UX

A **History panel** unifies Layer A snapshots and Layer C commits on one timeline; each entry can be Previewed or Restored (restoring creates a new snapshot — non-destructive). Settings surface visible state: storage protected (yes/no), folder linked, git remote, last commit/push.

---

## 9. Repo layout (fork of strudel-flow)

```
src/
  flow/                  the part editor (forked strudel-flow node system)
    nodes/
      sources/           Tier-1 composite source nodes (inherited + extended)
      transform-node/    the single generic manifest-driven Transform node
    manifest/            function-manifest JSON + loader
    codegen/             graph → Strudel ; gridToMini
  arranger/              NEW surface: section×part grid, arrange/stack codegen, mixer
  instruments/           instrument model, importer pipeline, Strudel sample registration
  persistence/           IndexedDB store, snapshot ring, FSA folder sync, git
  model/                 Project / Part / Section / Arrangement / Instrument types
  engine/                Strudel wrapper — eval, transport, solo/mute
  store/                 Zustand state (inherited, extended)
  app/                   routing/shell between Flow and Arranger
```

---

## 10. Milestones

Ordered to front-load what the daughter wants most (coverage, instruments) and the safety floor.

| # | Milestone | Deliverable | Done when |
|---|---|---|---|
| **M1** | **Fork & foundation** | (1) Fork strudel-flow → Strata, building, AGPL hygiene including `CHANGELOG-FORK.md` and an in-app §13 source-offer link. (2) §4 data model + project-as-directory. (3) Persistence Layer A — `storage.persist()` + IndexedDB autosave + snapshot ring (§8.3). (4) Routing shell with Flow and a placeholder Arranger route so M6 isn't a structural insert. (5) Undo/redo wired onto the snapshot ring. (6) Code-quality audit pass producing a written "keep / replace" note that informs M2. (7) Spike: REPL-verify `mask(arrange(...))` (§6.3) and record the result. (8) Homelab deploy target stood up (§12) — even if it's just the M1 build behind Caddy. | Strata runs as a fork, has a real project model, never loses work, has both routes wired, is reachable from the kids' browsers on the homelab, and the M7 mask approach has a green light or a recorded fallback. |
| **M2** | **Manifest-driven transforms** | Function manifest (§5.3) + generic `<TransformNode>`; migrate strudel-flow's bespoke effect nodes onto it; graph→Strudel codegen (§5.6) with the "regenerate on commit, not on every drag" eval policy; higher-order "modify with" ports (§5.4) — **prototype these first with the kids** before broad manifest expansion. Golden-file codegen tests, one per manifest entry. Touch interactions validated on iPad (multi-finger pan/zoom, node drag, long-press context menu, knob/slider touch targets). | (a) Every transform appearing in the daughter's current strudel-flow parts has a manifest entry; (b) a new function can be added by a non-author in under 10 minutes given a Strudel docs link; (c) the graph is editable on iPad without rage-quits. |
| **M3** | **Instruments & sound library** | Instrument model; surface Strudel's full built-in library and drum banks in source nodes via a searchable picker; "load sample folder" for ad-hoc samples. | Many more sounds available than strudel-flow shipped; kids can audition a wide palette. |
| **M4** | **Custom instrument import** | Audio→sample-instrument importer (§7.3) using **essentia.js** for onset and pitch detection (with manual-override at every step); Synth One capture guide (§7.4); samples register with Strudel. | A Synth One sound recorded on the iPad becomes a playable instrument in a Strata project on the homelab. |
| **M5a** | **Persistence — local folder** | FSA folder sync (§8.4) + `.zip` export/import for non-Chromium browsers and iPad; History panel running on Layer A snapshots alone (§8.6). | Real files on disk on laptop; loss-recovery UX visible; `.zip` round-trip works on iPad. |
| **M5b** | **Persistence — git** | `isomorphic-git` over an FSA filesystem adapter (§8.5); CORS proxy self-hosted alongside the homelab Forgejo; opt-in push; History panel extended with commits on the same timeline. | Browsable version history; one-click push to Forgejo. |
| **M6** | **Arranger surface** | New page wired to the M1 route; section×part grid; `arrange`+`stack` codegen (§6.2); part audition. Audio lifecycle wired per §6.5. | A song can be assembled from parts. |
| **M7** | **Arranger depth** | Phase-continuity toggle + mask codegen (§6.3) using the approach validated in M1; transition cells + prelude (§6.4); mixer strip (per-track gain/pan/sends). | Full song-building with musical progressions between parts. |
| **M8a** | **First-run experience** | Onboarding flow, project templates, in-app docs/help panel. | A kid can open Strata for the first time and reach an audible result without an adult. |
| **M8b** | **Shared part library** | Cross-project part copy/import within one user's projects. (Cross-user shared library deferred to Later.) | A part authored in one project can be reused in another. |
| **Later** | — | MIDI out; offline render/mixdown; collaborative editing; MIDI-driven auto-multisampling (needs an audio bridge); cross-user shared library; OPFS-based Layer B for Firefox/Safari if it matters. | — |

Milestones are independently shippable; M2–M4 deliberately precede the Arranger so the visual editor is genuinely capable before song-building lands. M5a ships before M5b because folder-on-disk safety is independent of git history and much lower-risk.

---

## 11. Risks & open questions

Resolved by initial decisions (kept here so future readers know they were considered): project name is **Strata**; surface names **Flow** and **Arranger** stay; target devices are **laptop + iPad in a browser**; onset/pitch detection uses **essentia.js**; deployment is **self-hosted on the family homelab** (§12).

Open or version-bound:

- **strudel-flow code quality inherited.** A fork adopts the upstream's structure and debt. The M1 audit pass produces a written keep/replace note that feeds M2.
- **Strudel API drift.** The manifest and codegen depend on current Strudel function signatures; Strudel is post-GitHub-move and evolving. **Pinned exactly to `@strudel/web@1.2.5`** (Codeberg `uzu/strudel` commit `d0ce82e3cd`; first `@strudel/web` release bundling `@strudel/core@1.2.4`). The packages in the Strudel monorepo do not share versions exactly: `@strudel/core@1.2.4` was published 2025-09-10 but `@strudel/web` skipped 1.2.4 and jumped 1.2.3 → 1.2.5. The manifest is version-bound to the `@strudel/web` pin. Refresh cadence: quarterly, only after the M2 golden codegen tests pass against the candidate pin.
- **`mask(arrange(...))` semantics.** §6.3 — to be REPL-verified during the M1 spike; length-weighted mini-notation mask is the recorded fallback if it doesn't hold.
- **FSA is Chromium-only, and iPad Safari has neither FSA nor a useful equivalent.** Accepted: Layer A is the complete safety story on iPad, and `.zip` export is the portability story. An OPFS-based Layer B for Safari is parked in Later.
- **Touch UX on a React Flow node graph.** Multi-finger pan/zoom, drag, long-press context menu, and touch-sized knob targets are not free. Treated as an M2 milestone gate, not a polish item — if touch parity slips, M2 doesn't ship.
- **Transport stop-and-restart click.** §6.6 specifies a ~50 ms crossfade on arrangement edits to avoid an audible click; verify in the M6 build that this actually masks it, and tune if not.
- **Eval-on-commit threshold.** §5.6 sets re-eval on pointer-up / 200 ms keyboard idle. If knob tweaking still glitches with bigger graphs, fall back to an explicit "Apply" button per node.
- **Storage eviction.** `navigator.storage.persist()` in M1 is mandatory — it *is* the original "lost work" bug.
- **Git push CORS + credentials.** Self-host the CORS proxy alongside Forgejo in the homelab (§12); token in `settings` store only, never in project files; push stays opt-in.
- **Sample-instrument pitch quality.** One sample stretched across a wide range sounds artificial — the importer should encourage a few notes across the range, not a lone sample. essentia.js makes this cheaper but doesn't change the recording guidance.
- **Synth One capture is manual and iPad-side.** Strata cannot orchestrate it; §7.4 is guidance, not automation. Auto-multisampling is deferred.
- **Higher-order node UX.** The "modify with" sub-chain port is the least familiar interaction in Flow — prototype it with the kids at the start of M2, before broad manifest expansion.

---

## 12. Deployment (homelab)

Strata is a Vite-built static SPA plus a tiny git-push helper. Both run on the family homelab and are reached from the kids' laptops and iPads over the LAN (and, if exposed, over a tailnet / reverse proxy).

**Pieces**

| Piece | What | Where it runs |
|---|---|---|
| **Strata app** | `pnpm build` output — static HTML/JS/CSS | A static file server (Caddy or nginx) on the homelab |
| **CORS proxy** | `@isomorphic-git/cors-proxy`, used only when M5b git push is enabled | Same homelab box, separate port, fronted by the same reverse proxy |
| **Forgejo** | Already-running git host the kids push to | Existing homelab service |

**Hosting notes**

- The existing homelab **Caddy** fronts services on the LAN and terminates HTTPS for Strata — handled outside this project. Strata's own contract is just "serve `dist/` and the CORS-proxy port; trust Caddy for TLS and routing." A trusted cert is required (iPad Safari rejects self-signed for Web Audio / FSA / `storage.persist()`); that requirement is satisfied by the existing Caddy setup.
- Set the standard SPA headers: long-cache the hashed JS/CSS, no-cache `index.html`. Service worker / PWA install is out of scope for v1 but the headers should not block adding one later.
- The CORS proxy is reached at a same-origin path (e.g. `/cors-proxy/`) so the SPA never needs cross-origin credentials; Caddy forwards it to the isomorphic-git proxy container. Push only — no clone-from-Internet needs to traverse it.
- **No public exposure required.** Reaching the homelab over Tailscale/Wireguard from outside is fine; opening Strata to the open Internet is not a goal.

**AGPL §13.** Because the kids reach Strata over a network, the running build must offer its source. Provide a footer link to the public Strata repo (or to a local `/source.zip` produced by the build pipeline) — covered as part of M1 "AGPL hygiene."

**Deploy flow**

1. CI (or a homelab `make deploy`) runs `pnpm build`, syncs `dist/` to the static-server volume, and updates the CORS-proxy and Forgejo containers if needed.
2. The kids hard-refresh in their browser. Layer A makes this safe even mid-session — autosaves survive a reload.
3. A tagged release writes its version + commit into the SPA so the in-app "About" panel and the AGPL source link match the running build.
