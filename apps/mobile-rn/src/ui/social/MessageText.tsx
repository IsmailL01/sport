// MessageText — renders chat message body with tappable URLs + @mentions.
// Phase 11 session 3 / social-yolo-pass chat polish item.
//
// Plain text segments pass through with parent styling; URL + mention
// segments are rendered as nested <Text> with link styling + onPress.
// Linking.openURL for URLs; for @mentions we just toast (could become
// "open user profile" once username→userId lookup is wired — v1.0.1).

import { Linking, Text, type TextStyle } from 'react-native';

import { linkifyText } from '../../util/linkify';

export type MessageTextProps = {
  body: string;
  /** Color of plain text. */
  color: string;
  /** Color of links + mentions. Recommended: theme.lime or theme.accent. */
  linkColor: string;
  /** Font size used by enclosing bubble. */
  fontSize: number;
  /** Font family used by enclosing bubble. */
  fontFamily?: string;
  /** Called when user taps an @mention. username is the bare handle (no @). */
  onMentionPress?: (username: string) => void;
};

export function MessageText({
  body,
  color,
  linkColor,
  fontSize,
  fontFamily,
  onMentionPress,
}: MessageTextProps) {
  const tokens = linkifyText(body);
  if (tokens.length === 0) return null;

  const baseStyle: TextStyle = { color, fontSize, fontFamily };

  return (
    <Text style={baseStyle}>
      {tokens.map((tok, i) => {
        if (tok.kind === 'text') {
          return <Text key={`t${i}`}>{tok.value}</Text>;
        }
        if (tok.kind === 'url') {
          return (
            <Text
              key={`u${i}`}
              style={{ color: linkColor, textDecorationLine: 'underline' }}
              onPress={() => {
                void Linking.openURL(tok.href).catch((e) => {
                  console.warn('[MessageText] openURL failed', e);
                });
              }}
            >
              {tok.value}
            </Text>
          );
        }
        // mention
        return (
          <Text
            key={`m${i}`}
            style={{ color: linkColor, fontWeight: '700' }}
            onPress={() => onMentionPress?.(tok.username)}
          >
            {tok.value}
          </Text>
        );
      })}
    </Text>
  );
}
