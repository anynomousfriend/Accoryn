import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDemoUsers, publishDemoUser } from "./demo-users.ts";
export type DemoDirectoryState = {
  accounts: string[];
  loading: boolean;
  error: boolean;
  refresh: () => void;
};
export function useDemoUsers() {
  const [data, setData] = useState({
    accounts: [] as string[],
    loading: true,
    error: false,
  });
  const [publication, setPublication] = useState("");
  const alive = useRef(true),
    available = useRef(false),
    generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const refresh = useCallback(() => {
    request.current?.abort();
    const controller = new AbortController(),
      id = ++generation.current;
    request.current = controller;
    setData((old) => ({ ...old, loading: true }));
    void fetchDemoUsers(controller.signal)
      .then((accounts) => {
        if (alive.current && generation.current === id) {
          available.current = true;
          setData({ accounts, loading: false, error: false });
        }
      })
      .catch(() => {
        if (alive.current && generation.current === id) {
          available.current = false;
          setData((old) => ({ ...old, loading: false, error: true }));
        }
      })
      .finally(() => {
        if (generation.current === id) request.current = null;
      });
  }, []);
  const publish = useCallback((accountId: string) => {
    setPublication("Sharing your public account ID with this demo…");
    void publishDemoUser(accountId)
      .then((accounts) => {
        if (!alive.current) return;
        ++generation.current;
        request.current?.abort();
        request.current = null;
        available.current = true;
        setData({ accounts, loading: false, error: false });
        setPublication("");
      })
      .catch(() => {
        if (alive.current)
          setPublication(
            "Your account is ready, but the demo list could not be updated. Select your saved local account again to retry sharing its public ID.",
          );
      });
  }, []);
  useEffect(() => {
    alive.current = true;
    refresh();
    const timer = setInterval(() => {
      if (available.current && !request.current && !document.hidden) refresh();
    }, 5000);
    return () => {
      alive.current = false;
      ++generation.current;
      request.current?.abort();
      clearInterval(timer);
    };
  }, [refresh]);
  return {
    directory: { ...data, refresh } satisfies DemoDirectoryState,
    publish,
    publication,
  };
}
