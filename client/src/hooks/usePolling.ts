import { useEffect, useRef, useState, useCallback } from "react";

type Fetcher<T> = () => Promise<T>;

export function usePolling<T>(fetcher: Fetcher<T>, intervalMs: number, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const running = useRef(false);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const tick = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      const v = await fetcherRef.current();
      if (!alive.current) return;
      setData(v);
      setError(null);
    } catch (e) {
      if (!alive.current) return;
      setError(e);
    } finally {
      running.current = false;
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    tick();
    const id = setInterval(tick, intervalMs);
    return () => {
      alive.current = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps]);

  return { data, error, loading, refresh: tick };
}
