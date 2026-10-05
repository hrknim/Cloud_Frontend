export type AuthUser = {
  id: string; handle: string; displayName: string; email?: string; avatarUrl?: string; role?: string;
};

/** Browser-memory cache only. Never persist session data to storage or trust it for authorization. */
export function createUserSessionCache(request: typeof fetch = (...args) => fetch(...args)) {
  let user: AuthUser | null = null;
  let loaded = false;
  let pending: Promise<void> | undefined;
  let generation = 0;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach(listener => listener());
  const getSnapshot = () => user;
  const load = () => {
    if (pending) return pending;
    if (loaded) return Promise.resolve();
    const version = generation;
    const operation = (async () => {
      let next: AuthUser | null = null;
      try {
        const response = await request("/api/user", { credentials: "same-origin", cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          const result = data?.result;
          if (typeof result?.id === "string" && typeof result.handle === "string" && typeof result.displayName === "string") next = result;
        }
      } catch { /* A failed lookup must not leave stale account information visible. */ }
      if (version !== generation) return;
      loaded = true; user = next; emit();
    })();
    pending = operation;
    void operation.finally(() => { if (pending === operation) pending = undefined; });
    return operation;
  };
  return {
    getSnapshot,
    // Server renders do not read browser-cached account information.
    getServerSnapshot: () => null,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load,
    clear: () => { generation++; pending = undefined; loaded = true; user = null; emit(); },
  };
}

export const userSession = createUserSessionCache();
