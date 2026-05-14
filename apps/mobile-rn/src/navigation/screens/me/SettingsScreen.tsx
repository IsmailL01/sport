// Tab: Я / Settings.
//
// Sections:
//   - Аккаунт: email + Logout + Удалить аккаунт (stub Alert)
//   - Отображение: theme dark/light/auto + units km/mi
//   - Уведомления (placeholder)
//   - Дисплей (DEV): font/density/radius tweaks
//   - О приложении: версия

import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { Card, Icon, useTheme, useThemeStore, useTweak } from '../../../design';
import { useAuthStore } from '../../../state/auth';
import { useSettingsStore } from '../../../state/settings';
import type { MeStackParamList } from '../../types';

type Nav = NativeStackNavigationProp<MeStackParamList, 'Settings'>;

const APP_VERSION = '0.9';

export function SettingsScreen() {
  const t = useTheme();
  const nav = useNavigation<Nav>();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const units = useSettingsStore((s) => s.units);
  const setUnits = useSettingsStore((s) => s.setUnits);
  const mapStyle = useSettingsStore((s) => s.mapStyle);
  const setMapStyle = useSettingsStore((s) => s.setMapStyle);
  const phoneE164 = useSettingsStore((s) => s.phoneE164);
  const setPhoneE164 = useSettingsStore((s) => s.setPhoneE164);
  const [phoneDraft, setPhoneDraft] = useState<string>(phoneE164 ?? '');

  const [theme, setThemeTweak] = useTweak('theme');
  const [fontSize, setFontSize] = useTweak('fontSize');
  const [density, setDensity] = useTweak('density');
  const [radiusScale, setRadius] = useTweak('radiusScale');
  const resetTweaks = useThemeStore((s) => s.reset);

  const handleLogout = () => {
    Alert.alert('Выйти из аккаунта?', '', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: () => logout().catch((e) => console.warn('[Settings] logout failed', e)),
      },
    ]);
  };

  const handleDelete = () => {
    Alert.alert(
      'Удалить аккаунт?',
      'Действие необратимо. Все пробежки, посты и подписки будут удалены через 30 дней.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: () => Alert.alert('Скоро', 'Удаление аккаунта будет доступно в Phase E.'),
        },
      ],
    );
  };

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
          Настройки
        </Text>
      </View>

      {/* Аккаунт */}
      <Section title="Аккаунт" t={t}>
        <Row label="Email" value={user?.email ?? '—'} t={t} />
        <Row label="ID" value={user?.id ?? '—'} t={t} mono />
        <View style={{ paddingVertical: 10 }}>
          <Text style={{ color: t.text2, fontSize: 13 * t.fontScale, fontFamily: t.font, marginBottom: 6 }}>
            Телефон
          </Text>
          <TextInput
            value={phoneDraft}
            onChangeText={setPhoneDraft}
            onEndEditing={() => setPhoneE164(phoneDraft)}
            placeholder="+7 999 1234567"
            placeholderTextColor={t.text3}
            keyboardType="phone-pad"
            autoCorrect={false}
            style={{
              backgroundColor: t.surface2,
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 10,
              color: t.text,
              fontSize: 14 * t.fontScale,
              fontFamily: t.font,
            }}
          />
          <Text style={{ color: t.text3, fontSize: 11 * t.fontScale, fontFamily: t.font, marginTop: 6 }}>
            Хранится только на этом устройстве. Поиск чатов по номеру появится в следующих версиях.
          </Text>
        </View>
        <Pressable onPress={handleLogout}>
          {({ pressed }) => (
            <View style={{ paddingVertical: 14, opacity: pressed ? 0.6 : 1 }}>
              <Text style={{ color: t.text, fontSize: 15 * t.fontScale, fontWeight: '600', fontFamily: t.font }}>
                Выйти из аккаунта
              </Text>
            </View>
          )}
        </Pressable>
        <Pressable onPress={handleDelete}>
          {({ pressed }) => (
            <View style={{ paddingVertical: 14, opacity: pressed ? 0.6 : 1 }}>
              <Text style={{ color: t.error, fontSize: 15 * t.fontScale, fontWeight: '600', fontFamily: t.font }}>
                Удалить аккаунт
              </Text>
            </View>
          )}
        </Pressable>
      </Section>

      {/* Отображение — user-facing */}
      <Section title="Отображение" t={t}>
        <ToggleRow
          label="Тема"
          options={[
            { id: 'dark', label: 'Тёмная' },
            { id: 'light', label: 'Светлая' },
          ]}
          value={theme}
          onChange={setThemeTweak}
          t={t}
        />
        <ToggleRow
          label="Единицы"
          options={[
            { id: 'metric', label: 'Километры' },
            { id: 'imperial', label: 'Мили' },
          ]}
          value={units}
          onChange={setUnits}
          t={t}
        />
        <ToggleRow
          label="Карта"
          options={[
            { id: 'outdoors', label: 'Спорт' },
            { id: 'streets', label: 'Улицы' },
            { id: 'satellite', label: 'Спутник' },
          ]}
          value={mapStyle}
          onChange={setMapStyle}
          t={t}
        />
      </Section>

      {/* Уведомления (placeholder) */}
      <Section title="Уведомления" t={t}>
        <Row label="Push-уведомления" value="включены" t={t} />
        <Row label="Звук" value="включен" t={t} />
        <Text style={{ color: t.text3, fontSize: 12 * t.fontScale, marginTop: 4, fontFamily: t.font }}>
          Управление в системных настройках устройства.
        </Text>
      </Section>

      {/* Display tweaks — DEV ONLY */}
      {__DEV__ ? (
        <Section title="Дисплей (DEV)" t={t}>
          <SliderRow
            label="Размер шрифта"
            value={fontSize}
            min={0.85}
            max={1.25}
            step={0.05}
            onChange={setFontSize}
            t={t}
          />
          <SliderRow
            label="Плотность"
            value={density}
            min={0.8}
            max={1.3}
            step={0.05}
            onChange={setDensity}
            t={t}
          />
          <SliderRow
            label="Радиусы"
            value={radiusScale}
            min={0.5}
            max={1.5}
            step={0.1}
            onChange={setRadius}
            t={t}
          />
          <Pressable
            onPress={() => {
              resetTweaks();
            }}
          >
            {({ pressed }) => (
              <View style={{ paddingVertical: 12, opacity: pressed ? 0.6 : 1 }}>
                <Text style={{ color: t.lime, fontSize: 14 * t.fontScale, fontWeight: '600', fontFamily: t.font }}>
                  Сбросить дисплейные tweaks
                </Text>
              </View>
            )}
          </Pressable>
        </Section>
      ) : null}

      {/* About */}
      <Section title="О приложении" t={t}>
        <Row label="Версия" value={APP_VERSION} t={t} />
        <Row label="Платформа" value="React Native (Expo)" t={t} />
        <Row label="Backend" value="148-253-214-156.sslip.io" t={t} mono />
      </Section>
    </ScrollView>
  );
}

