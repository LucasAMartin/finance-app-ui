import { GlassCardViewProps } from './GlassCard.types';

// GlassCardView is not available on the web platform.
export default function GlassCardView(_props: GlassCardViewProps) {
  throw new Error('GlassCardView is not available on the web platform.');
}
