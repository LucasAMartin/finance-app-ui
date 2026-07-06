import React, { useMemo } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { requireNativeView } from 'expo';
import { Host } from '@expo/ui';

export type NativeWallpaperCarouselItem = {
  id: string;
  title: string;
  image: string;
  isUploadPlaceholder?: boolean;
};

type NativeWallpaperCarouselViewProps = ViewProps & {
  wallpapersJson?: string;
  selectedId?: string;
  resetKey?: string;
  isDark?: boolean;
  bottomInset?: number;
  backgroundColor?: string;
  onSelect?: (event: { nativeEvent: { id: string } }) => void;
  onApply?: () => void;
  onAdd?: () => void;
};

const NativeWallpaperCarouselView = Platform.OS === 'ios'
  ? requireNativeView<NativeWallpaperCarouselViewProps>('GlassCard', 'NativeWallpaperCarouselView')
  : null;

export function NativeWallpaperCarousel({
  wallpapers,
  selectedId,
  resetKey,
  isDark,
  bottomInset,
  backgroundColor,
  onSelect,
  onApply,
  onAdd,
  style,
}: {
  wallpapers: NativeWallpaperCarouselItem[];
  selectedId: string;
  resetKey?: string;
  isDark: boolean;
  bottomInset?: number;
  backgroundColor?: string;
  onSelect: (id: string) => void;
  onApply: () => void;
  onAdd: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const wallpapersJson = useMemo(() => JSON.stringify(wallpapers), [wallpapers]);

  if (!NativeWallpaperCarouselView) {
    return <View style={style} />;
  }

  return (
    <Host
      colorScheme={isDark ? 'dark' : 'light'}
      ignoreSafeArea="all"
      style={[styles.host, style]}
    >
      <NativeWallpaperCarouselView
        wallpapersJson={wallpapersJson}
        selectedId={selectedId}
        resetKey={resetKey}
        isDark={isDark}
        bottomInset={bottomInset}
        backgroundColor={backgroundColor}
        onSelect={(event) => onSelect(event.nativeEvent.id)}
        onApply={onApply}
        onAdd={onAdd}
        style={StyleSheet.absoluteFill}
      />
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    width: '100%',
    overflow: 'hidden',
  },
});
