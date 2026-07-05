import React from 'react';
import {
  ActionSheetIOS,
  Alert,
  Animated,
  Image as RNImage,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Button as SwiftButton,
  Form as SwiftForm,
  Group as SwiftGroup,
  Host,
  LabeledContent,
  RNHostView,
  Section as SwiftSection,
  Text as SwiftText,
} from '@expo/ui/swift-ui';
import {
  background,
  foregroundStyle,
  listStyle,
  listRowBackground,
  listRowInsets,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';

import { ScreenExitButton } from '../components/GlassButton';
import { Icon } from '../components/Icon';
import type { LedgerMember } from '../repositories/types';
import { Theme } from '../theme';
import { FONT_WEIGHT, TYPE } from '../typography';
import { LAYOUT, SPACE } from '../spacing';

interface Props {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
  member?: LedgerMember;
  onProfileChange: (patch: { displayName?: string; profileImageDataUri?: string | null }) => void;
  onOpenSharing: () => void;
}

export function ProfileScreen({
  theme,
  visible,
  onClose,
  member,
  onProfileChange,
  onOpenSharing,
}: Props) {
  const insets = useSafeAreaInsets();
  const anim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: visible ? 260 : 200,
      useNativeDriver: true,
    }).start();
  }, [anim, visible]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  const displayName = member?.displayName ?? 'You';
  const initial = displayName.trim().slice(0, 1).toUpperCase() || 'U';
  const profileImageDataUri = memberProfileImageDataUri(member);
  const sharingRoleLabel = member?.role === 'owner' ? 'Owner' : 'Member';
  const itemEditingLabel = member?.allowOthersToEditMyItems
    ? 'Others can edit items you add'
    : 'Only you can edit items you add';

  const editName = React.useCallback(() => {
    Alert.prompt(
      'Edit Name',
      'This is the name other members see on shared items.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (value?: string) => {
            const next = value?.trim();
            if (!next) {
              Alert.alert('Name required', 'Enter a name to show on your shared profile.');
              return;
            }
            if (next !== displayName) onProfileChange({ displayName: next });
          },
        },
      ],
      'plain-text',
      displayName,
    );
  }, [displayName, onProfileChange]);

  const choosePhoto = React.useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photo access needed', 'Allow photo access to choose a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.35,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset?.base64) {
      Alert.alert('Photo unavailable', 'This photo could not be saved as a synced avatar.');
      return;
    }
    const mimeType = asset.mimeType ?? 'image/jpeg';
    onProfileChange({ profileImageDataUri: `data:${mimeType};base64,${asset.base64}` });
  }, [onProfileChange]);

  const removePhoto = React.useCallback(() => {
    onProfileChange({ profileImageDataUri: null });
  }, [onProfileChange]);

  const openPhotoActions = React.useCallback(() => {
    if (Platform.OS === 'ios') {
      const options = profileImageDataUri
        ? ['Change Photo', 'Remove Photo', 'Cancel']
        : ['Add Photo', 'Cancel'];
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: profileImageDataUri ? 1 : undefined,
          userInterfaceStyle: theme.dark ? 'dark' : 'light',
        },
        buttonIndex => {
          if (profileImageDataUri) {
            if (buttonIndex === 0) choosePhoto();
            if (buttonIndex === 1) removePhoto();
            return;
          }
          if (buttonIndex === 0) choosePhoto();
        },
      );
      return;
    }

    Alert.alert('Profile Photo', undefined, [
      { text: profileImageDataUri ? 'Change Photo' : 'Add Photo', onPress: choosePhoto },
      ...(profileImageDataUri ? [{ text: 'Remove Photo', style: 'destructive' as const, onPress: removePhoto }] : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [choosePhoto, profileImageDataUri, removePhoto, theme.dark]);

  const openSharingAndClose = React.useCallback(() => {
    onClose();
    onOpenSharing();
  }, [onClose, onOpenSharing]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, { zIndex: 80, opacity: anim, transform: [{ translateY }] }]}
    >
      <View style={[styles.root, { backgroundColor: theme.bg }]}>
        <View style={[styles.header, { paddingTop: insets.top + SPACE.sm, backgroundColor: theme.bg }]}>
          <ScreenExitButton
            variant="back"
            onPress={onClose}
            tint={theme.text}
            fallbackBg={theme.chipBg}
            accessibilityLabel="Back"
          />
          <Text style={[styles.headerTitle, { color: theme.text }]}>Account</Text>
          <View style={styles.headerSpacer} />
          <View style={[styles.headerDivider, { backgroundColor: theme.hairline }]} />
        </View>

        <View style={[styles.content, { paddingTop: insets.top + 52 }]}>
          <Host
            style={styles.formHost}
            colorScheme={theme.dark ? 'dark' : 'light'}
            ignoreSafeArea="keyboard"
          >
            <SwiftForm
              modifiers={[
                listStyle('insetGrouped'),
                scrollContentBackground('hidden'),
                background(theme.bg),
                tint(theme.accent.dot),
              ]}
            >
              <SwiftGroup
                modifiers={[
                  listRowBackground('clear'),
                  listRowInsets({ top: 0, leading: 0, bottom: 0, trailing: 0 }),
                ]}
              >
                <RNHostView matchContents>
                  <View style={styles.hero}>
                    <Pressable
                      onPress={openPhotoActions}
                      accessibilityRole="button"
                      accessibilityLabel={profileImageDataUri ? 'Change profile photo' : 'Add profile photo'}
                      accessibilityHint="Opens photo options"
                      style={({ pressed }) => [
                        styles.avatarTapTarget,
                        { transform: [{ scale: pressed ? 0.985 : 1 }] },
                      ]}
                    >
                      <View style={[styles.avatar, { backgroundColor: theme.accent.fill }]}>
                        {profileImageDataUri ? (
                          <RNImage source={{ uri: profileImageDataUri }} style={styles.avatarImage} />
                        ) : (
                          <Text style={[styles.avatarInitial, { color: theme.accent.ink }]}>{initial}</Text>
                        )}
                      </View>
                      <View
                        style={[styles.avatarBadge, { backgroundColor: theme.surface, borderColor: theme.hairline }]}
                      >
                        <Icon name="chevDown" size={8} color={theme.textTer} stroke={2.4} />
                      </View>
                    </Pressable>
                    <Pressable
                      onPress={editName}
                      accessibilityRole="button"
                      accessibilityLabel="Edit profile name"
                      style={({ pressed }) => ({ opacity: pressed ? 0.62 : 1 })}
                    >
                      <Text style={[TYPE.display, styles.name, { color: theme.text }]} numberOfLines={1}>
                        {displayName}
                      </Text>
                    </Pressable>
                  </View>
                </RNHostView>
              </SwiftGroup>
              <SwiftSection>
                <LabeledContent label="Display Name">
                  <SwiftButton label={displayName} onPress={editName} />
                </LabeledContent>
                <LabeledContent label="Visible In">
                  <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                    Shared ledgers
                  </SwiftText>
                </LabeledContent>
              </SwiftSection>
              <SwiftSection>
                <SwiftButton
                  label="Data & Sharing"
                  systemImage="person.2.badge.gearshape"
                  onPress={openSharingAndClose}
                />
                <LabeledContent label="Sharing Role">
                  <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                    {sharingRoleLabel}
                  </SwiftText>
                </LabeledContent>
                <LabeledContent label="Item Editing">
                  <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                    {itemEditingLabel}
                  </SwiftText>
                </LabeledContent>
              </SwiftSection>
            </SwiftForm>
          </Host>
        </View>
      </View>
    </Animated.View>
  );
}

function memberProfileImageDataUri(member?: LedgerMember): string | undefined {
  const value = member?.meta?.profileImageDataUri;
  return typeof value === 'string' && value.startsWith('data:image/') ? value : undefined;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: LAYOUT.screenGutter,
    paddingBottom: SPACE.sm,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    ...TYPE.pageTitle,
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },
  headerDivider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
  },
  content: {
    flex: 1,
  },
  hero: {
    alignItems: 'center',
    paddingHorizontal: LAYOUT.screenGutter,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.sm,
  },
  avatarTapTarget: {
    width: 116,
    height: 116,
  },
  avatar: {
    width: 116,
    height: 116,
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 116,
    height: 116,
  },
  avatarInitial: {
    fontSize: 46,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: 0,
  },
  name: {
    marginTop: SPACE.md,
    textAlign: 'center',
    maxWidth: 300,
  },
  formHost: {
    flex: 1,
    minHeight: 360,
  },
});
