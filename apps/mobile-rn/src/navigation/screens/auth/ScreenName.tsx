// Auth: name entry stub. M4 — real bind to profiles.display_name.

import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Button, useTheme } from '../../../design';

export function ScreenName({ onContinue }: { onContinue?: (name: string) => void }) {
  const t = useTheme();
  const [name, setName] = useState('');
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, padding: 24, paddingTop: 60 }}>
      <View style={{ height: 44 }} />
      <Text style={{ fontSize: 32 * t.fontScale, fontWeight: '800', letterSpacing: -1, color: t.text, fontFamily: t.font }}>
        Как тебя зовут?
      </Text>
      <Text style={{ fontSize: 15 * t.fontScale, color: t.text2, marginTop: 10, lineHeight: 22, fontFamily: t.font }}>
        Это имя увидят другие бегуны в твоём профиле
      </Text>

      <View style={{ marginTop: 32, backgroundColor: t.surface, borderRadius: t.r.md, padding: 18 }}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Эдуард"
          placeholderTextColor={t.text3}
          style={{
            fontSize: 22 * t.fontScale,
            fontWeight: '600',
            color: t.text,
            fontFamily: t.font,
            padding: 0,
          }}
        />
      </View>

      <View style={{ flex: 1 }} />

      <Text style={{ fontSize: 13 * t.fontScale, color: t.text3, lineHeight: 20, marginBottom: 16, fontFamily: t.font }}>
        Нажимая «Продолжить», ты соглашаешься <Text style={{ color: t.text }}>с правилами обработки персональных данных</Text>
      </Text>
      <Button variant="primary" size="lg" full disabled={name.trim().length === 0} onPress={() => onContinue?.(name.trim())}>
        Продолжить
      </Button>
    </View>
  );
}
