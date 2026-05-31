// Extracts one representative base color from a wallpaper image, used to build
// the scroll "floor" the wallpaper fades into. Runs at selection time (including
// for user-uploaded photos), so nothing here is precomputed or hardcoded.

import { Image } from 'react-native';
import ImageColors from 'react-native-image-colors';
import { DEFAULT_FLOOR_BASE } from './wallpaperPalette';

// Resolve a bundled asset (require(...) number) or { uri } to a plain URI string.
function toUri(source: number | { uri: string }): string | undefined {
  if (typeof source === 'number') return Image.resolveAssetSource(source)?.uri;
  return source?.uri;
}

export async function extractWallpaperColor(
  source: number | { uri: string },
): Promise<string> {
  const uri = toUri(source);
  if (!uri) return DEFAULT_FLOOR_BASE;
  try {
    const result = await ImageColors.getColors(uri, {
      fallback: DEFAULT_FLOOR_BASE,
      cache: true,
      key: uri,
      quality: 'low',
    });
    if (result.platform === 'ios') {
      // primary = most prominent foreground hue; background as fallback.
      return result.primary ?? result.background ?? DEFAULT_FLOOR_BASE;
    }
    if (result.platform === 'android') {
      return result.dominant ?? result.vibrant ?? DEFAULT_FLOOR_BASE;
    }
    // web
    return (result as any).dominant ?? DEFAULT_FLOOR_BASE;
  } catch {
    return DEFAULT_FLOOR_BASE;
  }
}
