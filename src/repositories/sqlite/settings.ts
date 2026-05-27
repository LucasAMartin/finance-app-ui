import { getDb, json } from './db';
import { SQLiteRepository } from './base';
import type { AppSettings } from '../types';

interface SettingsRow {
  id: 'settings';
  theme_dark: number;
  accent_key: AppSettings['accentKey'];
  card_style: AppSettings['cardStyle'];
  wallpaper_id: string | null;
  meta: string | null;
}

export class SQLiteSettingsRepo extends SQLiteRepository<AppSettings, AppSettings, Partial<Omit<AppSettings, 'id'>>> {
  protected readAll(): AppSettings[] {
    return getDb().getAllSync<SettingsRow>('SELECT * FROM settings WHERE id = ?', 'settings').map(row => ({
      id: 'settings',
      themeDark: Boolean(row.theme_dark),
      accentKey: row.accent_key,
      cardStyle: row.card_style,
      wallpaperId: row.wallpaper_id ?? undefined,
      meta: row.meta ? JSON.parse(row.meta) : undefined,
    }));
  }

  create(input: AppSettings): AppSettings {
    getDb().runSync(
      'INSERT OR REPLACE INTO settings (id, theme_dark, accent_key, card_style, wallpaper_id, meta) VALUES (?, ?, ?, ?, ?, ?)',
      input.id,
      input.themeDark ? 1 : 0,
      input.accentKey,
      input.cardStyle,
      input.wallpaperId ?? null,
      json(input.meta),
    );
    this.emit();
    return this.get(input.id)!;
  }

  update(id: string, patch: Partial<Omit<AppSettings, 'id'>>): AppSettings | undefined {
    const current = this.get(id);
    if (!current) return undefined;
    const next = { ...current, ...patch };
    getDb().runSync(
      'UPDATE settings SET theme_dark = ?, accent_key = ?, card_style = ?, wallpaper_id = ?, meta = ? WHERE id = ?',
      next.themeDark ? 1 : 0,
      next.accentKey,
      next.cardStyle,
      next.wallpaperId ?? null,
      json(next.meta),
      id,
    );
    this.emit();
    return this.get(id);
  }

  delete(id: string): void {
    getDb().runSync('DELETE FROM settings WHERE id = ?', id);
    this.emit();
  }
}
