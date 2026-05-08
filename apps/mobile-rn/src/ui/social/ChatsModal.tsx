// Container-modal с внутренним state-machine для navigation между chat-screens.
// Без @react-navigation чтобы избежать тяжёлой App.tsx переделки в Phase A.
// Phase 8 / A5.
//
// Screens: list → chat / userSearch
// userSearch → list (via createOrFindDM) → chat

import { useState } from 'react';
import { Modal } from 'react-native';

import type { Chat, SocialUser } from '../../domain/social';
import { useChatsStore } from '../../state/social/useChatsStore';
import { ChatScreen } from './ChatScreen';
import { ChatsListScreen } from './ChatsListScreen';
import { UserSearchScreen } from './UserSearchScreen';

type Screen =
  | { kind: 'list' }
  | { kind: 'chat'; chat: Chat }
  | { kind: 'userSearch' };

type Props = {
  visible: boolean;
  myUserId: string;
  onClose: () => void;
};

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
          onOpenChat={(c) => setScreen({ kind: 'chat', chat: c })}
          onNewChat={() => setScreen({ kind: 'userSearch' })}
        />
      )}
      {screen.kind === 'chat' && (
        <ChatScreen
          chat={screen.chat}
          myUserId={myUserId}
          onBack={() => setScreen({ kind: 'list' })}
        />
      )}
      {screen.kind === 'userSearch' && (
        <UserSearchScreen
          onBack={() => setScreen({ kind: 'list' })}
          onPick={handlePickUser}
        />
      )}
    </Modal>
  );
}
