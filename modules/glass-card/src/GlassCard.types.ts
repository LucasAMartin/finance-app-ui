import type { StyleProp, ViewStyle } from 'react-native';

export type GlassCardViewProps = {
  cornerRadius?: number;
  pressable?: boolean;
  onCardPress?: () => void;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  accessibilityRole?: string;
  accessibilityLabel?: string;
};
