/**
 * Wires Strata's two Zustand stores into Layer A — STRATA.md §8.3.
 *
 * Responsibilities:
 *  1. On mount: request `navigator.storage.persist()`, then restore the
 *     last-saved state from IndexedDB into the live stores.
 *  2. Subscribe to both stores; after a 2500 ms debounce of edit
 *     quiescence, commit a snapshot + write to `current`.
 *  3. Expose undo / redo / canUndo / canRedo to the rest of the app.
 *
 * The debounce window is the same one §8.3 names; it intentionally
 * coalesces drag-streams into one snapshot per "rest." That's the
 * granularity the spec asks of undo too.
 *
 * The single-project assumption (projectId = 'default') is M1-temporary.
 * Multi-project lands when project create/open lands in M5a.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { AppStoreContext } from '@/store/app-context';
import { useStrudelStore } from '@/store/strudel-store';
import {
  type History,
  canRedo,
  canUndo,
  commit,
  loadCurrent,
  loadHistory,
  type PersistedState,
  type PersistenceState,
  redo as redoOp,
  requestPersistence,
  saveCurrent,
  undo as undoOp,
} from '@/persistence';

const PROJECT_ID = 'default';
const AUTOSAVE_DEBOUNCE_MS = 2500;

interface PersistenceContextValue {
  ready: boolean;
  storage: PersistenceState | null;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
}

const PersistenceContext = createContext<PersistenceContextValue | null>(null);

export function PersistenceProvider({ children }: { children: ReactNode }) {
  const appStoreApi = useContext(AppStoreContext);
  if (!appStoreApi) {
    throw new Error('PersistenceProvider must be inside AppStoreProvider');
  }

  const historyRef = useRef<History>({ entries: [], cursor: -1 });
  const debounceRef = useRef<number | null>(null);
  const restoringRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [storage, setStorage] = useState<PersistenceState | null>(null);
  const [, forceRerender] = useState(0);
  const bumpHistoryView = useCallback(
    () => forceRerender((n) => n + 1),
    []
  );

  const snapshotState = useCallback((): PersistedState => {
    const app = appStoreApi.getState();
    const strudel = useStrudelStore.getState();
    return {
      nodes: app.nodes,
      edges: app.edges,
      theme: app.theme,
      colorMode: app.colorMode,
      cpm: strudel.cpm,
      bpc: strudel.bpc,
    };
  }, [appStoreApi]);

  const applyState = useCallback(
    (state: PersistedState) => {
      restoringRef.current = true;
      try {
        appStoreApi.setState({
          nodes: state.nodes as never,
          edges: state.edges as never,
          theme: state.theme,
          colorMode: state.colorMode,
        });
        useStrudelStore.setState({ cpm: state.cpm, bpc: state.bpc });
      } finally {
        // Defer to next tick so the subscription fires under restoring=true.
        queueMicrotask(() => {
          restoringRef.current = false;
        });
      }
    },
    [appStoreApi]
  );

  // 1. Bootstrap: request persistence + restore.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const persistState = await requestPersistence();
      if (cancelled) return;
      setStorage(persistState);

      const current = await loadCurrent(PROJECT_ID);
      if (current) applyState(current.state);

      historyRef.current = await loadHistory(PROJECT_ID);
      // If history is empty (fresh install), seed with the current state.
      if (historyRef.current.entries.length === 0) {
        historyRef.current = await commit(
          historyRef.current,
          PROJECT_ID,
          snapshotState()
        );
      }

      bumpHistoryView();
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [applyState, snapshotState, bumpHistoryView]);

  // 2. Subscribe to both stores; debounce; commit snapshot + save current.
  useEffect(() => {
    if (!ready) return;

    const scheduleSave = () => {
      if (restoringRef.current) return;
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
      }
      debounceRef.current = window.setTimeout(async () => {
        debounceRef.current = null;
        const state = snapshotState();
        await saveCurrent(PROJECT_ID, state);
        historyRef.current = await commit(
          historyRef.current,
          PROJECT_ID,
          state
        );
        bumpHistoryView();
      }, AUTOSAVE_DEBOUNCE_MS);
    };

    const unsubApp = appStoreApi.subscribe(scheduleSave);
    const unsubStrudel = useStrudelStore.subscribe(scheduleSave);

    return () => {
      unsubApp();
      unsubStrudel();
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [ready, appStoreApi, snapshotState, bumpHistoryView]);

  const undo = useCallback(async () => {
    const result = await undoOp(historyRef.current);
    if (!result) return;
    historyRef.current = result.history;
    applyState(result.state);
    await saveCurrent(PROJECT_ID, result.state);
    bumpHistoryView();
  }, [applyState, bumpHistoryView]);

  const redo = useCallback(async () => {
    const result = await redoOp(historyRef.current);
    if (!result) return;
    historyRef.current = result.history;
    applyState(result.state);
    await saveCurrent(PROJECT_ID, result.state);
    bumpHistoryView();
  }, [applyState, bumpHistoryView]);

  const value = useMemo<PersistenceContextValue>(
    () => ({
      ready,
      storage,
      canUndo: canUndo(historyRef.current),
      canRedo: canRedo(historyRef.current),
      undo,
      redo,
    }),
    // historyRef is mutated but we bump a separate state to re-derive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ready, storage, undo, redo, historyRef.current.cursor, historyRef.current.entries.length]
  );

  return (
    <PersistenceContext.Provider value={value}>
      {children}
    </PersistenceContext.Provider>
  );
}

export function usePersistence(): PersistenceContextValue {
  const value = useContext(PersistenceContext);
  if (!value) {
    throw new Error('usePersistence called outside PersistenceProvider');
  }
  return value;
}
