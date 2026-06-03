import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useTheme } from '../src/ThemeProvider';

export default function IncomeWebRoute() {
  const { theme } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.text }]}>Income</Text>
      <Text style={[styles.body, { color: theme.textSec }]}>
        This flow uses native iOS controls. Open it in the iOS app to use the routed zoom transition.
      </Text>
      <Pressable
        onPress={() => router.back()}
        style={[styles.button, { backgroundColor: theme.chipBg }]}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Text style={[styles.buttonText, { color: theme.text }]}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  body: {
    maxWidth: 360,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  button: {
    minWidth: 96,
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
