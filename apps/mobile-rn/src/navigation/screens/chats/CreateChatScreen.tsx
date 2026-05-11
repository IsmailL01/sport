// Tab: Чаты / Create chat — Phase 8 / M9.
//
// Thin wrapper над legacy UserSearchScreen.
// onPick → createOrFindDM(peerId) → nav.replace('Chat', { chatId }).

import { useTheme } from '../../../design';
import { useChatsStore } from '../../../state/social/useChatsStore';
import { UserSearchScreen } from '../../../ui/social/UserSearchScreen';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, View } from 'react-native';
import type { ChatsStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<ChatsStackParamList, 'CreateChat'>;

export function CreateChatScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const createOrFindDM = useChatsStore((s) => s.createOrFindDM);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <UserSearchScreen
        onBack={() => nav.goBack()}
        onPick={async (u) => {
          try {
            const chat = await createOrFindDM(u.id);
            if (chat === null) {
              Alert.alert('Не получилось создать чат', 'Сервер вернул ошибку.');
              return;
            }
            nav.replace('Chat', { chatId: chat.id });
          } catch (e) {
            Alert.alert('Ошибка', String(e));
          }
        }}
      />
    </View>
  );
}
