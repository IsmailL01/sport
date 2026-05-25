// Tab: Я / Club detail.
//
// Real club detail screen. Owner: edit / add-member / remove-member / delete.
// Member: leave. Quick task: profile-clubs-polish.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Avatar, Button, Card, Icon, useTheme } from '../../../design';
import { useAuthStore } from '../../../state/auth';
import { useFriendsStore } from '../../../modules/friends/state/useFriendsStore';
import { useUsersStore } from '../../../state/social/useUsersStore';
import { useClubsStore } from '../../../modules/clubs/state/useClubsStore';
import {
  CLUB_DESCRIPTION_MAX,
  CLUB_NAME_MAX,
  ClubError,
} from '../../../modules/clubs/domain/errors';
import {
  CLUB_AVATAR_COLORS,
  type ClubAvatarColor,
} from '../../../modules/clubs/domain/types';
import type { MeStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<MeStackParamList, 'Club'>;
type Route = RouteProp<MeStackParamList, 'Club'>;

export function ClubScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { clubId } = route.params;

  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? null;

  const detail = useClubsStore((s) => s.detailsById[clubId]);
  const selectClub = useClubsStore((s) => s.selectClub);
  const update = useClubsStore((s) => s.update);
  const remove = useClubsStore((s) => s.remove);
  const addMemberAction = useClubsStore((s) => s.addMember);
  const removeMemberAction = useClubsStore((s) => s.removeMember);
  const mutating = useClubsStore((s) => s.mutating);

  const friendIds = useFriendsStore((s) => s.friendIds);
  const refreshFriends = useFriendsStore((s) => s.refresh);
  const usersById = useUsersStore((s) => s.byId);
  const getOrFetch = useUsersStore((s) => s.getOrFetch);

  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftAvatar, setDraftAvatar] = useState<ClubAvatarColor>(
    CLUB_AVATAR_COLORS[0],
  );
  const [addMemberSheetOpen, setAddMemberSheetOpen] = useState(false);

  const reload = useCallback(() => {
    if (userId !== null) {
      void selectClub(userId, clubId);
    }
  }, [selectClub, userId, clubId]);

  useEffect(() => {
    reload();
    void refreshFriends();
  }, [reload, refreshFriends]);

  useFocusEffect(reload);

  useEffect(() => {
    if (detail === undefined || detail === null) return;
    detail.members.forEach((m) => {
      if (usersById[m.userId] === undefined) void getOrFetch(m.userId);
    });
  }, [detail, usersById, getOrFetch]);

  // Sync edit-draft when detail loads / changes.
  useEffect(() => {
    if (detail !== undefined && detail !== null) {
      setDraftName(detail.name);
      setDraftDescription(detail.description);
      setDraftAvatar(detail.avatarColor);
    }
  }, [detail]);

  const isOwner = detail !== undefined && detail !== null && detail.viewerRole === 'owner';

  const memberIdSet = useMemo(
    () => new Set(detail?.members.map((m) => m.userId) ?? []),
    [detail],
  );
  const addableFriends = useMemo(
    () => friendIds.filter((id) => !memberIdSet.has(id)),
    [friendIds, memberIdSet],
  );

  if (detail === undefined) {
    // Loading or not-yet-resolved.
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Header t={t} onBack={() => nav.goBack()} title="Клуб" />
        <View style={{ padding: 20 }}>
          <Text style={{ color: t.text2, fontFamily: t.font }}>Загрузка…</Text>
        </View>
      </View>
    );
  }

  if (detail === null) {
    // Repository returned null — clubId stale or viewer not a member.
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Header t={t} onBack={() => nav.goBack()} title="Клуб" />
        <View style={{ padding: 20 }}>
          <Card style={{ padding: 16 }}>
            <Text
              style={{
                color: t.text,
                fontSize: 14 * t.fontScale,
                fontFamily: t.font,
                lineHeight: 20,
              }}
            >
              Клуб недоступен. Возможно, его удалили или вы покинули клуб.
            </Text>
          </Card>
        </View>
      </View>
    );
  }

  const onSaveEdit = async () => {
    if (userId === null) return;
    try {
      await update(userId, {
        id: clubId,
        name: draftName,
        description: draftDescription,
        avatarColor: draftAvatar,
      });
      setEditing(false);
    } catch (e) {
      const msg = e instanceof ClubError ? e.message : String(e);
      Alert.alert('Не удалось сохранить', msg);
    }
  };

  const onDelete = () => {
    if (userId === null) return;
    Alert.alert(
      'Удалить клуб?',
      'Клуб и список участников будут удалены без возможности восстановить.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            try {
              await remove(userId, clubId);
              nav.goBack();
            } catch (e) {
              const msg = e instanceof ClubError ? e.message : String(e);
              Alert.alert('Не удалось удалить', msg);
            }
          },
        },
      ],
    );
  };

  const onLeave = () => {
    if (userId === null) return;
    Alert.alert('Покинуть клуб?', 'Вы перестанете видеть этот клуб у себя.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Покинуть',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeMemberAction(userId, clubId, userId);
            nav.goBack();
          } catch (e) {
            const msg = e instanceof ClubError ? e.message : String(e);
            Alert.alert('Не удалось покинуть клуб', msg);
          }
        },
      },
    ]);
  };

  const onKickMember = (targetUserId: string, label: string) => {
    if (userId === null) return;
    Alert.alert(`Удалить ${label}?`, 'Участник будет удалён из клуба.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeMemberAction(userId, clubId, targetUserId);
          } catch (e) {
            const msg = e instanceof ClubError ? e.message : String(e);
            Alert.alert('Не удалось удалить участника', msg);
          }
        },
      },
    ]);
  };

  const onAddFriend = async (friendId: string) => {
    if (userId === null) return;
    try {
      await addMemberAction(userId, clubId, friendId);
    } catch (e) {
      const msg = e instanceof ClubError ? e.message : String(e);
      Alert.alert('Не удалось добавить участника', msg);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 80 }}>
        <Header t={t} onBack={() => nav.goBack()} title="Клуб" />

        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          {/* Avatar + name + meta */}
          <Card style={{ padding: 20, alignItems: 'center' }}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: editing ? draftAvatar : detail.avatarColor,
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 14,
              }}
            >
              <Icon name="group" size={36} color="#0A0A0A" />
            </View>
            {editing ? (
              <View style={{ width: '100%' }}>
                <Text style={labelStyle(t)}>Название</Text>
                <TextInput
                  value={draftName}
                  onChangeText={setDraftName}
                  maxLength={CLUB_NAME_MAX}
                  style={inputStyle(t)}
                />
                <Text style={labelStyle(t)}>Описание</Text>
                <TextInput
                  value={draftDescription}
                  onChangeText={setDraftDescription}
                  multiline
                  maxLength={CLUB_DESCRIPTION_MAX}
                  style={[
                    inputStyle(t),
                    { minHeight: 88, textAlignVertical: 'top', paddingTop: 8 },
                  ]}
                />
                <Text style={labelStyle(t)}>Цвет</Text>
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 10,
                    marginTop: 8,
                  }}
                >
                  {CLUB_AVATAR_COLORS.map((color) => {
                    const sel = color === draftAvatar;
                    return (
                      <Pressable
                        key={color}
                        onPress={() => setDraftAvatar(color)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 16,
                          backgroundColor: color,
                          borderWidth: sel ? 3 : 0,
                          borderColor: t.text,
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {sel ? <Icon name="check" size={16} color="#0A0A0A" /> : null}
                      </Pressable>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                  <Button
                    variant="ghost"
                    size="md"
                    full
                    onPress={() => {
                      setEditing(false);
                      setDraftName(detail.name);
                      setDraftDescription(detail.description);
                      setDraftAvatar(detail.avatarColor);
                    }}
                  >
                    Отмена
                  </Button>
                  <Button
                    variant="primary"
                    size="md"
                    full
                    disabled={mutating || draftName.trim().length < 2}
                    onPress={onSaveEdit}
                  >
                    Сохранить
                  </Button>
                </View>
              </View>
            ) : (
              <>
                <Text
                  style={{
                    color: t.text,
                    fontSize: 22 * t.fontScale,
                    fontWeight: '800',
                    fontFamily: t.font,
                    textAlign: 'center',
                  }}
                >
                  {detail.name}
                </Text>
                {detail.description.length > 0 ? (
                  <Text
                    style={{
                      color: t.text2,
                      fontSize: 14 * t.fontScale,
                      marginTop: 8,
                      fontFamily: t.font,
                      lineHeight: 20,
                      textAlign: 'center',
                    }}
                  >
                    {detail.description}
                  </Text>
                ) : null}
                <Text
                  style={{
                    color: t.text3,
                    fontSize: 12 * t.fontScale,
                    marginTop: 10,
                    fontFamily: t.font,
                  }}
                >
                  {isOwner ? 'Вы владелец · ' : ''}
                  {detail.members.length}{' '}
                  {pluralize(detail.members.length, [
                    'участник',
                    'участника',
                    'участников',
                  ])}
                </Text>
                {isOwner ? (
                  <View style={{ marginTop: 14, width: '100%' }}>
                    <Button
                      variant="ghost"
                      size="md"
                      full
                      icon={<Icon name="edit" size={16} color={t.text} />}
                      onPress={() => setEditing(true)}
                    >
                      Редактировать
                    </Button>
                  </View>
                ) : null}
              </>
            )}
          </Card>

          {/* Members section */}
          <View>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
                paddingHorizontal: 4,
              }}
            >
              <Text
                style={{
                  color: t.text3,
                  fontSize: 11 * t.fontScale,
                  letterSpacing: 0.5,
                  fontWeight: '600',
                  fontFamily: t.font,
                }}
              >
                УЧАСТНИКИ
              </Text>
              {isOwner && addableFriends.length > 0 ? (
                <Pressable
                  onPress={() => setAddMemberSheetOpen(true)}
                  hitSlop={10}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Icon name="plus" size={14} color={t.lime} />
                  <Text
                    style={{
                      color: t.lime,
                      fontSize: 12 * t.fontScale,
                      fontWeight: '600',
                      fontFamily: t.font,
                    }}
                  >
                    Добавить
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <Card style={{ padding: 4 }}>
              {detail.members.map((member, idx) => {
                const profile = usersById[member.userId];
                const label =
                  member.userId === userId
                    ? 'Вы'
                    : profile?.displayName ?? profile?.username ?? 'Пользователь';
                return (
                  <View
                    key={member.userId}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderTopWidth: idx === 0 ? 0 : 1,
                      borderTopColor: t.surface3,
                      gap: 12,
                    }}
                  >
                    <Avatar size={36} name={label} />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          color: t.text,
                          fontSize: 14 * t.fontScale,
                          fontFamily: t.font,
                          fontWeight: '600',
                        }}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                      {member.role === 'owner' ? (
                        <Text
                          style={{
                            color: t.text3,
                            fontSize: 11 * t.fontScale,
                            fontFamily: t.font,
                            marginTop: 1,
                          }}
                        >
                          Владелец
                        </Text>
                      ) : null}
                    </View>
                    {isOwner && member.role !== 'owner' ? (
                      <Pressable
                        onPress={() => onKickMember(member.userId, label)}
                        hitSlop={10}
                      >
                        <Icon name="close" size={18} color={t.text3} />
                      </Pressable>
                    ) : null}
                  </View>
                );
              })}
            </Card>
          </View>

          {/* Danger zone */}
          {!editing ? (
            <View style={{ marginTop: 8 }}>
              {isOwner ? (
                <Button
                  variant="ghost"
                  size="md"
                  full
                  icon={<Icon name="trash" size={16} color={t.error} />}
                  onPress={onDelete}
                >
                  Удалить клуб
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="md"
                  full
                  icon={<Icon name="close" size={16} color={t.error} />}
                  onPress={onLeave}
                >
                  Покинуть клуб
                </Button>
              )}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Add-member modal */}
      <Modal
        visible={addMemberSheetOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAddMemberSheetOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: t.bg }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: t.surface3,
            }}
          >
            <Text
              style={{
                color: t.text,
                fontSize: 18 * t.fontScale,
                fontWeight: '700',
                fontFamily: t.font,
              }}
            >
              Добавить участника
            </Text>
            <Pressable onPress={() => setAddMemberSheetOpen(false)} hitSlop={10}>
              <Icon name="close" size={22} color={t.text} />
            </Pressable>
          </View>
          <ScrollView>
            {addableFriends.length === 0 ? (
              <View style={{ padding: 20 }}>
                <Text
                  style={{
                    color: t.text2,
                    fontSize: 13 * t.fontScale,
                    fontFamily: t.font,
                    lineHeight: 19,
                  }}
                >
                  Все ваши друзья уже в клубе.
                </Text>
              </View>
            ) : (
              addableFriends.map((friendId) => {
                const profile = usersById[friendId];
                const label =
                  profile?.displayName ?? profile?.username ?? 'Пользователь';
                return (
                  <Pressable
                    key={friendId}
                    onPress={async () => {
                      await onAddFriend(friendId);
                      if (addableFriends.length === 1) {
                        setAddMemberSheetOpen(false);
                      }
                    }}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: 16,
                      paddingVertical: 12,
                      gap: 12,
                      borderBottomWidth: 1,
                      borderBottomColor: t.surface3,
                    }}
                  >
                    <Avatar size={36} name={label} />
                    <Text
                      style={{
                        flex: 1,
                        color: t.text,
                        fontSize: 14 * t.fontScale,
                        fontFamily: t.font,
                      }}
                      numberOfLines={1}
                    >
                      {label}
                    </Text>
                    <Icon name="plus" size={20} color={t.lime} />
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Header({
  t,
  onBack,
  title,
}: {
  t: ReturnType<typeof useTheme>;
  onBack: () => void;
  title: string;
}) {
  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 }}>
      <Pressable onPress={onBack} hitSlop={10}>
        <Icon name="back" size={26} color={t.text} />
      </Pressable>
      <Text
        style={{
          marginTop: 18,
          fontSize: 30 * t.fontScale,
          fontWeight: '800',
          letterSpacing: -1,
          color: t.text,
          fontFamily: t.font,
        }}
      >
        {title}
      </Text>
    </View>
  );
}

function labelStyle(t: ReturnType<typeof useTheme>) {
  return {
    color: t.text3,
    fontSize: 11 * t.fontScale,
    letterSpacing: 0.5,
    fontWeight: '600' as const,
    fontFamily: t.font,
    marginTop: 12,
  };
}

function inputStyle(t: ReturnType<typeof useTheme>) {
  return {
    marginTop: 6,
    color: t.text,
    fontSize: 15 * t.fontScale,
    fontFamily: t.font,
    backgroundColor: t.surface2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  };
}

function pluralize(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}
