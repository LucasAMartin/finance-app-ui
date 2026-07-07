import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { NativeNotificationPermission } from '../../modules/glass-card/src/NativeNotificationPermission';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function NotificationPermissionDemoScreen({ visible, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <NativeNotificationPermission
          style={StyleSheet.absoluteFill}
          onPrimaryButtonTap={onClose}
          onSecondaryButtonTap={onClose}
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
