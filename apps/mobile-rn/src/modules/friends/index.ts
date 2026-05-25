// Public surface модуля `friends`. Phase 10 / ADR-0011 Amendment 6.

export type {
  FriendRequest,
  FriendRequestStatus,
  FriendActionState,
} from './domain/types';
export { REQUIRES_FRIENDSHIP_ERROR_CODE } from './domain/types';

export {
  FriendRequestError,
  acceptFriendRequest,
  cancelFriendRequest,
  checkAreFriends,
  listFriends,
  listIncomingFriendRequests,
  listOutgoingFriendRequests,
  rejectFriendRequest,
  sendFriendRequest,
} from './sync/friendsApi';
export type { ApiErrorCode } from './sync/friendsApi';

export { useFriendsStore } from './state/useFriendsStore';

export { FriendActionButton } from './ui/FriendActionButton';
export type { FriendActionButtonProps } from './ui/FriendActionButton';

export { FriendRequestsInboxScreen } from './ui/FriendRequestsInboxScreen';
