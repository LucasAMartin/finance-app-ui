import { useCallback, useState } from 'react';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

export interface VoiceRecognition {
  /** Live transcript — updates while the user is speaking. */
  transcript: string;
  /** True while the microphone is actively recognizing speech. */
  listening: boolean;
  /** Human-readable error message, or null when there is none. */
  error: string | null;
  /** Live input level normalized to 0..1 from native volume metering. */
  level: number;
  /** Request permission (if needed) and begin listening. */
  start: () => Promise<void>;
  /** Stop listening and emit one final result. */
  stop: () => void;
  /** Cancel listening immediately, with no final result. */
  abort: () => void;
  /** Clear the current transcript and error. */
  reset: () => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  'not-allowed': 'Microphone and speech access is needed. Enable it in Settings.',
  'no-speech': "Didn't catch that — tap to try again.",
  'service-not-allowed': 'Speech recognition is unavailable on this device.',
  'language-not-supported': 'This language is not supported.',
  network: 'A network connection is required for speech recognition.',
};

/**
 * Wraps `expo-speech-recognition` (Apple's Speech framework on iOS) behind a
 * small start/stop interface. Drop it into any component that needs voice input.
 */
export function useVoiceRecognition(): VoiceRecognition {
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);

  const normalizeVolume = (value: number) => {
    // Native emits roughly -2..10 where <0 is essentially silence.
    const normalized = (value + 2) / 12;
    return Math.max(0, Math.min(1, normalized));
  };

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    setLevel(0);
  });
  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    if (text) setTranscript(text);
  });
  useSpeechRecognitionEvent('volumechange', (event) => {
    setLevel(normalizeVolume(event.value));
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (event.error === 'aborted') return; // abort() is intentional, not a failure
    setError(ERROR_MESSAGES[event.error] ?? event.message);
    setListening(false);
    setLevel(0);
  });

  const start = useCallback(async () => {
    setError(null);
    setTranscript('');
    setLevel(0);
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError(ERROR_MESSAGES['not-allowed']);
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
      volumeChangeEventOptions: {
        enabled: true,
        intervalMillis: 50,
      },
    });
  }, []);

  const stop = useCallback(() => {
    setLevel(0);
    ExpoSpeechRecognitionModule.stop();
  }, []);
  const abort = useCallback(() => {
    setLevel(0);
    ExpoSpeechRecognitionModule.abort();
  }, []);
  const reset = useCallback(() => {
    setTranscript('');
    setError(null);
    setLevel(0);
  }, []);

  return { transcript, listening, error, level, start, stop, abort, reset };
}
