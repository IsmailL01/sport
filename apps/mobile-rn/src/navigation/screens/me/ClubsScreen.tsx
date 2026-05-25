// Tab: Я / Clubs (list).
//
// Local-first clubs feature (quick-task profile-clubs-polish).
// Lists clubs the current user belongs to (owner or member).
// Backend sync deferred to v1.0.1 (CLUBS-BACKEND-SYNC backlog).

import { useCallback, useEffect } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button, Card, FAB, Icon, useTheme } from '../../../design';
import { useAuthStore } from '../../../state/auth';
import { useClubsStore } from '../../../modules/clubs/state/useClubsStore';
import type { ClubSummary } from '../../../modules/clubs/domain/types';
import type { MeStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<MeStackParamList, 'Clubs'>;

export function ClubsScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? null;

  const clubs = useClubsStore((s) => s.clubs);
  const loading = useClubsStore((s) => s.loading);
  const refresh = useClubsStore((s) => s.refresh);

  const reload = useCallback(() => {
    if (userId !== null) {
      void refresh(userId);
    }
  }, [refresh, userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  useFocusEffect(reload);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={reload} tintColor={t.text} />
        }
      >
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
            Клубы
          </Text>
          <Text
            style={{
              color: t.text2,
              fontSize: 14 * t.fontScale,
              marginTop: 6,
              fontFamily: t.font,
            }}
          >
            {clubs.length === 0
              ? 'Создайте свой первый клуб'
              : `Вы участник в ${clubs.length} ${pluralize(clubs.length, ['клубе', 'клубах', 'клубах'])}`}
          </Text>
        </View>

        <View style={{ paddingHorizontal: 20 }}>
          {clubs.length === 0 ? (
            <EmptyState t={t} onCreate={() => nav.navigate('CreateClub')} />
          ) : (
            clubs.map((club) => (
              <ClubRow
                key={club.id}
                club={club}
                onPress={() => nav.navigate('Club', { clubId: club.id })}
                t={t}
              />
            ))
          )}
        </View>
      </ScrollView>

      {clubs.length > 0 ? (
        <FAB
          icon={<Icon name="plus" size={22} color="#000" />}
          onPress={() => nav.navigate('CreateClub')}
          style={{ position: 'absolute', right: 20, bottom: 28 }}
        />
      ) : null}
    </View>
  );
}

function ClubRow({
  club,
  onPress,
  t,
}: {
  club: ClubSummary;
  onPress: () => void;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <Card style={{ padding: 14, marginBottom: 10, opacity: pressed ? 0.7 : 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: club.avatarColor,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="group" size={22} color="#0A0A0A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  color: t.text,
                  fontSize: 15 * t.fontScale,
                  fontWeight: '700',
                  fontFamily: t.font,
                }}
                numberOfLines={1}
              >
                {club.name}
              </Text>
              <Text
                style={{
                  color: t.text3,
                  fontSize: 12 * t.fontScale,
                  marginTop: 2,
                  fontFamily: t.font,
                }}
              >
                {club.membersCount}{' '}
                {pluralize(club.membersCount, ['участник', 'участника', 'участников'])}
                {club.viewerRole === 'owner' ? ' · вы владелец' : ''}
              </Text>
            </View>
            <Icon name="chevron" size={18} color={t.text3} />
          </View>
        </Card>
      )}
    </Pressable>
  );
}

function EmptyState({
  t,
  onCreate,
}: {
  t: ReturnType<typeof useTheme>;
  onCreate: () => void;
}) {
  return (
    <Card style={{ padding: 24, alignItems: 'center' }}>
      <View
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          backgroundColor: t.surface2,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}
      >
        <Icon name="group" size={28} color={t.text2} />
      </View>
      <Text
        style={{
          color: t.text,
          fontSize: 16 * t.fontScale,
          fontWeight: '700',
          fontFamily: t.font,
          textAlign: 'center',
        }}
      >
        У вас пока нет клубов
      </Text>
      <Text
        style={{
          color: t.text2,
          fontSize: 13 * t.fontScale,
          marginTop: 6,
          marginBottom: 18,
          fontFamily: t.font,
          textAlign: 'center',
          lineHeight: 19,
        }}
      >
        Соберите беговую команду, parkrun-группу или клуб друзей. Добавьте участников из списка ваших друзей.
      </Text>
      <Button
        variant="primary"
        size="lg"
        full
        icon={<Icon name="plus" size={18} color="#000" />}
        onPress={onCreate}
      >
        Создать клуб
      </Button>
    </Card>
  );
}

function pluralize(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}
