/**
 * Top-level shell: a thin nav bar plus the active route.
 *
 * The shell deliberately does NOT instantiate React Flow or the audio
 * transport — those live inside the routes (and, in later milestones,
 * in a dedicated transport module that survives route changes per §6.6).
 */

import { useEffect } from 'react';

import { usePersistence } from './PersistenceProvider';
import { Link, useRoute } from './router';
import { FlowRoute } from './routes/Flow';
import { ArrangerRoute } from './routes/Arranger';

const REPO_URL = 'https://github.com/Cory-Bradshaw/strudel-flow';

export function Shell() {
  const { route } = useRoute();
  useUndoRedoShortcuts();
  return (
    <div className="flex h-screen w-full flex-col">
      <SurfaceNav />
      <div className="flex-1 overflow-hidden">
        {route === 'flow' ? <FlowRoute /> : <ArrangerRoute />}
      </div>
      <SourceOfferFooter />
    </div>
  );
}

function SurfaceNav() {
  const { route } = useRoute();
  const { canUndo, canRedo, undo, redo, storage } = usePersistence();
  const linkClass = (target: 'flow' | 'arranger') =>
    `px-3 py-1 rounded text-sm ${
      route === target
        ? 'bg-foreground text-background'
        : 'text-foreground/70 hover:text-foreground'
    }`;
  return (
    <nav className="flex items-center gap-2 border-b border-border bg-background px-3 py-2">
      <span className="mr-2 text-sm font-semibold">Strata</span>
      <Link to="flow" className={linkClass('flow')}>
        Flow
      </Link>
      <Link to="arranger" className={linkClass('arranger')}>
        Arranger
      </Link>
      <div className="ml-auto flex items-center gap-2">
        <StorageIndicator state={storage} />
        <button
          type="button"
          onClick={() => void undo()}
          disabled={!canUndo}
          className="rounded px-2 py-1 text-xs text-foreground/80 hover:bg-muted disabled:opacity-30"
          aria-label="Undo"
          title="Undo (⌘Z / Ctrl+Z)"
        >
          Undo
        </button>
        <button
          type="button"
          onClick={() => void redo()}
          disabled={!canRedo}
          className="rounded px-2 py-1 text-xs text-foreground/80 hover:bg-muted disabled:opacity-30"
          aria-label="Redo"
          title="Redo (⇧⌘Z / Ctrl+Y)"
        >
          Redo
        </button>
      </div>
    </nav>
  );
}

function StorageIndicator({
  state,
}: {
  state: ReturnType<typeof usePersistence>['storage'];
}) {
  if (!state) return null;
  const label = !state.supported
    ? 'storage: unsupported'
    : state.granted
      ? 'storage: protected'
      : 'storage: not protected';
  const cls = !state.supported
    ? 'text-amber-600'
    : state.granted
      ? 'text-emerald-600'
      : 'text-amber-600';
  return (
    <span className={`text-xs ${cls}`} title="navigator.storage.persist()">
      {label}
    </span>
  );
}

function useUndoRedoShortcuts() {
  const { undo, redo, canUndo, canRedo } = usePersistence();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        if (canUndo) {
          e.preventDefault();
          void undo();
        }
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        if (canRedo) {
          e.preventDefault();
          void redo();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, canUndo, canRedo]);
}

/**
 * AGPL §13: a network-served build must offer its complete source.
 * The footer is intentionally always visible — meets the obligation
 * without depending on any in-app modal being reachable.
 */
function SourceOfferFooter() {
  return (
    <footer className="flex items-center justify-end gap-3 border-t border-border bg-background px-3 py-1 text-xs text-muted-foreground">
      <span>Strata · AGPL-3.0-or-later</span>
      <a
        href={REPO_URL}
        target="_blank"
        rel="noreferrer"
        className="underline hover:text-foreground"
      >
        Source
      </a>
    </footer>
  );
}
