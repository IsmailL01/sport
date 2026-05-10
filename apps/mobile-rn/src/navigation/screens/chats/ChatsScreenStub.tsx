// Tab: Чаты — stub. Real M7.

import { ScrollView, Text, View } from 'react-native';

import { Avatar, Chip, Icon, SectionHeader, StoryRing, useTheme } from '../../../design';

export function ChatsScreenStub() {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 30 * t.fontScale, fontWeight: '800', letterSpacing: -1, color: t.text, fontFamily: t.font }}>
            Чаты
          </Text>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: t.lime,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="plus" size={22} color="#000" />
          </View>
        </View>

        <View
          style={{
            marginTop: 12,
            backgroundColor: t.surface,
            borderRadius: t.r.md,
            padding: 11,
            paddingHorizontal: 14,
            flexDirection: 'row',
            gap: 10,
            alignItems: 'center',
          }}
        >
          <Icon name="search" size={18} color={t.text3} />
          <Text style={{ color: t.text3, fontSize: 14 * t.fontScale, fontFamily: t.font }}>
            Поиск по чатам и людям
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[['Все', true], ['Личные', false], ['Группы', false], ['Клубы', false]].map(([n, a], i) => (
              <Chip key={i} bg={a ? t.text : t.surface} color={a ? t.bg : t.text2}>{String(n)}</Chip>
            ))}
          </View>
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, gap: 8 }}>
          <StoryRing src="https://i.pravatar.cc/100?img=33" name="Ты" isOwn />
          <StoryRing src="https://i.pravatar.cc/100?img=47" name="Анастасия" grade="A" />
          <StoryRing src="https://i.pravatar.cc/100?img=12" name="Андрей" grade="B" />
        </ScrollView>
      </View>

      <ScrollView style={{ flex: 1, marginTop: 4 }} contentContainerStyle={{ paddingBottom: 100 }}>
        <SectionHeader title="Последние" />
        <View style={{ paddingHorizontal: 16, gap: 12 }}>
          {[
            { name: 'Анастасия Петрова', last: 'отправила пробежку 16,00 км', when: '11:48', unread: 2, avatar: 47 },
            { name: '#diehardcheb', last: 'Слава: отличный темп вчера 💪', when: '09:30', unread: 0, avatar: 25 },
            { name: 'Маша Иванова', last: 'ты: спасибо!', when: 'вчера', unread: 0, avatar: 49 },
          ].map((c, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <Avatar src={`https://i.pravatar.cc/120?img=${c.avatar}`} size={52} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 15 * t.fontScale, fontWeight: '600', color: t.text, fontFamily: t.font }} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <Text style={{ fontSize: 11 * t.fontScale, color: c.unread ? t.lime : t.text3, fontWeight: c.unread ? '700' : '400', fontFamily: t.font }}>
                    {c.when}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <Text style={{ flex: 1, fontSize: 13 * t.fontScale, color: c.unread ? t.text : t.text2, fontFamily: t.font }} numberOfLines={1}>
                    {c.last}
                  </Text>
                  {c.unread > 0 && (
                    <View
                      style={{
                        minWidth: 20,
                        height: 20,
                        paddingHorizontal: 6,
                        borderRadius: 10,
                        backgroundColor: t.lime,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ color: '#000', fontSize: 11 * t.fontScale, fontWeight: '700', fontFamily: t.font }}>
                        {c.unread}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}
