// Bottom tab bar — 4 tabs. Used as custom tabBar для React Navigation
// или standalone в screens (если nav пока не настроен).

import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../ThemeProvider';
import { Icon, type IconName } from '../icons';

/** Tab order: Запись / Журнал / Чаты / Я. */
export type TabId = 'record' | 'journal' | 'chats' | 'me';

type TabDef = { id: TabId; label: string; icon: IconName };

const TABS: ReadonlyArray<TabDef> = [
  { id: 'record',  label: 'Запись', icon: 'record' },
  { id: 'journal', label: 'Журнал', icon: 'chart' },
  { id: 'chats',   label: 'Чаты',   icon: 'chat' },
  { id: 'me',      label: 'Я',      icon: 'user' },
];

export type TabBarProps = {
  active: TabId;
  onTab?: (id: TabId) => void;
  style?: StyleProp<ViewStyle>;
};

/**
 * Cursona TabBar — 84px tall, dark bg, no rounded corners (sticks to safe-area).
 * Icons 24×24, label 11pt. Active = lime, inactive = text2.
 */
export function TabBar({ active, onTab, style }: TabBarProps) {
  const t = useTheme();
  return (
    <View
      style={[
        {
          height: 84,
          flexDirection: 'row',
          backgroundColor: t.bg,
          borderTopWidth: 1,
          borderTopColor: t.divider,
          paddingBottom: 22, // safe-area для home indicator
        },
        style,
      ]}
    >
      {TABS.map((tab) => {
        const on = tab.id === active;
        return (
          <Pressable
            key={tab.id}
            onPress={() => onTab?.(tab.id)}
            style={{
              flex: 1,
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 8,
            }}
          >
            <Icon
              name={tab.icon}
              size={24}
              color={on ? t.lime : t.text2}
              strokeWidth={1.8}
            />
            <Text
              style={{
                marginTop: 4,
                fontSize: 11,
                fontWeight: '500',
                color: on ? t.lime : t.text2,
                letterSpacing: -0.1,
                fontFamily: t.font,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export const TAB_IDS: ReadonlyArray<TabId> = TABS.map((t) => t.id);
