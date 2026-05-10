// Cursona icon set — mirror of icons.jsx (claude-design bundle).
// Phase 8 / M1.
//
// All icons:
//   - 24×24 viewBox
//   - 1.7px stroke (overridable via strokeWidth prop)
//   - currentColor by default (override via color)
//   - flexShrink:0 default
//
// Usage:
//   import { Icon } from '../design/icons';
//   <Icon name="run" size={24} color={t.lime} />

import Svg, {
  Circle,
  Ellipse,
  G,
  Path,
  Polyline,
  Rect,
} from 'react-native-svg';

export type IconName =
  // Navigation
  | 'home' | 'grid' | 'record' | 'chart' | 'user' | 'chat'
  // Common
  | 'search' | 'bell' | 'back' | 'forward' | 'close' | 'plus' | 'more'
  | 'check' | 'chevron' | 'chevronDown' | 'arrowUp' | 'arrowRight'
  | 'external' | 'share'
  // Running / fitness
  | 'run' | 'heart' | 'heartFill' | 'shoe' | 'stopwatch' | 'trophy'
  | 'medal' | 'flame' | 'mountain' | 'map' | 'pin' | 'gps' | 'pace'
  // Money / XP
  | 'coin' | 'ruble' | 'bolt' | 'star' | 'starFill'
  // UI
  | 'settings' | 'edit' | 'camera' | 'image' | 'mic' | 'send'
  | 'phone' | 'video' | 'smile' | 'paperclip' | 'calendar'
  | 'pause' | 'play' | 'stop' | 'filter' | 'weather' | 'globe'
  | 'shield' | 'bookmark' | 'addFriend' | 'group' | 'lock' | 'trash' | 'download'
  // Aliases + extras
  | 'watch' | 'sun' | 'moon' | 'comment' | 'attach'
  | 'checkdouble' | 'checkbadge' | 'arrow' | 'userplus' | 'cog'
  | 'info' | 'envelope' | 'question' | 'hash';

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  fill?: string;
};

