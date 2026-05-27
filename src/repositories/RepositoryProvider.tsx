import React, { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import { createInMemoryRepositories } from './inMemory';
import type { Repositories, Repository } from './types';

const RepositoryContext = createContext<Repositories | null>(null);

export function RepositoryProvider({ children }: { children: React.ReactNode }) {
  const repos = useMemo(() => createInMemoryRepositories(), []);
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
