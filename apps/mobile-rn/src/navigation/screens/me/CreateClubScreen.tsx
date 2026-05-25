// Tab: Я / CreateClub.
//
// Real form (name + description + avatar color + member picker from friends).
// Local-first — no backend. Quick task: profile-clubs-polish.

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
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

type Nav = NativeStackNavigationProp<MeStackParamList, 'CreateClub'>;

export function CreateClubScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const ownerId = user?.id ?? '';

  const friendIds = useFriendsStore((s) => s.friendIds);
  const refreshFriends = useFriendsStore((s) => s.refresh);
  const usersById = useUsersStore((s) => s.byId);
  const getOrFetch = useUsersStore((s) => s.getOrFetch);

  const totalClubs = useClubsStore((s) => s.clubs.length);
  const pickDefaultAvatarColor = useClubsStore((s) => s.pickDefaultAvatarColor);
  const createClub = useClubsStore((s) => s.create);
  const mutating = useClubsStore((s) => s.mutating);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [avatarColor, setAvatarColor] = useState<ClubAvatarColor>(
    pickDefaultAvatarColor(totalClubs),
  );
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  useEffect(() => {
    void refreshFriends();
  }, [refreshFriends]);

  useEffect(() => {
    friendIds.forEach((id) => {
      if (usersById[id] === undefined) void getOrFetch(id);
    });
  }, [friendIds, usersById, getOrFetch]);

  const trimmedName = name.trim();
  const canSubmit =
    trimmedName.length >= 2 &&
    trimmedName.length <= CLUB_NAME_MAX &&
    description.length <= CLUB_DESCRIPTION_MAX &&
    ownerId.length > 0 &&
    !mutating;

  const toggleMember = (memberId: string) => {
    setSelectedMemberIds((current) =>
      current.includes(memberId)
        ? current.filter((id) => id !== memberId)
        : [...current, memberId],
    );
  };

  const sortedFriendRows = useMemo(() => {
    return friendIds
      .map((id) => ({
        id,
        label: usersById[id]?.displayName ?? usersById[id]?.username ?? 'Пользователь',
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'ru'));
  }, [friendIds, usersById]);

  const onSubmit = async () => {
    try {
      const id = await createClub({
        ownerId,
        name: trimmedName,
        description,
        avatarColor,
        memberIds: selectedMemberIds,
      });
      nav.replace('Club', { clubId: id });
    } catch (e) {
      const msg = e instanceof ClubError ? e.message : String(e);
      Alert.alert('Не удалось создать клуб', msg);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 }}>
          <Pressable onPress={() => nav.goBack()} hitSlop={10}>
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
            Новый клуб
          </Text>
        </View>

        <View style={{ paddingHorizontal: 20, gap: 16 }}>
          <Card style={{ padding: 16 }}>
            <Text style={labelStyle(t)}>Название</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Например: Чувашия Runners"
              placeholderTextColor={t.text3}
              maxLength={CLUB_NAME_MAX}
              style={inputStyle(t)}
            />
            <Text style={hintStyle(t)}>
              {trimmedName.length}/{CLUB_NAME_MAX}
            </Text>
          </Card>

          <Card style={{ padding: 16 }}>
            <Text style={labelStyle(t)}>Описание</Text>
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="Кто, где, как часто бегаете"
              placeholderTextColor={t.text3}
              multiline
              maxLength={CLUB_DESCRIPTION_MAX}
              style={[
                inputStyle(t),
                { minHeight: 96, textAlignVertical: 'top', paddingTop: 8 },
              ]}
            />
            <Text style={hintStyle(t)}>
              {description.length}/{CLUB_DESCRIPTION_MAX}
            </Text>
          </Card>

          <Card style={{ padding: 16 }}>
            <Text style={labelStyle(t)}>Цвет аватарки</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
              {CLUB_AVATAR_COLORS.map((color) => {
                const selected = color === avatarColor;
                return (
                  <Pressable
                    key={color}
                    onPress={() => setAvatarColor(color)}
                    hitSlop={6}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: color,
                      borderWidth: selected ? 3 : 0,
                      borderColor: t.text,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {selected ? <Icon name="check" size={20} color="#0A0A0A" /> : null}
                  </Pressable>
                );
              })}
            </View>
          </Card>

          <Card style={{ padding: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text style={labelStyle(t)}>Участники</Text>
              <Text
                style={{
                  color: t.text3,
                  fontSize: 12 * t.fontScale,
                  fontFamily: t.font,
                }}
              >
                {selectedMemberIds.length} выбрано
              </Text>
            </View>
            {friendIds.length === 0 ? (
              <Text
                style={{
                  marginTop: 12,
                  color: t.text2,
                  fontSize: 13 * t.fontScale,
                  lineHeight: 19,
                  fontFamily: t.font,
                }}
              >
                У вас пока нет друзей. Клуб можно создать соло — добавите участников позже из меню клуба.
              </Text>
            ) : (
              <View style={{ marginTop: 8 }}>
                {sortedFriendRows.map(({ id, label }) => {
                  const selected = selectedMemberIds.includes(id);
                  return (
                    <Pressable
                      key={id}
                      onPress={() => toggleMember(id)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 10,
                        gap: 12,
                      }}
                    >
                      <Avatar size={32} name={label} />
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
                      <View
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          borderWidth: 2,
                          borderColor: selected ? t.lime : t.text3,
                          backgroundColor: selected ? t.lime : 'transparent',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {selected ? <Icon name="check" size={16} color="#0A0A0A" /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </Card>

          <View style={{ marginTop: 8 }}>
            <Button
              variant="primary"
              size="lg"
              full
              disabled={!canSubmit}
              icon={<Icon name="check" size={18} color="#000" />}
              onPress={onSubmit}
            >
              Создать клуб
            </Button>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function labelStyle(t: ReturnType<typeof useTheme>) {
  return {
    color: t.text3,
    fontSize: 11 * t.fontScale,
    letterSpacing: 0.5,
    fontWeight: '600' as const,
    fontFamily: t.font,
  };
}

function inputStyle(t: ReturnType<typeof useTheme>) {
  return {
    marginTop: 8,
    color: t.text,
    fontSize: 15 * t.fontScale,
    fontFamily: t.font,
    backgroundColor: t.surface2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  };
}

function hintStyle(t: ReturnType<typeof useTheme>) {
  return {
    marginTop: 6,
    color: t.text3,
    fontSize: 11 * t.fontScale,
    fontFamily: t.font,
    textAlign: 'right' as const,
  };
}