function Section({
  title,
  children,
  t,
}: {
  title: string;
  children: React.ReactNode;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
      <Text
        style={{
          color: t.text3,
          fontSize: 11 * t.fontScale,
          letterSpacing: 0.5,
          fontFamily: t.font,
          marginTop: 16,
          marginBottom: 8,
        }}
      >
        {title.toUpperCase()}
      </Text>
      <Card style={{ paddingVertical: 4, paddingHorizontal: 16 }}>{children}</Card>
    </View>
  );
}

function Row({
  label,
  value,
  t,
  mono,
}: {
  label: string;
  value: string;
  t: ReturnType<typeof useTheme>;
  mono?: boolean;
}) {
  return (
    <View style={{ paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ color: t.text2, fontSize: 14 * t.fontScale, fontFamily: t.font }}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          color: t.text,
          fontSize: 13 * t.fontScale,
          fontWeight: '600',
          fontFamily: mono ? 'Courier' : t.font,
          maxWidth: '60%',
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function ToggleRow<T extends string>({
  label,
  options,
  value,
  onChange,
  t,
}: {
  label: string;
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  t: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={{ paddingVertical: 12 }}>
      <Text style={{ color: t.text2, fontSize: 13 * t.fontScale, fontFamily: t.font, marginBottom: 8 }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {options.map((o) => {
          const active = o.id === value;
          return (
            <Pressable key={o.id} onPress={() => onChange(o.id)} hitSlop={4}>
              <View
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: active ? t.lime : t.surface2,
                }}
              >
                <Text style={{ color: active ? '#000' : t.text, fontSize: 13 * t.fontScale, fontWeight: '600', fontFamily: t.font }}>
                  {o.label}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  t,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  t: ReturnType<typeof useTheme>;
}) {
  const dec = () => {
    const next = Math.max(min, Math.round((value - step) * 100) / 100);
    onChange(next);
  };
  const inc = () => {
    const next = Math.min(max, Math.round((value + step) * 100) / 100);
    onChange(next);
  };
  return (
    <View style={{ paddingVertical: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: t.text2, fontSize: 13 * t.fontScale, fontFamily: t.font }}>{label}</Text>
        <Text style={{ color: t.text, fontSize: 13 * t.fontScale, fontWeight: '600', fontFamily: t.fontDisplay }}>
          {value.toFixed(2)}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Pressable onPress={dec} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: t.surface2, borderRadius: 999 }}>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>−</Text>
        </Pressable>
        <Pressable onPress={inc} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, backgroundColor: t.surface2, borderRadius: 999 }}>
          <Text style={{ color: t.text, fontSize: 18, fontWeight: '800' }}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}
