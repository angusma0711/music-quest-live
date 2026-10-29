import { useEffect, useState } from 'react';
import { onAuthStateChanged, type Auth, type User } from 'firebase/auth';
import { onValue, ref, type Database } from 'firebase/database';

/** Live value at a database path; `null` path = not subscribed. Errors (e.g. permission) yield null. */
export function useDbValue<T>(db: Database, path: string | null): { value: T | null; loading: boolean } {
  const [state, setState] = useState<{ path: string | null; value: T | null; loading: boolean }>({ path, value: null, loading: !!path });
  useEffect(() => {
    if (!path) return;
    return onValue(
      ref(db, path),
      (snap) => setState({ path, value: snap.val() as T | null, loading: false }),
      () => setState({ path, value: null, loading: false }),
    );
  }, [db, path]);
  // Drop a value that belongs to a previous path while the new one loads.
  if (state.path !== path) return { value: null, loading: !!path };
  return { value: state.value, loading: state.loading };
}

export function useAuthUser(auth: Auth): { user: User | null; ready: boolean } {
  const [state, setState] = useState<{ user: User | null; ready: boolean }>({ user: auth.currentUser, ready: false });
  useEffect(() => onAuthStateChanged(auth, (user) => setState({ user, ready: true })), [auth]);
  return state;
}

/** True while the client has a live connection to the Realtime Database. */
export function useConnected(db: Database): boolean {
  const { value } = useDbValue<boolean>(db, '.info/connected');
  return value === true;
}

export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private browsing: the anonymous auth session still lets the pupil rejoin by code.
  }
}
