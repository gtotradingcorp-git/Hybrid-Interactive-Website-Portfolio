import {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

interface PersistedEnvelope<T> {
  v: number;
  data: T;
  savedAt?: number;
}

export interface RestorationInfo {
  restoredAt: number | null;
}

function buildKey(name: string, version: number): string {
  return `demo:${name}:v${version}`;
}

function readPersisted<T>(
  name: string,
  version: number,
): { data: T; savedAt: number } | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(buildKey(name, version));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as PersistedEnvelope<T> | unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "v" in parsed &&
      "data" in parsed &&
      (parsed as PersistedEnvelope<T>).v === version
    ) {
      const envelope = parsed as PersistedEnvelope<T>;
      return { data: envelope.data, savedAt: envelope.savedAt ?? 0 };
    }
  } catch {
    // Corrupt JSON or storage access denied — fall back to initial state.
  }
  return undefined;
}

function writePersisted<T>(name: string, version: number, data: T): void {
  if (typeof window === "undefined") return;
  try {
    const envelope: PersistedEnvelope<T> = { v: version, data, savedAt: Date.now() };
    window.localStorage.setItem(buildKey(name, version), JSON.stringify(envelope));
  } catch {
    // Quota exceeded or storage disabled — silently ignore so the demo keeps working.
  }
}

function removePersisted(name: string, version: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(buildKey(name, version));
  } catch {
    // Ignore removal failures.
  }
}

/**
 * useState-compatible hook that mirrors its value to localStorage under
 * `demo:<name>:v<version>`. Reset() removes the persisted key AND restores
 * the seed value, so a clean reset leaves no storage entry until the visitor
 * interacts with the demo again.
 *
 * Returns a 4th element with restoration metadata: `restoredAt` is the
 * timestamp (ms) when the data was last saved, or `null` if no persisted
 * state existed (first visit) or after a reset.
 */
export function usePersistentDemoState<T>(
  name: string,
  version: number,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>, () => void, RestorationInfo] {
  const initialRef = useRef<T | (() => T)>(initial);
  const computeInitial = useCallback(
    (): T =>
      typeof initialRef.current === "function"
        ? (initialRef.current as () => T)()
        : (initialRef.current as T),
    [],
  );

  const [restoredAt, setRestoredAt] = useState<number | null>(null);

  const [state, setStateInternal] = useState<T>(() => {
    const persisted = readPersisted<T>(name, version);
    if (persisted !== undefined) {
      return persisted.data;
    }
    return computeInitial();
  });

  useEffect(() => {
    const persisted = readPersisted<T>(name, version);
    if (persisted !== undefined) {
      if (persisted.savedAt > 0) {
        setRestoredAt(persisted.savedAt);
      } else {
        const now = Date.now();
        writePersisted(name, version, persisted.data);
        setRestoredAt(now);
      }
    }
    // Only run on mount — name/version are stable for the lifetime of a demo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When set, the next persist effect run is skipped (used by reset() to
  // avoid immediately re-writing seeded defaults after wiping storage).
  const skipNextPersistRef = useRef(false);

  useEffect(() => {
    if (skipNextPersistRef.current) {
      skipNextPersistRef.current = false;
      return;
    }
    writePersisted(name, version, state);
  }, [name, version, state]);

  const setState: Dispatch<SetStateAction<T>> = useCallback((value) => {
    // Any deliberate state change after a reset must persist normally, even
    // if the post-reset effect didn't run (e.g. seed value already equalled
    // the previous state).
    skipNextPersistRef.current = false;
    setStateInternal(value);
  }, []);

  const reset = useCallback(() => {
    removePersisted(name, version);
    skipNextPersistRef.current = true;
    setStateInternal(computeInitial());
    setRestoredAt(null);
  }, [name, version, computeInitial]);

  return [state, setState, reset, { restoredAt }];
}
