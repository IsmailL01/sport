// Tab: Лента (Feed) — stub placeholder.
// Реальная имплементация — Phase M5 (stories rail + RunCards FlatList).

import { ScrollView, View } from 'react-native';

import { Icon, RunCard, SectionHeader, StoryRing, TopBar, useTheme } from '../../../design';

export function FeedScreenStub() {
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

      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        {/* Stories rail */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ padding: 12, gap: 8 }}>
          <StoryRing src="https://i.pravatar.cc/100?img=33" name="Ты" isOwn />
          <StoryRing src="https://i.pravatar.cc/100?img=47" name="Анастасия" grade="A" />
          <StoryRing src="https://i.pravatar.cc/100?img=12" name="Андрей" grade="B" />
          <StoryRing src="https://i.pravatar.cc/100?img=25" name="Маша" grade="A+" />
        </ScrollView>

        <SectionHeader title="Лента" />

        <View style={{ padding: 12, gap: 16 }}>
          <RunCard
            author={{ name: 'Анастасия Петрова', avatar: 'https://i.pravatar.cc/120?img=47', grade: 'A' }}
            location="Dubai, UAE"
            when="сегодня, 13:03"
            photo="https://images.unsplash.com/photo-1571008887538-b36bb32f4571?w=800"
            dist="16,00"
            time="01:18:56"
            pace="04:55"
            xp={17}
            device="Garmin"
            weather="+25°"
            mood="8/10 😎"
            hashtag="#palm_jumeirah"
            caption="Утро на пальме — теперь это привычка. Лёгкий ветер с моря, темп держится сам."
            likes={24}
            comments={3}
            liked
          />
        </View>
      </ScrollView>
    </View>
  );
}
