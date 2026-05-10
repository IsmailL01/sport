// Tab: Я (Profile) — stub. Real M9.

import { ImageBackground, ScrollView, Text, View } from 'react-native';

import { Avatar, Card, GradeBadge, Icon, useTheme } from '../../../design';

export function MeScreenStub() {
  const t = useTheme();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Cover */}
      <ImageBackground
        source={{ uri: 'https://images.unsplash.com/photo-1483721310020-03333e577078?w=800' }}
        style={{ height: 200 }}
        imageStyle={{ opacity: 0.55 }}
      >
        <View style={{ position: 'absolute', top: 12, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', paddingTop: 40 }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="back" size={20} color={t.text} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="chat" size={18} color={t.text} />
            </View>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="more" size={20} color={t.text} />
            </View>
          </View>
        </View>
      </ImageBackground>

      <View style={{ paddingHorizontal: 16, marginTop: -64 }}>
        <View style={{ alignItems: 'center' }}>
          <View style={{ position: 'relative' }}>
            <Avatar src="https://i.pravatar.cc/200?img=33" size={96} />
            <View style={{ position: 'absolute', bottom: 0, right: 0 }}>
              <GradeBadge grade="C+" size={32} />
            </View>
          </View>
          <Text style={{ fontSize: 24 * t.fontScale, fontWeight: '800', marginTop: 10, letterSpacing: -0.5, color: t.text, fontFamily: t.font }}>
            Эдуард
          </Text>
          <Text style={{ fontSize: 13 * t.fontScale, color: t.text2, marginTop: 2, fontFamily: t.font }}>
            Москва · бег 6 мес. · <Text style={{ color: t.lime }}>Подробнее</Text>
          </Text>
        </View>

        {/* Verify CTA */}
        <View style={{ marginTop: 18, backgroundColor: t.lime, borderRadius: t.r.lg, padding: 16, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15 * t.fontScale, fontWeight: '800', color: '#0A0A0A', fontFamily: t.font }}>
              Доступ к забегам
            </Text>
            <Text style={{ fontSize: 12 * t.fontScale, color: '#0A0A0A', opacity: 0.7, marginTop: 2, fontFamily: t.font }}>
              Пройди обязательную верификацию
            </Text>
          </View>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="arrow" size={18} color="#FFFFFF" />
          </View>
        </View>

        {/* Stats */}
        <View style={{ marginTop: 12, flexDirection: 'row', gap: 10 }}>
          {[['450', 'тренировок'], ['1,8к', 'км всего'], ['82', 'часа в пути']].map(([v, l]) => (
            <Card key={l} p={12} style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 24 * t.fontScale,
                  fontWeight: '800',
                  color: t.text,
                  letterSpacing: -0.5,
                  fontFamily: t.fontDisplay,
                  fontStyle: 'italic',
                }}
              >
                {v}
              </Text>
              <Text style={{ fontSize: 11 * t.fontScale, color: t.text3, marginTop: 2, fontFamily: t.font }}>{l}</Text>
            </Card>
          ))}
        </View>

        {/* XP bar */}
        <Card style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontSize: 15 * t.fontScale, fontWeight: '700', color: t.text, fontFamily: t.font }}>
              1 250 Experience
            </Text>
            <GradeBadge grade="C+" size={24} />
          </View>
          <View style={{ marginTop: 12, height: 8, backgroundColor: t.surface2, borderRadius: 4, overflow: 'hidden' }}>
            <View style={{ width: '60%', height: '100%', backgroundColor: t.lime }} />
          </View>
          <Text style={{ marginTop: 8, fontSize: 12 * t.fontScale, color: t.text3, fontFamily: t.font }}>
            До грейда B ещё <Text style={{ color: t.lime, fontWeight: '700' }}>250 XP</Text>
          </Text>
        </Card>
      </View>
    </ScrollView>
  );
}
