// Wallpaper registry — auto-discovered from assets/wallpapers/.
// Drop a new folder in assets/wallpapers/ and add images inside it; the
// folder becomes a tab and each image becomes a tile, with no code changes.
// Requires `transformer.unstable_allowRequireContext = true` in metro.config.js.

export interface Wallpaper {
  id: string;
  name: string;
  source: number | { uri: string };
}

export const CUSTOM_WALLPAPER_ID = 'custom';

export interface WallpaperTab {
  id: string;
  label: string;
  items: Wallpaper[];
}

// Metro's require.context is typed in @types/webpack-env via global declaration.
// We cast through `any` since RN types don't ship the signature.
const ctx = (require as any).context(
  '../assets/wallpapers',
  true,
  /\.(jpe?g|png|webp)$/i,
);

const prettify = (raw: string) =>
  raw
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());

const grouped: Record<string, Wallpaper[]> = {};
for (const key of ctx.keys()) {
  // Keys look like './apple/apple-1.jpg' or './landscape/foo.png'.
  const stripped = key.replace(/^\.\//, '');
  const parts = stripped.split('/');
  if (parts.length < 2) continue; // skip files directly under assets/wallpapers/

  const folder = parts[0];
  const fileName = parts[parts.length - 1];
  const base = fileName.replace(/\.[^.]+$/, '');

  const wallpaper: Wallpaper = {
    id: `${folder}/${base}`,
    name: prettify(base),
    source: ctx(key) as number,
  };

  if (!grouped[folder]) grouped[folder] = [];
  grouped[folder].push(wallpaper);
}

export const WALLPAPER_TABS: WallpaperTab[] = Object.keys(grouped)
  .sort((a, b) => a.localeCompare(b))
  .map(folder => ({
    id: folder,
    label: prettify(folder),
    items: grouped[folder].sort((a, b) => a.id.localeCompare(b.id)),
  }));

const ALL_WALLPAPERS: Wallpaper[] = WALLPAPER_TABS.flatMap(t => t.items);

export const DEFAULT_WALLPAPER_ID =
  ALL_WALLPAPERS[0]?.id ?? '';

export function findWallpaperById(id: string): Wallpaper {
  return ALL_WALLPAPERS.find(w => w.id === id) ?? ALL_WALLPAPERS[0];
}

export function findTabForWallpaper(id: string): WallpaperTab {
  return (
    WALLPAPER_TABS.find(t => t.items.some(w => w.id === id)) ?? WALLPAPER_TABS[0]
  );
}
