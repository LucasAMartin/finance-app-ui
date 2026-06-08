import { NativeModule, requireNativeModule } from 'expo';

declare class GlassCardModule extends NativeModule<{}> {}

export default requireNativeModule<GlassCardModule>('GlassCard');
