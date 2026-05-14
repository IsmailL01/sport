// Магазин (внутренняя валюта) — Round 3 P2 scaffold.
//
// Сейчас все товары — заглушки в состоянии «Скоро». Spend-механизм
// (`useWalletStore` через `recordTransaction({ kind: 'spend' })`) уже готов,
// но UI кнопок «Купить» намеренно disabled.
//
// Полная реализация — следующий раунд (Round 4+), потребует:
//   - Backend currency-service (источник истины баланса).
//   - Каталог товаров (server-driven).
//   - Receipt-based fulfilment + atomic spend через backend.
//   - Тесты антифрод (двойная покупка, double-spend).

import { Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Card, Icon, useTheme } from '../../../design';
import { useWalletStore } from '../../../state/wallet';
import type { MeStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<MeStackParamList, 'Shop'>;

type ItemCategory = {
  id: string;
  title: string;
  subtitle: string;
  icon: 'shield' | 'starFill' | 'flame' | 'medal';
  items: Array<{ id: string; name: string; priceCoins: number; description: string }>;
};

const CATEGORIES: ItemCategory[] = [
  {
    id: 'cosmetic',
    title: 'Косметика',
    subtitle: 'Темы карты, фоны профиля, рамки',
    icon: 'starFill',
    items: [
      { id: 'theme-aurora', name: 'Тема Aurora', priceCoins: 300, description: 'Зелёно-фиолетовый градиент' },
      { id: 'frame-gold', name: 'Золотая рамка', priceCoins: 500, description: 'Аватарная рамка S-grade' },
      { id: 'map-dark-pro', name: 'Карта Dark Pro', priceCoins: 800, description: 'Кастомный Mapbox style' },
    ],
  },
  {
    id: 'premium',
    title: 'Премиум',
    subtitle: 'Advanced analytics + экспорт',
    icon: 'shield',
    items: [
      { id: 'analytics-30d', name: 'Аналитика на 30 дней', priceCoins: 1500, description: 'TSS, race predictor, custom plans' },
      { id: 'export-fit', name: 'Экспорт в FIT', priceCoins: 200, description: 'Бесплатно для одной сессии, потом по тарифу' },
    ],
  },
  {
    id: 'challenges',
    title: 'Челленджи',
    subtitle: 'Входной билет в платный челлендж',
    icon: 'medal',
    items: [
      { id: 'spring-10k', name: '«Весенний 10K»', priceCoins: 400, description: 'Прозовой пул 50 000 монет' },
      { id: 'summer-marathon', name: '«Лето марафона»', priceCoins: 1200, description: '42.2 км до конца сентября' },
    ],
  },
  {
    id: 'consumables',
    title: 'Расходники',
    subtitle: 'Streak freeze, восстановление',
    icon: 'flame',
    items: [
      { id: 'streak-freeze', name: 'Заморозка стрика (1 день)', priceCoins: 150, description: 'Пропустить день без обнуления streak' },
      { id: 'data-export', name: 'Bulk export', priceCoins: 100, description: 'Все ваши сессии в одном архиве' },
    ],
  },
];

export function ShopScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const balance = useWalletStore((s) => s.balance);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 20, paddingTop: 56, paddingBottom: 12 }}>
        <Pressable onPress={() => nav.goBack()} hitSlop={10}>
          <Icon name="back" size={26} color={t.text} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 18 }}>
          <Text
            style={{
              fontSize: 30 * t.fontScale,
              fontWeight: '800',
              letterSpacing: -1,
              color: t.text,
              fontFamily: t.font,
            }}
          >
            Магазин
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Icon name="bolt" size={16} color={t.lime} />
            <Text
              style={{
                fontSize: 18 * t.fontScale,
                fontWeight: '800',
                fontFamily: t.fontDisplay,
                fontStyle: 'italic',
                color: t.text,
              }}
            >
              {balance.toLocaleString('ru-RU')}
            </Text>
          </View>
        </View>
      </View>

      {/* «Coming soon» баннер */}
      <View style={{ paddingHorizontal: 20, marginBottom: 14 }}>
        <Card
          style={{
            padding: 14,
            backgroundColor: 'rgba(198,245,96,0.08)',
            borderColor: 'rgba(198,245,96,0.24)',
            borderWidth: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <Icon name="info" size={20} color={t.lime} />
          <Text
            style={{
              flex: 1,
              color: t.text2,
              fontSize: 12 * t.fontScale,
              fontFamily: t.font,
              lineHeight: 16,
            }}
          >
            Магазин в режиме предпросмотра. Покупки заработают, когда подключим
            backend currency-service. Пока — копи монеты, тренируясь.
          </Text>
        </Card>
      </View>

      {/* Категории */}
      {CATEGORIES.map((cat) => (
        <View key={cat.id} style={{ marginBottom: 18 }}>
          <View style={{ paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: t.surface2,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name={cat.icon} size={16} color={t.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: t.text, fontSize: 16 * t.fontScale, fontWeight: '800', fontFamily: t.font }}>
                {cat.title}
              </Text>
              <Text style={{ color: t.text3, fontSize: 12 * t.fontScale, marginTop: 1, fontFamily: t.font }}>
                {cat.subtitle}
              </Text>
            </View>
          </View>
          <View style={{ paddingHorizontal: 20, gap: 8 }}>
            {cat.items.map((it) => {
              const affordable = balance >= it.priceCoins;
              return (
                <Card key={it.id} style={{ padding: 14, opacity: 0.85 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <Text style={{ color: t.text, fontSize: 14 * t.fontScale, fontWeight: '700', fontFamily: t.font, flex: 1 }}>
                      {it.name}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginLeft: 8 }}>
                      <Text
                        style={{
                          color: affordable ? t.lime : t.text3,
                          fontSize: 15 * t.fontScale,
                          fontWeight: '800',
                          fontFamily: t.fontDisplay,
                          fontStyle: 'italic',
                        }}
                      >
                        {it.priceCoins.toLocaleString('ru-RU')}
                      </Text>
                      <Text style={{ color: t.text3, fontSize: 11 * t.fontScale, fontFamily: t.font }}>
                        ⚡
                      </Text>
                    </View>
                  </View>
                  <Text style={{ color: t.text3, fontSize: 12 * t.fontScale, marginTop: 4, fontFamily: t.font }}>
                    {it.description}
                  </Text>
                  <View
                    style={{
                      marginTop: 10,
                      paddingVertical: 8,
                      backgroundColor: t.surface2,
                      borderRadius: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: t.text3, fontSize: 12 * t.fontScale, fontFamily: t.font }}>
                      Скоро
                    </Text>
                  </View>
                </Card>
              );
            })}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
