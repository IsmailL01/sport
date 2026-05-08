// FeedModal — host для FeedScreen + PostDetailScreen + PostComposerScreen.
// Без @react-navigation: state-machine internal screens (как ChatsModal).

import { useState } from 'react';
import { Modal } from 'react-native';

import type { Post } from '../domain/types';
import { FeedScreen } from './FeedScreen';
import { PostComposerScreen } from './PostComposerScreen';
import { PostDetailScreen } from './PostDetailScreen';

type Screen =
  | { kind: 'list' }
  | { kind: 'detail'; post: Post };

type Props = {
  visible: boolean;
  myUserId: string;
  onClose: () => void;
};

export function FeedModal({ visible, myUserId, onClose }: Props) {
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });
  const [composeOpen, setComposeOpen] = useState(false);

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
        <FeedScreen
          myUserId={myUserId}
          onOpenPost={(p) => setScreen({ kind: 'detail', post: p })}
          onCompose={() => setComposeOpen(true)}
          onBack={handleClose}
        />
      )}
      {screen.kind === 'detail' && (
        <PostDetailScreen
          post={screen.post}
          myUserId={myUserId}
          onBack={() => setScreen({ kind: 'list' })}
        />
      )}
      <PostComposerScreen
        visible={composeOpen}
        myUserId={myUserId}
        onClose={() => setComposeOpen(false)}
        onPosted={() => setComposeOpen(false)}
      />
    </Modal>
  );
}
