import React, { createContext, useCallback, useContext, useMemo, useRef, useSyncExternalStore } from 'react';
import { createInMemoryRepositories } from './inMemory';
import { createSQLiteRepositories } from './sqlite';
import type { Repositories, Repository } from './types';

const RepositoryContext = createContext<Repositories | null>(null);

export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  const repos = useMemo(
    () => process.env.NODE_ENV === 'test' ? createInMemoryRepositories() : createSQLiteRepositories(),
    [],
  );
  return (
    <RepositoryContext.Provider value={repos}>
      {children}
    </RepositoryContext.Provider>
  );
}

export function useRepositories(): Repositories {
  const ctx = useContext(RepositoryContext);
  if (!ctx) throw new Error('useRepositories must be used inside <RepositoryProvider>');
  return ctx;
}

export function useRepositoryList<T extends { id: string }>(repo: Repository<T, any, any>): T[] {
  const subscribe = useCallback((listener: () => void) => repo.subscribe(listener), [repo]);
  const getSnapshot = useCallback(() => repo.list(), [repo]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function shallowEqualRecord<T extends object>(a: T, b: T): boolean {
  const aKeys = Object.keys(a) as Array<keyof T>;
  const bKeys = Object.keys(b) as Array<keyof T>;
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every(key => Object.is(a[key], b[key]));
}

export function useRepositoryItem<T extends { id: string }>(repo: Repository<T, any, any>, id: string): T | undefined {
  const snapshotRef = useRef<T | undefined>(undefined);
  const subscribe = useCallback((listener: () => void) => repo.subscribe(listener), [repo]);
  const getSnapshot = useCallback(() => {
    const next = repo.list().find(item => item.id === id);
    const prev = snapshotRef.current;
    if (prev === next) return prev;
    if (prev && next && shallowEqualRecord(prev, next)) return prev;
    snapshotRef.current = next;
    return next;
  }, [repo, id]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
