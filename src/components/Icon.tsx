import React from 'react';
import Svg, { Path, Circle, Rect, G } from 'react-native-svg';

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  stroke?: number;
}

export const Icon: React.FC<IconProps> = ({ name, size = 20, color = '#0E0E10', stroke = 1.4 }) => {
  const p = {
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  };

  const icons: Record<string, React.ReactNode> = {
    cart: <G>
      <Circle cx="9.5" cy="20" r="1.1" {...p} />
      <Circle cx="17.5" cy="20" r="1.1" {...p} />
      <Path d="M3 4h2.5l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.4a1.6 1.6 0 0 0 1.6-1.2L21 8.5H6.5" {...p} />
    </G>,
    fork: <G>
      <Path d="M7 3v8a2 2 0 0 0 2 2v8" {...p} />
      <Path d="M11 3v8" {...p} />
      <Path d="M9 3v6" {...p} />
      <Path d="M17 3c-1.5 0-2.5 1.5-2.5 4S15.5 12 17 12v9" {...p} />
    </G>,
    car: <G>
      <Path d="M4 14l1.6-4.8a3 3 0 0 1 2.85-2.05h7.1a3 3 0 0 1 2.85 2.05L20 14" {...p} />
      <Rect x="3" y="14" width="18" height="5.5" rx="1.4" {...p} />
      <Circle cx="7" cy="17" r="0.8" {...p} />
      <Circle cx="17" cy="17" r="0.8" {...p} />
    </G>,
    bag: <G>
      <Path d="M5.5 8.5h13l-1 12a1.4 1.4 0 0 1-1.4 1.3H7.9a1.4 1.4 0 0 1-1.4-1.3l-1-12z" {...p} />
      <Path d="M9 8.5V6a3 3 0 0 1 6 0v2.5" {...p} />
    </G>,
    cup: <G>
      <Path d="M5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8z" {...p} />
      <Path d="M17 10h2a2.5 2.5 0 0 1 0 5h-2" {...p} />
    </G>,
    doc: <G>
      <Path d="M6 3h8l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" {...p} />
      <Path d="M14 3v4h4" {...p} />
      <Path d="M8 12h8M8 16h6" {...p} />
    </G>,
    film: <G>
      <Rect x="3.5" y="4" width="17" height="16" rx="2" {...p} />
      <Path d="M3.5 9h17M3.5 15h17" {...p} />
      <Path d="M8 4v16M16 4v16" {...p} />
    </G>,
    search: <G>
      <Circle cx="11" cy="11" r="6.5" {...p} />
      <Path d="M15.8 15.8L20 20" {...p} />
    </G>,
    bell: <G>
      <Path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5L6 16z" {...p} />
      <Path d="M10 20.5a2 2 0 0 0 4 0" {...p} />
    </G>,
    home: <G>
      <Path d="M3.5 11l8.5-7 8.5 7v9a1.4 1.4 0 0 1-1.4 1.4H4.9A1.4 1.4 0 0 1 3.5 20v-9z" {...p} />
      <Path d="M10 21v-6h4v6" {...p} />
    </G>,
    chart: <G>
      <Path d="M3 20h18" {...p} />
      <Path d="M5 17V11" {...p} />
      <Path d="M10 17V6" {...p} />
      <Path d="M15 17v-8" {...p} />
      <Path d="M20 17v-4" {...p} />
    </G>,
    profile: <G>
      <Circle cx="12" cy="9" r="3.5" {...p} />
      <Path d="M5 20c1.2-3.6 4-5 7-5s5.8 1.4 7 5" {...p} />
    </G>,
    cards: <G>
      <Rect x="2.5" y="7" width="19" height="12" rx="2.2" {...p} />
      <Path d="M2.5 11h19" {...p} />
    </G>,
    chevL:    <Path d="M14 5l-7 7 7 7" {...p} />,
    chevR:    <Path d="M10 5l7 7-7 7" {...p} />,
    chevDown: <Path d="M5 9l7 7 7-7" {...p} />,
    close: <G>
      <Path d="M6 6l12 12M18 6L6 18" {...p} />
    </G>,
    note: <G>
      <Path d="M5 4h12l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" {...p} />
      <Path d="M8 11h8M8 15h5" {...p} />
    </G>,
    cal: <G>
      <Rect x="3.5" y="5" width="17" height="16" rx="2" {...p} />
      <Path d="M3.5 10h17M8 3v4M16 3v4" {...p} />
    </G>,
    repeat: <G>
      <Path d="M5 8a6 6 0 0 1 11-2" {...p} />
      <Path d="M19 16a6 6 0 0 1-11 2" {...p} />
      <Path d="M16 3v4h-4" {...p} />
      <Path d="M8 21v-4h4" {...p} />
    </G>,
    split: <G>
      <Circle cx="7" cy="7" r="2.4" {...p} />
      <Circle cx="17" cy="17" r="2.4" {...p} />
      <Path d="M7 9.4v4.1A3.5 3.5 0 0 0 10.5 17H14" {...p} />
    </G>,
    mic: <G>
      <Rect x="9" y="3" width="6" height="12" rx="3" {...p} />
      <Path d="M5.5 12a6.5 6.5 0 0 0 13 0" {...p} />
      <Path d="M12 18.5V22" {...p} />
    </G>,
    keypad: <G>
      <Circle cx="6" cy="6" r="1.2" {...p} />
      <Circle cx="12" cy="6" r="1.2" {...p} />
      <Circle cx="18" cy="6" r="1.2" {...p} />
      <Circle cx="6" cy="12" r="1.2" {...p} />
      <Circle cx="12" cy="12" r="1.2" {...p} />
      <Circle cx="18" cy="12" r="1.2" {...p} />
      <Circle cx="6" cy="18" r="1.2" {...p} />
      <Circle cx="12" cy="18" r="1.2" {...p} />
      <Circle cx="18" cy="18" r="1.2" {...p} />
    </G>,
    sparkle: <G>
      <Path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" {...p} />
      <Path d="M19 16l.7 1.8L21.5 18.5l-1.8.7L19 21l-.7-1.8L16.5 18.5l1.8-.7L19 16z" {...p} />
    </G>,
    plus: <G>
      <Path d="M12 5v14M5 12h14" {...p} />
    </G>,
    filter: <G>
      <Path d="M4 6h16M8 12h8M12 18h1" {...p} />
    </G>,
    settings: <G>
      <Circle cx="12" cy="12" r="3" {...p} />
      <Path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" {...p} />
    </G>,
    tag: <G>
      <Path d="M3 12V4h8l10 10-8 8L3 12z" {...p} />
      <Circle cx="7" cy="8" r="1.1" {...p} />
    </G>,
    backspace: <G>
      <Path d="M7 1h15a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 22 17H7L1 9 7 1z" {...p} />
      <Path d="M11 6l6 6M17 6l-6 6" {...p} />
    </G>,
    menu: <G>
      <Path d="M4 7h16M4 12h16M4 17h16" {...p} />
    </G>,
    sun: <G>
      <Circle cx="12" cy="12" r="4" {...p} />
      <Path d="M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4l1.4-1.4M17 7l1.4-1.4" {...p} />
    </G>,
    moon: <G>
      <Path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" {...p} />
    </G>,
    wallet: <G>
      <Path d="M3 8.5a2 2 0 0 1 2-2h12a1.5 1.5 0 0 1 1.5 1.5V8.5" {...p} />
      <Path d="M3 8v10.5A1.5 1.5 0 0 0 4.5 20H19a2 2 0 0 0 2-2v-8a1.5 1.5 0 0 0-1.5-1.5H3z" {...p} />
      <Circle cx="16.5" cy="14" r="1.1" {...p} />
    </G>,
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {icons[name] ?? null}
    </Svg>
  );
};
