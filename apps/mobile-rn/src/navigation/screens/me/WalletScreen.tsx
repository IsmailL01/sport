// Tab: Я / Wallet. Внутренняя валюта.
//
// Layout:
//   - Header «Кошелёк» + back
//   - Hero: текущий баланс
//   - Заглушка «магазин — скоро»
//   - Список транзакций (последние 50)

import { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Card, Icon, useTheme } from '../../../design';
import { useAuthStore } from '../../../state/auth';
import { useWalletStore } from '../../../state/wallet';
import type { WalletTransaction } from '../../../storage/walletRepository';
import type { MeStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<MeStackParamList, 'Wallet'>;

export function WalletScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const balance = useWalletStore((s) => s.balance);
  const transactions = useWalletStore((s) => s.transactions);
  const refresh = useWalletStore((s) => s.refresh);
  const hydrate = useWalletStore((s) => s.hydrate);

  useEffect(() => {
    if (user !== null) hydrate(user.id);
    else refresh();
  }, [user, hydrate, refresh]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 60 }}>
      {/* Header */}
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
          Кошелёк
        </Text>
      </View>

      {/* Balance hero */}
      <View style={{ paddingHorizontal: 20 }}>
        <Card style={{ padding: 18 }}>
          <Text style={{ color: t.text3, fontSize: 11 * t.fontScale, letterSpacing: 0.5, fontFamily: t.font }}>
            БАЛАНС
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <Text
              style={{
                fontSize: 56 * t.fontScale,
                fontWeight: '800',
                fontFamily: t.fontDisplay,
                fontStyle: 'italic',
                letterSpacing: -2,
                color: t.text,
              }}
            >
              {balance.toLocaleString('ru-RU')}
            </Text>
            <Text style={{ color: t.text2, fontSize: 14 * t.fontScale, fontFamily: t.font }}>
              монет
            </Text>
          </View>
          <Text style={{ color: t.text3, fontSize: 12 * t.fontScale, marginTop: 8, fontFamily: t.font }}>
            Монеты начисляются за сожжённые калории на каждой записанной тренировке.
            См. правила и формулу в docs/CURRENCY.md.
          </Text>
        </Card>

        {/* Shop entry */}
        <Pressable onPress={() => nav.navigate('Shop')}>
          {({ pressed }) => (
            <Card style={{ marginTop: 12, padding: 16, opacity: pressed ? 0.7 : 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: t.surface2,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="bolt" size={18} color={t.text2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: t.text, fontSize: 14 * t.fontScale, fontWeight: '700', fontFamily: t.font }}>
                    Магазин
                  </Text>
                  <Text style={{ color: t.text3, fontSize: 12 * t.fontScale, marginTop: 2, fontFamily: t.font }}>
                    Косметика, премиум, входные билеты в челленджи
                  </Text>
                </View>
                <Icon name="chevron" size={18} color={t.text3} />
              </View>
            </Card>
          )}
        </Pressable>
      </View>

      {/* Transactions */}
      <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
        <Text
          style={{
            color: t.text3,
            fontSize: 11 * t.fontScale,
            letterSpacing: 0.5,
            fontFamily: t.font,
            marginBottom: 8,
          }}
        >
          ИСТОРИЯ
        </Text>
        {transactions.length === 0 ? (
          <Card style={{ padding: 20, alignItems: 'center' }}>
            <Text style={{ color: t.text3, fontSize: 13 * t.fontScale, fontFamily: t.font, textAlign: 'center' }}>
              Пока пусто — закончи первую тренировку, чтобы получить монеты.
            </Text>
          </Card>
        ) : (
          <Card style={{ paddingHorizontal: 14, paddingVertical: 4 }}>
            {transactions.map((tx, idx) => (
              <TransactionRow
                key={tx.id}
                tx={tx}
                divider={idx < transactions.length - 1}
                t={t}
              />
            ))}
          </Card>
        )}
      </View>
    </ScrollView>
  );
}

function TransactionRow({
  tx,
  divider,
  t,
}: {
  tx: WalletTransaction;
  divider: boolean;
  t: ReturnType<typeof useTheme>;
}) {
  const positive = tx.kind === 'earn' || (tx.kind === 'adjust' && tx.amount >= 0);
  const sign = positive ? '+' : '−';
  const title = (() => {
    if (tx.source === 'session') return 'Тренировка';
    if (tx.source === 'promo') return 'Промо';
    if (tx.source === 'refund') return 'Возврат';
    return 'Корректировка';
  })();
  const subtitle = (() => {
    const meta = tx.meta;
    if (meta !== null) {
      const kcal = typeof meta.kcal === 'number' ? `${meta.kcal} ккал` : null;
      const activity = typeof meta.activity === 'string' ? meta.activity : null;
      const parts: string[] = [];
      if (activity) parts.push(activity);
      if (kcal) parts.push(kcal);
      if (meta.capped === true) parts.push('лимит дня');
      if (parts.length > 0) return parts.join(' · ');
    }
    return new Date(tx.ts).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });
  })();

  return (
    <View
      style={{
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderBottomWidth: divider ? 1 : 0,
        borderBottomColor: t.divider,
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 14 * t.fontScale, fontWeight: '600', fontFamily: t.font }}>
          {title}
        </Text>
        <Text style={{ color: t.text3, fontSize: 12 * t.fontScale, marginTop: 2, fontFamily: t.font }}>
          {subtitle}
        </Text>
      </View>
      <Text
        style={{
          color: positive ? t.lime : t.error,
          fontSize: 15 * t.fontScale,
          fontWeight: '800',
          fontFamily: t.fontDisplay,
          fontStyle: 'italic',
        }}
      >
        {sign}
        {tx.amount}
      </Text>
    </View>
  );
}
