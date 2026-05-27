const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable require.context so wallpaper folders are auto-discovered.
config.transformer.unstable_allowRequireContext = true;

// Recognize uppercase image extensions as assets. Without this, files like
// IMG_*.JPG dropped from photo libraries are ignored by Metro's bundler
// even though they exist on disk.
const extraAssetExts = ['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'BMP'];
config.resolver.assetExts = Array.from(
  new Set([...config.resolver.assetExts, ...extraAssetExts]),
);

module.exports = config;
