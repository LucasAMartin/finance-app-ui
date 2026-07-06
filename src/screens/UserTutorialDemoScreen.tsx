import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { NativeUserTutorialScreen } from '../../modules/glass-card/src/NativeUserTutorialScreen';
import { ScreenExitButton } from '../components/GlassButton';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function UserTutorialDemoScreen({ visible, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <NativeUserTutorialScreen
          style={StyleSheet.absoluteFill}
          onComplete={onClose}
        />
        <View style={styles.close}>
          <ScreenExitButton
            variant="close"
            onPress={onClose}
            tint="#111111"
            fallbackBg="rgba(255,255,255,0.78)"
            accessibilityLabel="Close tutorial demo"
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  close: {
    left: 16,
    position: 'absolute',
    top: 54,
  },
});
