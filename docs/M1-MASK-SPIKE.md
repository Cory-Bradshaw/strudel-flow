# M1 Spike — `mask(arrange(...))` semantics

STRATA.md §6.3 designs the phase-continuity toggle around this expression:

```js
const bassGated = bass.mask(arrange([4, "0"], [8, "1"], [8, "1"]));
```

If `arrange` re-times its sections deterministically AND `mask` gates a
continuously-running pattern (rather than re-triggering it), then the gated
bass timeline is **identical** to the §6.2 `arrange(...)` timeline for the
non-gated parts — which is what §6.3 needs to be cycle-accurate.

This spike confirms it before M7 commits to the approach.

## Source-level analysis

Pinned build: `@strudel/web@1.2.5` (commit `d0ce82e3cd`).

**`arrange`** — from the bundle, [`arrange(...e)`](../node_modules/@strudel/web/dist/index.mjs):

```js
function arrange(...e) {
  const t = e.reduce((n, [r]) => n + r, 0);
  return e = e.map(([n, r]) => [n, r.fast(n)]),
         stepcat(...e).slow(t);
}
```

Reading: total cycle count `t`; each section `[n, pattern]` is pre-multiplied
to `[n, pattern.fast(n)]`; `stepcat` allocates each section to a weighted
slot proportional to `n`; `.slow(t)` stretches the whole result so the song
takes `t` cycles total.

Cycle accounting for `arrange([4, x], [8, y])`:
- stepcat slot for x is `4/12 = 1/3` of a 1-cycle pattern
- `x.fast(4)` in that slot produces 4 events per (compressed) slot
- `.slow(12)` expands the slot to 4 cycles of output time
- Net: **x plays 4 times across 4 cycles of song time** — at x's original speed
- Same arithmetic gives y playing 8 times across the next 8 cycles

This **confirms STRATA.md §6.2's claim that "`arrange` resets the local
cycle at each section boundary, so a part re-triggers when its section
begins"**.

**`mask`** — from the bundle:

```js
const mask = registerControl((e, t) => Pattern(t).mask(e));
```

`Pattern.mask` returns silence wherever the gate pattern is `0` or `~`. The
gated pattern's phase continues running underneath — `mask` is a gate, not a
trigger. Confirmed by strudel.cc docs ("Returns silence when mask is 0 or '~'").

**`mask(arrange(...))`** — composition is straightforward: the mask gate is
itself an `arrange`-shaped pattern, so its 0/1 boundaries land on the
exact same cycle ticks as the §6.2 arrangement. The gated pattern's
phase advances continuously across boundaries — exactly the
phase-continuity guarantee §6.3 needs.

**Conclusion (analysis-level):** the approach works. The Strata code generator
can emit `part.mask(arrange([n1, "0|1"], …))` and trust that the gate
boundaries align with the §6.2 song timeline cycle-for-cycle.

## REPL test (run this to confirm by ear)

Paste into [strudel.cc](https://strudel.cc) or any running Strata build's
Custom node. Compare the two patterns — they should be **rhythmically
identical**: a 4-cycle silence, then 16 cycles of bass playing in continuous
phase. The mask version should NOT re-trigger the bass at the second 8-cycle
boundary.

```js
setcpm(120/4)

// Reference: arrange-only, with bass appearing in section 2
const bass = note("c2 ~ eb2 g2").s("sawtooth").lpf(800);
const drums = s("bd ~ sd ~");

// Variant A — non-gated arrangement (re-triggers per section)
$: arrange(
  [4, drums],
  [8, stack(drums, bass)],
  [8, stack(drums, bass)],
)

// Variant B — phase-continuous mask
const bassGated = bass.mask(arrange([4, "0"], [8, "1"], [8, "1"]));
// $: stack(arrange([4, drums], [8, drums], [8, drums]), bassGated)
```

To audition Variant B, comment out Variant A's `$:` line and uncomment the
last line.

**What to listen for:**

1. Both variants should produce identical-sounding drum patterns.
2. Variant A's bass restarts from the top of `"c2 ~ eb2 g2"` at the start
   of section 2 (cycle 4) and again at section 3 (cycle 12).
3. Variant B's bass keeps phase across the section-2 / section-3 boundary —
   if the bass were at `g2` (the 4th note) when the boundary hit, it should
   continue from there, not restart from `c2`.

For a more obvious test, replace the bass line with a long-period sequence
that makes restart-vs-continue audibly distinct:

```js
const bass = note("c2 d2 eb2 e2 f2 g2 ab2 a2 bb2 b2 c3 d3 eb3 e3 f3 g3").s("sawtooth").slow(2);
```

Now Variant B's bass walks through all 16 notes regardless of section
boundaries; Variant A restarts the 16-note walk every section.

## Result

- **Analysis (this document):** ✅ confirmed. `mask(arrange(…))` produces
  phase-continuous gating aligned with the §6.2 arrangement timeline.
- **Empirical / by ear (REPL):** ⏳ to be confirmed by running the test
  above and updating this section.

## Fallback (recorded, in case empirical disagrees with analysis)

STRATA.md §6.3 specifies a length-weighted mini-notation mask:

```js
const bassGated = bass.mask("0@4 1@8 1@8");
```

This sidesteps `arrange` inside the mask entirely. Mini-notation `@n`
already encodes weighted duration, so the cycle boundaries are explicit
rather than derived. If the empirical REPL test reveals any unexpected
behavior (e.g. a Strudel version that re-triggers under `mask(arrange)`),
the code generator switches to this form. The data model is unaffected —
both forms derive from the same `Arrangement.sectionOrder` + `Section.lengthCycles`.
