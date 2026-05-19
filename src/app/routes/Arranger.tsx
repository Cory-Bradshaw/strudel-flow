/**
 * Arranger surface — placeholder for M6.
 *
 * The route exists so the routing shell is structurally complete in M1;
 * the section×part grid, codegen, and audio lifecycle (STRATA.md §6) all
 * land in M6.
 */

export function ArrangerRoute() {
  return (
    <main className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
      <h1 className="text-3xl font-semibold">Arranger</h1>
      <p className="max-w-xl text-center text-sm text-muted-foreground">
        The song-arrangement surface lands in M6. For now this route exists
        so the rest of the app can be wired against a real two-surface shell.
      </p>
    </main>
  );
}
