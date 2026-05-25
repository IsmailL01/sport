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
  /**
   * Optional per-tab unread counters. Renders a red circular badge in the
   * top-right of the tab's icon when count > 0. Cap at "99+" for readability.
   *   { chats: 7 } → badge "7" on Chats tab
   *   { chats: 0 } or omitted → no badge
   */
  badges?: Partial<Record<TabId, number>>;
};

/**
 * Cursona TabBar — 84px tall, dark bg, no rounded corners (sticks to safe-area).
 * Icons 24×24, label 11pt. Active = lime, inactive = text2.
 * Badges (optional) — red circle, top-right of icon, count or "99+".
 */
export function TabBar({ active, onTab, style, badges }: TabBarProps) {
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
        const badgeCount = badges?.[tab.id] ?? 0;
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
            <View style={{ width: 24, height: 24, position: 'relative' }}>
              <Icon
                name={tab.icon}
                size={24}
                color={on ? t.lime : t.text2}
                strokeWidth={1.8}
              />
              {badgeCount > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -8,
                    minWidth: 16,
                    height: 16,
                    paddingHorizontal: 4,
                    borderRadius: 8,
                    backgroundColor: t.error,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.5,
                    borderColor: t.bg,
                  }}
                >
                  <Text
                    style={{
                      color: '#FFFFFF',
                      fontSize: 9,
                      fontWeight: '800',
                      lineHeight: 11,
                    }}
                  >
                    {badgeCount > 99 ? '99+' : badgeCount}
                  </Text>
                </View>
              ) : null}
            </View>
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
