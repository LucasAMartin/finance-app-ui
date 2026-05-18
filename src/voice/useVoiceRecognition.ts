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

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('result', (event) => {
    const text = event.results[0]?.transcript ?? '';
    if (text) setTranscript(text);
  });
  useSpeechRecognitionEvent('error', (event) => {
    if (event.error === 'aborted') return; // abort() is intentional, not a failure
    setError(ERROR_MESSAGES[event.error] ?? event.message);
    setListening(false);
  });

  const start = useCallback(async () => {
    setError(null);
    setTranscript('');
    const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      setError(ERROR_MESSAGES['not-allowed']);
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: false,
    });
  }, []);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);
  const abort = useCallback(() => ExpoSpeechRecognitionModule.abort(), []);
  const reset = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return { transcript, listening, error, start, stop, abort, reset };
}
