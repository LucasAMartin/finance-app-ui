import { NativeModule, requireNativeModule } from 'expo';

declare class GlassCardModule extends NativeModule<{}> {
  writeFinanceWidgetSnapshot(json: string): Promise<void>;
}

export default requireNativeModule<GlassCardModule>('GlassCard');
