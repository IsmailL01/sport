// Container-modal с внутренним state-machine для navigation между chat-screens.
// Без @react-navigation чтобы избежать тяжёлой App.tsx переделки в Phase A.
// Phase 8 / A5.
//
// Screens: list → chat / userSearch
// userSearch → list (via createOrFindDM) → chat

import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import type { Chat, SocialUser } from '../../domain/social';
import { useChatsStore } from '../../state/social/useChatsStore';
import { ChatScreen } from './ChatScreen';
import { ChatSettingsScreen } from './ChatSettingsScreen';
import { ChatsListScreen } from './ChatsListScreen';
import { NewGroupScreen } from './NewGroupScreen';
import { UserSearchScreen } from './UserSearchScreen';

type Screen =
  | { kind: 'list' }
  | { kind: 'chat'; chat: Chat }
  | { kind: 'userSearch' }
  | { kind: 'newChatChoice' }
  | { kind: 'newGroup' }
  | { kind: 'settings'; chat: Chat };

type Props = {
  visible: boolean;
  myUserId: string;
  onClose: () => void;
};

function NewChatChoice({
  onBack, onDM, onGroup,
}: {
  onBack: () => void; onDM: () => void; onGroup: () => void;
}) {
  return (
    <View style={choiceStyles.container}>
      <View style={choiceStyles.header}>
        <Pressable onPress={onBack} style={choiceStyles.backBtn}>
          <Text style={choiceStyles.backText}>‹</Text>
        </Pressable>
        <Text style={choiceStyles.headerTitle}>Новый чат</Text>
        <View style={{ width: 32 }} />
      </View>
      <Pressable onPress={onDM} style={choiceStyles.option}>
        <Text style={choiceStyles.optionTitle}>Личное сообщение</Text>
        <Text style={choiceStyles.optionDescr}>1:1 чат с пользователем</Text>
      </Pressable>
      <Pressable onPress={onGroup} style={choiceStyles.option}>
        <Text style={choiceStyles.optionTitle}>Группа</Text>
        <Text style={choiceStyles.optionDescr}>Несколько участников, роли</Text>
      </Pressable>
    </View>
  );
}

const choiceStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 28, color: '#111827', marginTop: -4 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#111827', textAlign: 'center' },
  option: {
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  optionTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  optionDescr: { fontSize: 13, color: '#6B7280', marginTop: 4 },
});

export function ChatsModal({ visible, myUserId, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });
  const createOrFindDM = useChatsStore((s) => s.createOrFindDM);

  const handlePickUser = async (user: SocialUser) => {
    const chat = await createOrFindDM(user.id);
    if (chat !== null) {
      setScreen({ kind: 'chat', chat });
    } else {
      setScreen({ kind: 'list' });
    }
  };

  // Закрытие — реcет на list для следующего открытия.
  const handleClose = () => {
    setScreen({ kind: 'list' });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={() => {
        if (screen.kind === 'list') handleClose();
        else setScreen({ kind: 'list' });
      }}
      presentationStyle="pageSheet"
    >
      {screen.kind === 'list' && (
        <ChatsListScreen
          myUserId={myUserId}
          onOpenChat={(c) => setScreen({ kind: 'chat', chat: c })}
          onNewChat={() => setScreen({ kind: 'newChatChoice' })}
        />
      )}
      {screen.kind === 'chat' && (
        <ChatScreen
          chat={screen.chat}
          myUserId={myUserId}
          onBack={() => setScreen({ kind: 'list' })}
          onOpenSettings={() => setScreen({ kind: 'settings', chat: screen.chat })}
        />
      )}
      {screen.kind === 'userSearch' && (
        <UserSearchScreen
          onBack={() => setScreen({ kind: 'newChatChoice' })}
          onPick={handlePickUser}
        />
      )}
      {screen.kind === 'newChatChoice' && (
        <NewChatChoice
          onBack={() => setScreen({ kind: 'list' })}
          onDM={() => setScreen({ kind: 'userSearch' })}
          onGroup={() => setScreen({ kind: 'newGroup' })}
        />
      )}
      {screen.kind === 'newGroup' && (
        <NewGroupScreen
          onBack={() => setScreen({ kind: 'newChatChoice' })}
          onCreated={(c) => setScreen({ kind: 'chat', chat: c })}
        />
      )}
      {screen.kind === 'settings' && (
        <ChatSettingsScreen
          chat={screen.chat}
          myUserId={myUserId}
          onBack={() => setScreen({ kind: 'chat', chat: screen.chat })}
          onLeft={() => {
            useChatsStore.getState().refresh();
            setScreen({ kind: 'list' });
          }}
        />
      )}
    </Modal>
  );
}
