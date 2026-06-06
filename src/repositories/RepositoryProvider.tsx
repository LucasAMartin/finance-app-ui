import React, { createContext, useCallback, useContext, useMemo, useRef, useSyncExternalStore } from 'react';
import { createInMemoryRepositories } from './inMemory';
import { createSQLiteRepositories } from './sqlite';
import type { LedgerMember, Repositories, Repository } from './types';

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

export function useLedgerMembers(): LedgerMember[] {
  const { sessionRepo } = useRepositories();
  const snapshotRef = useRef<LedgerMember[]>([]);
  const snapshotKeyRef = useRef('');
  const subscribe = useCallback((listener: () => void) => sessionRepo.subscribe(listener), [sessionRepo]);
  const getSnapshot = useCallback(() => {
    const session = sessionRepo.getSession();
    const next = sessionRepo.listMembers(session.activeLedgerId);
    const key = ledgerMembersSnapshotKey(next);
    if (snapshotKeyRef.current === key) return snapshotRef.current;
    snapshotKeyRef.current = key;
    snapshotRef.current = next;
    return next;
  }, [sessionRepo]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function ledgerMembersSnapshotKey(members: LedgerMember[]): string {
  return members
    .map(member => [
      member.id,
      member.ledgerId,
      member.userId,
      member.displayName,
      member.role,
      member.status,
      member.allowOthersToEditMyItems ? '1' : '0',
      member.updatedAt ?? '',
      member.deletedAt ?? '',
    ].join('\u001f'))
    .join('\u001e');
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
