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
import type { LedgerMember } from '../repositories/types';
import { Theme } from '../theme';
import { TYPE } from '../typography';
import { RADIUS } from '../radius';
import { LAYOUT, SPACE } from '../spacing';

interface Props {
  theme: Theme;
  visible: boolean;
  onClose: () => void;
  member?: LedgerMember;
  iCloudSyncEnabled: boolean;
  onProfileChange: (patch: { displayName?: string; profileImageDataUri?: string | null }) => void;
  onOpenSharing: () => void;
}

export function ProfileScreen({
  theme,
  visible,
  onClose,
  member,
  iCloudSyncEnabled,
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
  const accessLabel = member?.role === 'owner' ? 'Can manage sharing' : 'Shared member';
  const profileSubtitle = iCloudSyncEnabled ? 'iCloud profile' : 'Local profile';
  const syncLabel = iCloudSyncEnabled ? 'Synced with iCloud' : 'Local only';

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
          <Text style={[styles.headerTitle, { color: theme.text }]}>Profile</Text>
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
                      accessibilityLabel="Edit profile photo"
                      style={({ pressed }) => [
                        styles.avatar,
                        {
                          backgroundColor: theme.accent.fill,
                          transform: [{ scale: pressed ? 0.985 : 1 }],
                        },
                      ]}
                    >
                      {profileImageDataUri ? (
                        <RNImage source={{ uri: profileImageDataUri }} style={styles.avatarImage} />
                      ) : (
                        <Text style={[styles.avatarInitial, { color: theme.accent.ink }]}>{initial}</Text>
                      )}
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
                    <Text style={[TYPE.bodyRegular, styles.subtitle, { color: theme.textSec }]} numberOfLines={1}>
                      {profileSubtitle}
                    </Text>
                  </View>
                </RNHostView>
              </SwiftGroup>
              <SwiftSection>
                <LabeledContent label="Name">
                  <SwiftButton label={displayName} onPress={editName} />
                </LabeledContent>
                <LabeledContent label="Photo">
                  <SwiftButton
                    label={profileImageDataUri ? 'Edit' : 'Add'}
                    onPress={openPhotoActions}
                  />
                </LabeledContent>
              </SwiftSection>
              <SwiftSection>
                <LabeledContent label="Ledger Access">
                  <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                    {accessLabel}
                  </SwiftText>
                </LabeledContent>
                <LabeledContent label="iCloud Sync">
                  <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                    {syncLabel}
                  </SwiftText>
                </LabeledContent>
                <LabeledContent label="Edit Access">
                  <SwiftText modifiers={[foregroundStyle({ type: 'hierarchical', style: 'secondary' })]}>
                    {member?.allowOthersToEditMyItems ? 'Others can edit my items' : 'Only I can edit my items'}
                  </SwiftText>
                </LabeledContent>
                <SwiftButton
                  label="iCloud & Sharing Settings"
                  systemImage="person.2.badge.gearshape"
                  onPress={openSharingAndClose}
                />
              </SwiftSection>
              {profileImageDataUri && (
                <SwiftSection>
                  <SwiftButton label="Remove Photo" systemImage="trash" role="destructive" onPress={removePhoto} />
                </SwiftSection>
              )}
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
  avatar: {
    width: 116,
    height: 116,
    borderRadius: 58,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: 116,
    height: 116,
  },
  avatarInitial: {
    fontSize: 46,
    fontWeight: '600',
    letterSpacing: -1.2,
  },
  name: {
    marginTop: SPACE.md,
    textAlign: 'center',
    maxWidth: 300,
  },
  subtitle: {
    marginTop: SPACE.xs,
    textAlign: 'center',
  },
  formHost: {
    flex: 1,
    minHeight: 360,
  },
});
