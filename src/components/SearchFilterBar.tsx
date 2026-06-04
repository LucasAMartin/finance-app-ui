import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  Button,
  HStack,
  Host,
  Image,
  Text as SwiftText,
  TextField,
  type TextFieldRef,
  useNativeState,
} from '@expo/ui/swift-ui';
import {
  autocorrectionDisabled,
  background,
  buttonStyle,
  clipShape,
  foregroundStyle,
  frame,
  glassEffect,
  keyboardType,
  padding,
  submitLabel,
  textInputAutocapitalization,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Theme } from '../theme';
import { WallpaperP as P } from '../wallpaperPalette';
import { TYPE } from '../typography';
import { GlassCircleButton, SUPPORTS_GLASS } from './GlassButton';

const BAR_HEIGHT = 44;
const FILTER_SIZE = 44;

interface Props {
  theme: Theme;
  /** Card-interior palette (adaptive: dark text on light frosted glass). */
  p: P;
  query: string;
  onChangeQuery: (next: string) => void;
  /** Number of active scope filters; drives the filter button's tinted state + badge. */
  activeCount: number;
  calendarActive?: boolean;
  onOpenCalendar: () => void;
  onOpenFilter: () => void;
  placeholder?: string;
}

/**
 * The History screen's search + filter row, built from native SwiftUI controls.
 * The search box is a real `TextField` (so it gets the system caret, keyboard,
 * and dictation affordances) composed with a magnifying-glass and a native clear
 * button inside a capsule. The filter trigger is a Liquid Glass button matching
 * the home-screen quick actions; it still opens the rich FilterSheet.
 */
export function SearchFilterBar({
  theme, p, query, onChangeQuery, activeCount, calendarActive = false, onOpenCalendar, onOpenFilter, placeholder = 'Search transactions…',
}: Props) {
  // Text lives on the native side so each keystroke renders on the UI thread
  // rather than round-tripping the bridge before the glyph appears. `onTextChange`
  // mirrors it back to React state for the downstream (debounced) repo scans.
  const searchState = useNativeState(query);
  const fieldRef = useRef<TextFieldRef>(null);
  // Last value the native field reported to JS — lets us tell a user keystroke
  // apart from an external `query` change (e.g. an applied initial filter, or the
  // clear button) so we only push the latter back down to the field.
  const lastReportedRef = useRef(query);

  useEffect(() => {
    if (query !== lastReportedRef.current) {
      lastReportedRef.current = query;
      searchState.value = query;
    }
  }, [query, searchState]);

  const active = activeCount > 0;
  const glassTint = theme.dark ? 'rgba(20,20,24,0.55)' : 'rgba(255,255,255,0.92)';
  const fillColor = theme.dark ? 'rgba(255,255,255,0.10)' : 'rgba(14,12,24,0.06)';
  // On-glass icon/text colors mirror quickActionColors: white in dark mode, near-black in light.
  const iconFg     = theme.dark ? (p.text as string) : '#0E0C18';
  const iconFgSec  = theme.dark ? (p.textSec as string) : 'rgba(14,12,24,0.50)';
  const iconFgTer  = theme.dark ? (p.textTer as string) : 'rgba(14,12,24,0.35)';
  const filterIconColor = active ? (theme.dark ? theme.bg : theme.surface) : iconFg;
  const filterGlassTint = active ? theme.accent.dot : glassTint;
  const calendarIconColor = calendarActive ? (theme.dark ? theme.bg : theme.surface) : iconFg;
  const calendarGlassTint = calendarActive ? theme.accent.dot : glassTint;

  const colorScheme = theme.dark ? 'dark' : 'light';

  return (
    <View style={styles.row}>
      <Host style={styles.searchHost} colorScheme={colorScheme}>
        <HStack
          spacing={8}
          modifiers={[
            frame({ height: BAR_HEIGHT }),
            padding({ horizontal: 14 }),
            ...(SUPPORTS_GLASS
              ? [glassEffect({ glass: { variant: 'regular', tint: glassTint }, shape: 'capsule' })]
              : [background(fillColor), clipShape('capsule')]),
          ]}
        >
          <Image systemName="magnifyingglass" size={16} color={iconFgSec} />
          <TextField
            ref={fieldRef}
            text={searchState}
            onTextChange={(next) => {
              lastReportedRef.current = next;
              onChangeQuery(next);
            }}
            modifiers={[
              keyboardType('web-search'),
              autocorrectionDisabled(),
              submitLabel('search'),
              textInputAutocapitalization('never'),
              foregroundStyle(iconFg),
              tint(theme.accent.dot),
            ]}
          >
            <TextField.Placeholder>
              <SwiftText modifiers={[foregroundStyle(iconFgTer)]}>{placeholder}</SwiftText>
            </TextField.Placeholder>
          </TextField>
          {query.length > 0 && (
            <Button onPress={() => onChangeQuery('')} modifiers={[buttonStyle('plain')]}>
              <Image systemName="xmark.circle.fill" size={16} color={iconFgTer} />
            </Button>
          )}
        </HStack>
      </Host>

      <View style={styles.filterWrap}>
        {SUPPORTS_GLASS ? (
          <GlassCircleButton
            onPress={onOpenCalendar}
            systemImage="calendar"
            size={FILTER_SIZE}
            iconSize={18}
            iconColor={calendarIconColor}
            glassTint={calendarGlassTint}
            colorScheme={colorScheme}
            accessibilityLabel={calendarActive ? 'Calendar, date selected' : 'Calendar'}
          />
        ) : (
          <Host style={styles.filterHost} colorScheme={colorScheme}>
            <Button
              onPress={onOpenCalendar}
              modifiers={[
                buttonStyle('plain'),
                frame({ width: FILTER_SIZE, height: FILTER_SIZE }),
                background(calendarActive ? theme.accent.dot : fillColor),
                clipShape('circle'),
              ]}
            >
              <Image systemName="calendar" size={18} color={calendarIconColor} />
            </Button>
          </Host>
        )}
      </View>

      <View style={styles.filterWrap}>
        {SUPPORTS_GLASS ? (
          <GlassCircleButton
            onPress={onOpenFilter}
            systemImage="line.3.horizontal.decrease"
            size={FILTER_SIZE}
            iconSize={18}
            iconColor={filterIconColor}
            glassTint={filterGlassTint}
            colorScheme={colorScheme}
            accessibilityLabel={active ? `Filters, ${activeCount} active` : 'Filters'}
          />
        ) : (
          <Host style={styles.filterHost} colorScheme={colorScheme}>
            <Button
              onPress={onOpenFilter}
              modifiers={[
                buttonStyle('plain'),
                frame({ width: FILTER_SIZE, height: FILTER_SIZE }),
                background(active ? theme.accent.dot : fillColor),
                clipShape('circle'),
              ]}
            >
              <Image systemName="line.3.horizontal.decrease" size={18} color={filterIconColor} />
            </Button>
          </Host>
        )}
        {active && (
          <View
            pointerEvents="none"
            style={[styles.badge, { backgroundColor: theme.accent.dot, borderColor: theme.surface }]}
          >
            <Text style={[styles.badgeText, { color: theme.accent.ink }]}>{activeCount}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchHost: {
    flex: 1,
    height: BAR_HEIGHT,
  },
  filterWrap: {
    width: FILTER_SIZE,
    height: FILTER_SIZE,
  },
  filterHost: {
    width: FILTER_SIZE,
    height: FILTER_SIZE,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { ...TYPE.labelPlain },
});
