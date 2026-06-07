export interface SQLiteRunResult {
  changes: number;
  lastInsertRowId?: number;
  lastInsertRowid?: number | bigint;
}

export interface SQLiteDatabaseLike {
  execSync(sql: string): void;
  runSync(sql: string, ...params: unknown[]): SQLiteRunResult;
  getFirstSync<T>(sql: string, ...params: unknown[]): T | null;
  getAllSync<T>(sql: string, ...params: unknown[]): T[];
  withTransactionSync(callback: () => void): void;
  closeSync?: () => void;
}

declare const require: (id: string) => any;

function loadNodeSQLite() {
  const nodeRequire = eval('require') as typeof require;
  return nodeRequire('node:sqlite');
}

class NodeSQLiteDatabase implements SQLiteDatabaseLike {
  private database: any;

  constructor(name: string) {
    const { DatabaseSync } = loadNodeSQLite();
    this.database = new DatabaseSync(name);
  }

  execSync(sql: string): void {
    this.database.exec(sql);
  }

  runSync(sql: string, ...params: unknown[]): SQLiteRunResult {
    const result = this.database.prepare(sql).run(...params);
    return {
      changes: Number(result.changes ?? 0),
      lastInsertRowId: Number(result.lastInsertRowid ?? 0),
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  getFirstSync<T>(sql: string, ...params: unknown[]): T | null {
    return this.database.prepare(sql).get(...params) as T | null;
  }

  getAllSync<T>(sql: string, ...params: unknown[]): T[] {
    return this.database.prepare(sql).all(...params) as T[];
  }

  withTransactionSync(callback: () => void): void {
    this.database.exec('BEGIN');
    try {
      callback();
      this.database.exec('COMMIT');
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  closeSync(): void {
    this.database.close();
  }
}

export function openSQLiteDatabaseSync(name: string): SQLiteDatabaseLike {
  if (process.env.NODE_ENV === 'test') {
    return new NodeSQLiteDatabase(name);
  }
  const SQLite = require('expo-sqlite');
  return SQLite.openDatabaseSync(name);
}
