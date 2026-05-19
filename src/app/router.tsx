/**
 * Minimal router for Strata's two surfaces.
 *
 * Two routes, History API only, no dependency. Suits a hosted SPA behind
 * Caddy where the static file server can be configured to fall back to
 * index.html for unknown paths (covered in §12).
 *
 * Public API: useRoute(), navigate(), <Link>.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

export type RouteName = 'flow' | 'arranger';

const PATH_TO_ROUTE: Record<string, RouteName> = {
  '/': 'flow',
  '/flow': 'flow',
  '/arranger': 'arranger',
};

const ROUTE_TO_PATH: Record<RouteName, string> = {
  flow: '/',
  arranger: '/arranger',
};

function pathToRoute(path: string): RouteName {
  return PATH_TO_ROUTE[path] ?? 'flow';
}

interface RouterValue {
  route: RouteName;
  navigate: (to: RouteName) => void;
}

const RouterContext = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<RouteName>(() =>
    pathToRoute(window.location.pathname)
  );

  useEffect(() => {
    const onPop = () => setRoute(pathToRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: RouteName) => {
    const path = ROUTE_TO_PATH[to];
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path);
    }
    setRoute(to);
  }, []);

  const value = useMemo(() => ({ route, navigate }), [route, navigate]);
  return (
    <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
  );
}

export function useRoute(): RouterValue {
  const value = useContext(RouterContext);
  if (!value) throw new Error('useRoute called outside RouterProvider');
  return value;
}

export function Link({
  to,
  children,
  className,
}: {
  to: RouteName;
  children: ReactNode;
  className?: string;
}) {
  const { navigate } = useRoute();
  return (
    <a
      href={ROUTE_TO_PATH[to]}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
