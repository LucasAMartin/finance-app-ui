import React from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import { NativeIOSStyleOnboarding } from '../../modules/glass-card/src/NativeIOSStyleOnboarding';
import { NativeIntroLoginNamePage } from '../../modules/intro-login/src/NativeIntroLoginNamePage';

interface Props {
  visible: boolean;
  onClose: () => void;
  initialName?: string;
  profileImageDataUri?: string;
  onNameChange?: (name: string) => void;
}

export function IOSStyleOnboardingPreview({
  visible,
  onClose,
  initialName,
  profileImageDataUri,
  onNameChange,
}: Props) {
  const [step, setStep] = React.useState<'ios' | 'introLogin'>('ios');

  React.useEffect(() => {
    if (visible) setStep('ios');
  }, [visible]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      {step === 'ios' ? (
        <View style={styles.root}>
          <NativeIOSStyleOnboarding
            style={StyleSheet.absoluteFill}
            tint="#007AFF"
            hideBezels={false}
            onComplete={() => setStep('introLogin')}
          />
        </View>
      ) : (
        <View style={styles.introLoginRoot}>
          <NativeIntroLoginNamePage
            style={StyleSheet.absoluteFill}
            initialName={initialName}
            profileImageDataUri={profileImageDataUri}
            onNameChange={onNameChange}
          />
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },
  introLoginRoot: {
    flex: 1,
    backgroundColor: '#fff',
  },
});
