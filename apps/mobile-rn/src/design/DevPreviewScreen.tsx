// Dev-only preview screen: rendering каждого design-primitive для visual
// проверки. Не входит в production navigation; подключается через
// Tweaks-panel в Phase M11.
//
// Phase 8 / M1.

import { ScrollView, Text, View } from 'react-native';

import {
  Avatar,
  Button,
  Card,
  Chip,
  FAB,
  GradeBadge,
  Icon,
  Logo,
  Metric,
  SectionHeader,
  TabBar,
  TopBar,
  Verified,
  XPBadge,
  useTheme,
} from './index';

export function DevPreviewScreen() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <TopBar
        brand="cursona"
        trailing={
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Icon name="search" size={22} color={t.text} />
            <Icon name="bell" size={22} color={t.text} />
          </View>
        }
      />

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <SectionHeader title="Logo + brand" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <Logo size={28} />
          <Logo size={48} />
          <Logo size={72} color={t.accent} />
        </View>

        <SectionHeader title="Buttons" />
        <View style={{ gap: 8, marginBottom: 24 }}>
          <Button variant="primary" size="lg" full>Primary lg · НАЧАТЬ</Button>
          <Button variant="accent" size="md" full>Accent md</Button>
          <Button variant="secondary" size="md" full>Secondary md</Button>
          <Button variant="ghost" size="md" full>Ghost md</Button>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button variant="primary" size="sm">Small</Button>
            <Button variant="accent" size="sm" icon={<Icon name="play" size={14} color="#fff" />}>Run</Button>
          </View>
        </View>

        <SectionHeader title="FAB" />
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24 }}>
          <FAB icon={<Icon name="plus" size={24} color="#fff" />} />
          <FAB icon={<Icon name="play" size={24} color="#fff" />} color={t.lime} />
        </View>

        <SectionHeader title="Chips" />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
          <Chip icon={<Icon name="bolt" size={11} color={t.lime} />} bg="rgba(198,245,96,0.15)" color={t.lime}>+17 XP</Chip>
          <Chip icon={<Icon name="watch" size={11} color={t.text2} />} bg={t.surface2} color={t.text2}>Garmin</Chip>
          <Chip icon={<Icon name="sun" size={11} color={t.text2} />} bg={t.surface2} color={t.text2}>+25°</Chip>
          <Chip bg="rgba(255,77,46,0.15)" color={t.accent}>● ЗАПИСЬ</Chip>
        </View>

        <SectionHeader title="Avatars" />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 14, marginBottom: 24 }}>
          <Avatar src="https://i.pravatar.cc/200?img=24" size={24} />
          <Avatar src="https://i.pravatar.cc/200?img=40" size={40} />
          <Avatar src="https://i.pravatar.cc/200?img=56" size={56} grade="A" />
          <Avatar src="https://i.pravatar.cc/200?img=96" size={96} grade="S" online />
        </View>

        <SectionHeader title="Grades" />
        <Card style={{ marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {['D','D+','C','C+','B','B+','A','A+','S'].map((g) => (
              <View key={g} style={{ alignItems: 'center', gap: 6 }}>
                <GradeBadge grade={g} size={36} />
                <Text style={{ fontSize: 10, color: t.text3, fontFamily: t.font }}>{g}</Text>
              </View>
            ))}
          </View>
        </Card>

        <SectionHeader title="Metrics" />
        <Card style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: 'row', gap: 24 }}>
            <Metric size="lg" value="16,00" label="км" italic />
            <Metric size="lg" value="01:18" label="время" italic />
            <Metric size="lg" value="04:55" label="темп" italic />
          </View>
        </Card>
        <Card style={{ marginBottom: 24 }}>
          <Metric size="xxl" value="5,42" label="ДИСТАНЦИЯ" italic accent={t.text} />
        </Card>

        <SectionHeader title="XP badge" />
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 24 }}>
          <XPBadge value={17} />
          <XPBadge value={142} />
        </View>

        <SectionHeader title="Verified" />
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24, alignItems: 'center' }}>
          <Verified size={18} />
          <Verified size={24} />
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      <TabBar active="record" />
    </View>
  );
}
