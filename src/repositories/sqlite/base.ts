import type { RepoListener, Repository } from '../types';

export abstract class SQLiteRepository<T extends { id: string }, CreateInput = Omit<T, 'id'>, UpdateInput = Partial<Omit<T, 'id'>>>
  implements Repository<T, CreateInput, UpdateInput> {
  private listeners = new Set<RepoListener>();
  private cache: T[] | null = null;

  list(): T[] {
    if (!this.cache) this.cache = this.readAll();
    return this.cache;
  }

  get(id: string): T | undefined {
    return this.list().find(row => row.id === id);
  }

  abstract create(input: CreateInput): T;
  abstract update(id: string, patch: UpdateInput): T | undefined;
  abstract delete(id: string): void;
  protected abstract readAll(): T[];

  subscribe(listener: RepoListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  protected emit() {
    this.cache = this.readAll();
    this.listeners.forEach(listener => listener());
  }
}