export function Icon({
  name,
  size = 24,
  color = '#FFFFFF',
  strokeWidth = 1.7,
  fill = 'none',
}: IconProps) {
  const stroke = color;
  const baseProps = {
    width: size,
    height: size,
    viewBox: '0 0 24 24' as const,
    fill,
  };

  const strokeProps = {
    stroke,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (name) {
    case 'home':
      return (
        <Svg {...baseProps}>
          <Path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z" {...strokeProps} />
        </Svg>
      );
    case 'grid':
      return (
        <Svg {...baseProps}>
          <Rect x="3" y="3" width="7" height="7" rx="1.5" {...strokeProps} />
          <Rect x="14" y="3" width="7" height="7" rx="1.5" {...strokeProps} />
          <Rect x="3" y="14" width="7" height="7" rx="1.5" {...strokeProps} />
          <Rect x="14" y="14" width="7" height="7" rx="1.5" {...strokeProps} />
        </Svg>
      );
    case 'record':
      return (
        <Svg {...baseProps}>
          <Circle cx="12" cy="12" r="9" {...strokeProps} />
          <Circle cx="12" cy="12" r="3.5" fill={color} />
        </Svg>
      );
    case 'chart':
      return (
        <Svg {...baseProps}>
          <Path d="M3 17l5-6 4 3 6-8 3 4" {...strokeProps} />
          <Path d="M3 21h18" {...strokeProps} />
        </Svg>
      );
    case 'user':
      return (
        <Svg {...baseProps}>
          <Circle cx="12" cy="8" r="4" {...strokeProps} />
          <Path d="M4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1" {...strokeProps} />
        </Svg>
      );
    case 'chat':
    case 'comment':
      return (
        <Svg {...baseProps}>
          <Path d="M21 12a8 8 0 01-11.6 7.1L4 21l1.9-5.4A8 8 0 1121 12z" {...strokeProps} />
        </Svg>
      );

    case 'search':
      return (
        <Svg {...baseProps}>
          <Circle cx="11" cy="11" r="7" {...strokeProps} />
          <Path d="M20 20l-3.5-3.5" {...strokeProps} />
        </Svg>
      );
    case 'bell':
      return (
        <Svg {...baseProps}>
          <Path d="M6 8a6 6 0 0112 0c0 7 3 8 3 8H3s3-1 3-8" {...strokeProps} />
          <Path d="M10 21a2 2 0 004 0" {...strokeProps} />
        </Svg>
      );
    case 'back':
      return (
        <Svg {...baseProps}>
          <Path d="M15 6l-6 6 6 6" {...strokeProps} />
        </Svg>
      );
    case 'forward':
    case 'chevron':
      return (
        <Svg {...baseProps}>
          <Path d="M9 6l6 6-6 6" {...strokeProps} />
        </Svg>
      );
    case 'chevronDown':
      return (
        <Svg {...baseProps}>
          <Path d="M6 9l6 6 6-6" {...strokeProps} />
        </Svg>
      );
    case 'close':
      return (
        <Svg {...baseProps}>
          <Path d="M6 6l12 12M18 6L6 18" {...strokeProps} />
        </Svg>
      );
    case 'plus':
      return (
        <Svg {...baseProps}>
          <Path d="M12 5v14M5 12h14" {...strokeProps} />
        </Svg>
      );
    case 'more':
      return (
        <Svg {...baseProps}>
          <Circle cx="5" cy="12" r="1.4" fill={color} />
          <Circle cx="12" cy="12" r="1.4" fill={color} />
          <Circle cx="19" cy="12" r="1.4" fill={color} />
        </Svg>
      );
    case 'check':
      return (
        <Svg {...baseProps}>
          <Path d="M5 12l4 4 10-10" {...strokeProps} />
        </Svg>
      );
    case 'arrowUp':
      return (
        <Svg {...baseProps}>
          <Path d="M12 19V5M5 12l7-7 7 7" {...strokeProps} />
        </Svg>
      );
    case 'arrowRight':
    case 'arrow':
      return (
        <Svg {...baseProps}>
          <Path d="M5 12h14M12 5l7 7-7 7" {...strokeProps} />
        </Svg>
      );
    case 'external':
      return (
        <Svg {...baseProps}>
          <Path d="M7 17L17 7" {...strokeProps} />
          <Path d="M9 7h8v8" {...strokeProps} />
        </Svg>
      );
    case 'share':
      return (
        <Svg {...baseProps}>
          <Path d="M12 3v13" {...strokeProps} />
          <Path d="M6 9l6-6 6 6" {...strokeProps} />
          <Path d="M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5" {...strokeProps} />
        </Svg>
      );

    case 'run':
      return (
        <Svg {...baseProps}>
          <Circle cx="17" cy="4.5" r="1.7" fill={color} />
          <Path d="M14 21l1.5-5-3-3 2-5 3 3 3 1" {...strokeProps} />
          <Path d="M11 13l-3 1-2 4" {...strokeProps} />
        </Svg>
      );
    case 'heart':
      return (
        <Svg {...baseProps}>
          <Path d="M12 21s-7-4.5-9-9c-1.5-3.5.5-7 4-7 2 0 3.5 1 5 3 1.5-2 3-3 5-3 3.5 0 5.5 3.5 4 7-2 4.5-9 9-9 9z" {...strokeProps} />
        </Svg>
      );
    case 'heartFill':
      return (
        <Svg {...baseProps}>
          <Path d="M12 21s-7-4.5-9-9c-1.5-3.5.5-7 4-7 2 0 3.5 1 5 3 1.5-2 3-3 5-3 3.5 0 5.5 3.5 4 7-2 4.5-9 9-9 9z" fill={color} strokeWidth={0} />
        </Svg>
      );
    case 'shoe':
      return (
        <Svg {...baseProps}>
          <Path d="M3 16h14c2 0 4-1 4-3 0-2-3-2-5-3-2-1-3-3-5-3s-3 1-3 3l-1 3H3z" {...strokeProps} />
          <Path d="M3 16v3h18v-3" {...strokeProps} />
        </Svg>
      );
    case 'stopwatch':
      return (
        <Svg {...baseProps}>
          <Circle cx="12" cy="14" r="7" {...strokeProps} />
          <Path d="M12 14V9" {...strokeProps} />
          <Path d="M9 3h6" {...strokeProps} />
          <Path d="M19 7l1.5-1.5" {...strokeProps} />
        </Svg>
      );
    case 'trophy':
      return (
        <Svg {...baseProps}>
          <Path d="M7 4h10v5a5 5 0 01-10 0z" {...strokeProps} />
          <Path d="M7 5H4a2 2 0 002 4M17 5h3a2 2 0 01-2 4" {...strokeProps} />
          <Path d="M12 14v3" {...strokeProps} />
          <Path d="M8 20h8" {...strokeProps} />
        </Svg>
      );
    case 'medal':
      return (
        <Svg {...baseProps}>
          <Circle cx="12" cy="14" r="6" {...strokeProps} />
          <Path d="M8 8L6 3h12l-2 5" {...strokeProps} />
          <Path d="M12 11v6" {...strokeProps} />
        </Svg>
      );
    case 'flame':
      return (
        <Svg {...baseProps}>
          <Path d="M12 3s4 4 4 9-2 8-4 8-4-3-4-8c0-3 2-5 2-7 0 0 2 1 2-2z" {...strokeProps} />
        </Svg>
      );
    case 'mountain':
      return (
        <Svg {...baseProps}>
          <Path d="M3 20l6-10 4 6 3-4 5 8z" {...strokeProps} />
        </Svg>
      );
    case 'map':
      return (
        <Svg {...baseProps}>
          <Path d="M9 3L3 6v15l6-3 6 3 6-3V3l-6 3-6-3z" {...strokeProps} />
          <Path d="M9 3v15M15 6v15" {...strokeProps} />
        </Svg>
      );
    case 'pin':
      return (
        <Svg {...baseProps}>
          <Path d="M12 22s8-7 8-13a8 8 0 10-16 0c0 6 8 13 8 13z" {...strokeProps} />
          <Circle cx="12" cy="9" r="2.5" {...strokeProps} />
        </Svg>
      );
    case 'gps':
      return (
        <Svg {...baseProps}>
          <Circle cx="12" cy="12" r="3" {...strokeProps} />
          <Circle cx="12" cy="12" r="8" {...strokeProps} />
          <Path d="M12 2v3M12 19v3M2 12h3M19 12h3" {...strokeProps} />
        </Svg>
      );
    case 'pace':
      return (
        <Svg {...baseProps}>
          <Circle cx="12" cy="12" r="9" {...strokeProps} />
          <Path d="M12 7v5l3 2" {...strokeProps} />
        </Svg>
      );

    case 'coin':
      return (
        <Svg {...baseProps}>
          <Circle cx="12" cy="12" r="9" {...strokeProps} />
          <Path d="M12 6v12M9.5 9h4a2 2 0 010 4h-5a2 2 0 000 4h5" {...strokeProps} />
        </Svg>
      );
    case 'ruble':
      return (
        <Svg {...baseProps}>
          <Path d="M8 5h6a4 4 0 010 8H6" {...strokeProps} />
          <Path d="M8 5v15" {...strokeProps} />
          <Path d="M6 17h7" {...strokeProps} />
        </Svg>
      );
    case 'bolt':
      return (
        <Svg {...baseProps}>
          <Path d="M13 2L4 14h7l-1 8 9-12h-7z" fill={color} />
        </Svg>
      );
    case 'star':
      return (
        <Svg {...baseProps}>
          <Path d="M12 3l2.5 6 6.5.5-5 4.5 1.5 6.5L12 17l-5.5 3.5L8 14l-5-4.5L9.5 9z" {...strokeProps} />
        </Svg>
      );
    case 'starFill':
      return (
        <Svg {...baseProps}>
          <Path d="M12 3l2.5 6 6.5.5-5 4.5 1.5 6.5L12 17l-5.5 3.5L8 14l-5-4.5L9.5 9z" fill={color} strokeWidth={0} />
        </Svg>
      );

    case 'settings':
    case 'cog':
      return (
        <Svg {...baseProps}>
          <Circle cx="12" cy="12" r="3" {...strokeProps} />
          <Path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" {...strokeProps} />
        </Svg>
      );
    case 'edit':
      return (
        <Svg {...baseProps}>
          <Path d="M14 4l6 6L8 22H2v-6z" {...strokeProps} />
          <Path d="M14 4l3-3 6 6-3 3" {...strokeProps} />
        </Svg>
      );
    case 'camera':
      return (
        <Svg {...baseProps}>
          <Path d="M3 8h3l2-3h8l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V9a1 1 0 011-1z" {...strokeProps} />
          <Circle cx="12" cy="13" r="4" {...strokeProps} />
        </Svg>
      );
    case 'image':
      return (
        <Svg {...baseProps}>
          <Rect x="3" y="3" width="18" height="18" rx="2" {...strokeProps} />
          <Circle cx="9" cy="9" r="2" {...strokeProps} />
          <Path d="M21 16l-5-5L5 21" {...strokeProps} />
        </Svg>
      );
    case 'mic':
      return (
        <Svg {...baseProps}>
          <Rect x="9" y="2" width="6" height="13" rx="3" {...strokeProps} />
          <Path d="M5 11a7 7 0 0014 0M12 18v3" {...strokeProps} />
        </Svg>
      );
    case 'send':
      return (
        <Svg {...baseProps}>
          <Path d="M3 11L21 3l-7 18-3-8-8-2z" {...strokeProps} />
        </Svg>
      );
    case 'phone':
      return (
        <Svg {...baseProps}>
          <Path d="M5 3h4l2 5-3 2c1 3 3 5 6 6l2-3 5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z" {...strokeProps} />
        </Svg>
      );
    case 'video':
      return (
        <Svg {...baseProps}>
          <Rect x="2" y="6" width="14" height="12" rx="2" {...strokeProps} />
          <Path d="M16 10l6-3v10l-6-3z" {...strokeProps} />
        </Svg>
      );
    case 'smile':
      return (
        <Svg {...baseProps}>
          <Circle cx="12" cy="12" r="9" {...strokeProps} />
          <Path d="M8 14s1.5 2 4 2 4-2 4-2" {...strokeProps} />
          <Circle cx="9" cy="10" r="0.8" fill={color} />
          <Circle cx="15" cy="10" r="0.8" fill={color} />
        </Svg>
      );
    case 'paperclip':
    case 'attach':
      return (
        <Svg {...baseProps}>
          <Path d="M21 11l-9 9a5 5 0 01-7-7l9-9a3.5 3.5 0 015 5l-9 9a2 2 0 01-3-3l8-8" {...strokeProps} />
        </Svg>
      );
    case 'calendar':
      return (
        <Svg {...baseProps}>
          <Rect x="3" y="5" width="18" height="16" rx="2" {...strokeProps} />
          <Path d="M3 9h18M8 3v4M16 3v4" {...strokeProps} />
        </Svg>
      );
    case 'pause':
      return (
        <Svg {...baseProps}>
          <Rect x="6" y="4" width="4" height="16" rx="1" fill={color} strokeWidth={0} />
          <Rect x="14" y="4" width="4" height="16" rx="1" fill={color} strokeWidth={0} />
        </Svg>
      );
    case 'play':
      return (
        <Svg {...baseProps}>
          <Path d="M6 4l14 8-14 8z" fill={color} strokeWidth={0} />
        </Svg>
      );
    case 'stop':
      return (
        <Svg {...baseProps}>
          <Rect x="5" y="5" width="14" height="14" rx="2" fill={color} strokeWidth={0} />
        </Svg>
      );
    case 'filter':
      return (
        <Svg {...baseProps}>
          <Path d="M3 5h18M6 12h12M10 19h4" {...strokeProps} />
        </Svg>
      );
    case 'weather':
    case 'sun':
      return (
        <Svg {...baseProps}>
          <Circle cx="12" cy="12" r="4" {...strokeProps} />
          <Path d="M12 2v3M12 19v3M2 12h3M19 12h3M5.5 5.5l1.5 1.5M17 17l1.5 1.5M5.5 18.5L7 17M17 7l1.5-1.5" {...strokeProps} />
        </Svg>
      );
    case 'globe':
      return (
        <Svg {...baseProps}>
          <Circle cx="12" cy="12" r="9" {...strokeProps} />
          <Path d="M3 12h18M12 3a13 13 0 010 18M12 3a13 13 0 000 18" {...strokeProps} />
        </Svg>
      );
    case 'shield':
      return (
        <Svg {...baseProps}>
          <Path d="M12 22s8-3 8-10V5l-8-3-8 3v7c0 7 8 10 8 10z" {...strokeProps} />
        </Svg>
      );
    case 'bookmark':
      return (
        <Svg {...baseProps}>
          <Path d="M6 3h12v18l-6-4-6 4z" {...strokeProps} />
        </Svg>
      );
    case 'addFriend':
    case 'userplus':
      return (
        <Svg {...baseProps}>
          <Circle cx="9" cy="8" r="4" {...strokeProps} />
          <Path d="M2 21v-1a6 6 0 016-6h2a6 6 0 016 6v1" {...strokeProps} />
          <Path d="M19 8v6M16 11h6" {...strokeProps} />
        </Svg>
      );
    case 'group':
      return (
        <Svg {...baseProps}>
          <Circle cx="9" cy="8" r="3.5" {...strokeProps} />
          <Circle cx="17" cy="9" r="2.5" {...strokeProps} />
          <Path d="M2 20v-1a5 5 0 015-5h4a5 5 0 015 5v1" {...strokeProps} />
          <Path d="M16 14h2a4 4 0 014 4v1" {...strokeProps} />
        </Svg>
      );
    case 'lock':
      return (
        <Svg {...baseProps}>
          <Rect x="4" y="11" width="16" height="10" rx="2" {...strokeProps} />
          <Path d="M8 11V7a4 4 0 018 0v4" {...strokeProps} />
        </Svg>
      );
    case 'trash':
      return (
        <Svg {...baseProps}>
          <Path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 002 2h6a2 2 0 002-2l1-13" {...strokeProps} />
        </Svg>
      );
    case 'download':
      return (
        <Svg {...baseProps}>
          <Path d="M12 3v13M5 12l7 7 7-7M3 21h18" {...strokeProps} />
        </Svg>
      );

    case 'watch':
      return (
        <Svg {...baseProps}>
          <Rect x="6" y="6" width="12" height="12" rx="3" {...strokeProps} />
          <Path d="M9 6V3h6v3M9 18v3h6v-3" {...strokeProps} />
          <Circle cx="12" cy="12" r="2" {...strokeProps} />
        </Svg>
      );
    case 'moon':
      return (
        <Svg {...baseProps}>
          <Path d="M21 13a8 8 0 11-10-10 7 7 0 0010 10z" {...strokeProps} />
        </Svg>
      );
    case 'checkdouble':
      return (
        <Svg {...baseProps}>
          <Path d="M2 12l4 4 8-10M10 16l4 4 8-10" {...strokeProps} />
        </Svg>
      );
    case 'checkbadge':
      return (
        <Svg {...baseProps}>
          <Path d="M12 2l2.5 2 3.5-.5L19 7l3 2-1.5 3 1.5 3-3 2-1 3.5-3.5-.5L12 22l-2.5-2-3.5.5L5 17l-3-2 1.5-3L2 9l3-2 1-3.5L9.5 4z" {...strokeProps} />
          <Path d="M8 12l3 3 5-6" {...strokeProps} />
        </Svg>
      );
    case 'info':
      return (
        <Svg {...baseProps}>
          <Circle cx="12" cy="12" r="9" {...strokeProps} />
          <Path d="M12 8h.01M11 12h1v5h1" {...strokeProps} />
        </Svg>
      );
    case 'envelope':
      return (
        <Svg {...baseProps}>
          <Rect x="3" y="5" width="18" height="14" rx="2" {...strokeProps} />
          <Path d="M3 7l9 7 9-7" {...strokeProps} />
        </Svg>
      );
    case 'question':
      return (
        <Svg {...baseProps}>
          <Circle cx="12" cy="12" r="9" {...strokeProps} />
          <Path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 4M12 17h.01" {...strokeProps} />
        </Svg>
      );
    case 'hash':
      return (
        <Svg {...baseProps}>
          <Path d="M5 9h14M5 15h14M10 3l-2 18M16 3l-2 18" {...strokeProps} />
        </Svg>
      );

    default:
      // Compile-time exhaustive: TS will catch unknown names.
      return null;
  }
}

// Re-export sub-primitives for direct use (e.g., custom icons in screens).
export { Svg, Circle, Ellipse, G, Path, Polyline, Rect };
