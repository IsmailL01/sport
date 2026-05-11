// Tab: Я / Create Club — stub. Phase 8 / M8.

import { Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Card, Icon, useTheme } from '../../../design';
import type { MeStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<MeStackParamList, 'CreateClub'>;

export function CreateClubScreen() {
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
          Создать клуб
        </Text>
      </View>

      <View style={{ paddingHorizontal: 20 }}>
        <Card style={{ padding: 16, backgroundColor: 'rgba(255,176,32,0.08)' }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
            <Icon name="info" size={18} color={t.warn} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 14 * t.fontScale, fontWeight: '700', fontFamily: t.font }}>
                В разработке
              </Text>
              <Text
                style={{
                  color: t.text2,
                  fontSize: 13 * t.fontScale,
                  marginTop: 4,
                  fontFamily: t.font,
                  lineHeight: 18,
                }}
              >
                Конструктор клубов с правами, моделями участия и ивентами появится после backend-сервиса клубов.
              </Text>
            </View>
          </View>
        </Card>
      </View>
    </ScrollView>
  );
}
