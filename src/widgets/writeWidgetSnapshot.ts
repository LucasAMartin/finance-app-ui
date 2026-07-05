import { Platform } from 'react-native';
import GlassCardModule from '../../modules/glass-card/src/GlassCardModule';
import type { FinanceWidgetSnapshot } from './types';

export async function writeFinanceWidgetSnapshot(snapshot: FinanceWidgetSnapshot): Promise<void> {
  if (Platform.OS !== 'ios') return;
  await GlassCardModule.writeFinanceWidgetSnapshot(JSON.stringify(snapshot));
}
