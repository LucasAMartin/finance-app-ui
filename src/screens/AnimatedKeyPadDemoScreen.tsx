import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { NativeAnimatedKeyPad } from '../../modules/animated-key-pad/src/NativeAnimatedKeyPad';
import { ScreenExitButton } from '../components/GlassButton';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function AnimatedKeyPadDemoScreen({ visible, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <NativeAnimatedKeyPad style={StyleSheet.absoluteFill} />
        <View style={styles.close}>
          <ScreenExitButton
            variant="close"
            onPress={onClose}
            tint="#ffffff"
            fallbackBg="rgba(255,255,255,0.18)"
            accessibilityLabel="Close animated keypad demo"
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
