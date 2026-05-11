// Tab: Я / Clubs (list) — stub. Phase 8 / M8.
//
// Full clubs service отложен (user decision). Сейчас — placeholder с
// empty state и disabled CTA «Создать клуб». Реальная имплементация в
// Phase M11+ или позже.

import { Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Button, Card, Icon, useTheme } from '../../../design';
import type { MeStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<MeStackParamList, 'Clubs'>;

const SAMPLE_CLUBS = [
  { name: 'Чувашия Runners', members: 234, sub: 'регион · открытый' },
  { name: 'Parkrun Москва', members: 1850, sub: 'парк · еженедельно' },
  { name: 'Trail-Хищники', members: 67, sub: 'трейл · закрытый' },
];

export function ClubsScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 60 }}>
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
        <Text style={{ color: t.text2, fontSize: 14 * t.fontScale, marginTop: 6, fontFamily: t.font }}>
          Сообщества бегунов: parkruns, trail-команды, друзья по парку.
        </Text>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <Card style={{ padding: 16, backgroundColor: 'rgba(255,176,32,0.08)' }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Icon name="info" size={18} color={t.warn} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 14 * t.fontScale, fontWeight: '700', fontFamily: t.font }}>
                Скоро
              </Text>
              <Text style={{ color: t.text2, fontSize: 13 * t.fontScale, marginTop: 4, fontFamily: t.font, lineHeight: 18 }}>
                Реальные клубы появятся в следующих апдейтах. Пока — превью-список того, как это будет выглядеть.
              </Text>
            </View>
          </View>
        </Card>

        <Text
          style={{
            color: t.text3,
            fontSize: 11 * t.fontScale,
            letterSpacing: 0.5,
            fontFamily: t.font,
            marginTop: 20,
            marginBottom: 8,
          }}
        >
          ПРИМЕРЫ
        </Text>

        {SAMPLE_CLUBS.map((c, i) => (
          <Pressable
            key={i}
            onPress={() => nav.navigate('Club', { clubId: String(i) })}
          >
            {({ pressed }) => (
              <Card style={{ padding: 14, marginBottom: 10, opacity: pressed ? 0.7 : 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      backgroundColor: t.surface2,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Icon name="group" size={20} color={t.text} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontSize: 15 * t.fontScale, fontWeight: '700', fontFamily: t.font }}>
                      {c.name}
                    </Text>
                    <Text style={{ color: t.text3, fontSize: 12 * t.fontScale, marginTop: 2, fontFamily: t.font }}>
                      {c.members} участников · {c.sub}
                    </Text>
                  </View>
                  <Icon name="chevron" size={18} color={t.text3} />
                </View>
              </Card>
            )}
          </Pressable>
        ))}

        <View style={{ marginTop: 16 }}>
          <Button
            variant="primary"
            size="lg"
            full
            disabled
            icon={<Icon name="plus" size={18} color="#000" />}
            onPress={() => nav.navigate('CreateClub')}
          >
            Создать клуб (скоро)
          </Button>
        </View>
      </View>
    </ScrollView>
  );
}
