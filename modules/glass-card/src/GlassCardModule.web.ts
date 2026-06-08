import { registerWebModule, NativeModule } from 'expo';

// GlassCardModule is not available on the web platform.
class GlassCardModule extends NativeModule<{}> {}

export default registerWebModule(GlassCardModule, 'GlassCardModule');
