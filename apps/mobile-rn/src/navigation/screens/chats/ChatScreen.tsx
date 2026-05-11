// Tab: Чаты / single chat — Phase 8 / M9.
//
// Thin wrapper над legacy src/ui/social/ChatScreen, который содержит
// 500+ строк рабочей логики (messages list, composer, reactions, replies,
// media). Передаём chat object и myUserId, на onBack — nav.goBack.
//
// Если chat в store не найден (cold-deep-link) — рефрешим chats list,
// показываем спиннер, потом ищем снова.

import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../../../design';
import { useAuthStore } from '../../../state/auth';
import { useChatsStore } from '../../../state/social/useChatsStore';
import { ChatScreen as LegacyChatScreen } from '../../../ui/social/ChatScreen';
import type { ChatsStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'Chat'>;
type RouteP = RouteProp<ChatsStackParamList, 'Chat'>;

export function ChatScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const route = useRoute<RouteP>();
  const chatId = route.params?.chatId ?? '';

  const user = useAuthStore((s) => s.user);
  const chat = useChatsStore((s) => s.chats.find((c) => c.id === chatId));
  const refresh = useChatsStore((s) => s.refresh);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (chat === undefined && !tried) {
      setTried(true);
      void refresh();
    }
  }, [chat, tried, refresh]);

  if (user === null) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.text2, fontSize: 14, fontFamily: t.font }}>
          Нужно войти
        </Text>
      </View>
    );
  }

  if (chat === undefined) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.text2} />
        <Text style={{ marginTop: 12, color: t.text2, fontSize: 13, fontFamily: t.font }}>
          {tried ? 'Чат не найден' : 'Загружаем…'}
        </Text>
      </View>
    );
  }

  return (
    <LegacyChatScreen
      chat={chat}
      myUserId={user.id}
      onBack={() => nav.goBack()}
    />
  );
}
