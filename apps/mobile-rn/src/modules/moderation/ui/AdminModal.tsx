// AdminModal — host modal для AdminQueueScreen (Phase E mobile admin UI).

import { Modal } from 'react-native';

import { AdminQueueScreen } from './AdminQueueScreen';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function AdminModal({ visible, onClose }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
    >
      <AdminQueueScreen onClose={onClose} />
    </Modal>
  );
}
