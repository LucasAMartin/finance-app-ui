import { requireNativeModule } from 'expo';
import type { NativeCloudKitModule } from '../../../src/sync/nativeCloudKitAdapter';

export default requireNativeModule<NativeCloudKitModule>('CloudKitSync');
