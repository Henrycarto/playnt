import { useCallback, useEffect, useState } from 'react';
import { api, RequestError, type Health } from './api';

let healthCache: Promise<Health> | null = null;
export function useHealth(): Health | null {
  const [h, setH] = useState<Health | null>(null);
  useEffect(() => {
    healthCache ??= api.health();
    healthCache.then(setH, () => { healthCache = null; });
  }, []);
  return h;
}

export type Load<T> = { state: 'loading' } | { state: 'error'; error: RequestError } | { state: 'ready'; data: T };

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): [Load<T>, () => void, (data: T) => void] {
  const [s, setS] = useState<Load<T>>({ state: 'loading' });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setS((prev) => (prev.state === 'ready' ? prev : { state: 'loading' }));
    fn().then(
      (data) => { if (live) setS({ state: 'ready', data }); },
      (error: unknown) => { if (live) setS({ state: 'error', error: error instanceof RequestError ? error : new RequestError(0, { error: String(error) }) }); },
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  const set = useCallback((data: T) => setS({ state: 'ready', data }), []);
  return [s, reload, set];
}

export function useTitle(title: string) {
  useEffect(() => { document.title = `${title} | Playnt`; }, [title]);
}
