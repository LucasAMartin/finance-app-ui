import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { NativeIOSStyleOnboarding } from '../../modules/glass-card/src/NativeIOSStyleOnboarding';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function IOSStyleOnboardingPreview({ visible, onClose }: Props) {
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
          onComplete={onClose}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
});
