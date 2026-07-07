import React from 'react';
import { Alert, Modal, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeIOSStyleOnboarding } from '../../modules/glass-card/src/NativeIOSStyleOnboarding';

interface Props {
  visible: boolean;
  onClose: () => void;
  initialName?: string;
  profileImageDataUri?: string;
  onNameChange?: (name: string) => void;
  onProfileImageChange?: (profileImageDataUri: string) => void;
}

export function IOSStyleOnboardingPreview({
  visible,
  onClose,
  initialName,
  profileImageDataUri,
  onNameChange,
  onProfileImageChange,
}: Props) {
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
    onProfileImageChange?.(`data:${mimeType};base64,${asset.base64}`);
  }, [onProfileImageChange]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <NativeIOSStyleOnboarding
          style={StyleSheet.absoluteFill}
          tint="#007AFF"
          hideBezels={false}
          initialName={initialName}
          profileImageDataUri={profileImageDataUri}
          onNameChange={onNameChange}
          onProfileImagePress={choosePhoto}
          onComplete={onClose}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
