# CHANGELOG-FORK — Strata fork of strudel-flow

This file records modifications made by the Strata fork relative to upstream
[strudel-flow](https://github.com/xyflow/strudel-flow), as required by the
GNU Affero General Public License v3 §5(a). The full AGPL-3.0 text is in
[LICENSE](LICENSE); the design that guides these changes is in [STRATA.md](STRATA.md).

Upstream baseline: strudel-flow `main` at the time of fork (see git log).

Entries are dated; newest first.

---

## 2026-05-18 — M1 begins

- Renamed project to **Strata** in `package.json` (`name`, `description`).
- Switched declared license to `AGPL-3.0-or-later` in `package.json` (the
  upstream `LICENSE` file was already AGPL-3.0; `package.json` had `MIT`,
  which was inconsistent).
- Pinned `@strudel/web` exactly to `1.2.5` (Codeberg `uzu/strudel` commit
  `d0ce82e3cd`; first `@strudel/web` release bundling `@strudel/core@1.2.4`,
  since the monorepo packages do not share versions exactly).
- Added [docs/M1-AUDIT.md](docs/M1-AUDIT.md) — keep/replace notes that feed
  the M2 manifest-driven transform work.
- Added this file.
