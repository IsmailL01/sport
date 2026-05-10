// 5-tab bottom-tabs shell. Phase 8 / M2.
//
// Каждая вкладка — отдельный native-stack (заглушки сейчас).
// Custom tab bar — `<TabBar>` из design-system.

import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { TabBar, type TabId } from '../design';

import { FeedScreenStub } from './screens/feed/FeedScreenStub';
import { ChatsScreenStub } from './screens/chats/ChatsScreenStub';
import { RecordScreenStub } from './screens/record/RecordScreenStub';
import { JournalScreenStub } from './screens/journal/JournalScreenStub';
import { MeScreenStub } from './screens/me/MeScreenStub';

import type {
  AppTabParamList,
  ChatsStackParamList,
  FeedStackParamList,
  JournalStackParamList,
  MeStackParamList,
  RecordStackParamList,
} from './types';

// === Per-tab nested stacks ===

const FStack = createNativeStackNavigator<FeedStackParamList>();
function FeedStackNav() {
  return (
    <FStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0A' } }}>
      <FStack.Screen name="FeedHome" component={FeedScreenStub} />
    </FStack.Navigator>
  );
}

const CStack = createNativeStackNavigator<ChatsStackParamList>();
function ChatsStackNav() {
  return (
    <CStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0A' } }}>
      <CStack.Screen name="ChatsList" component={ChatsScreenStub} />
    </CStack.Navigator>
  );
}

const RStack = createNativeStackNavigator<RecordStackParamList>();
function RecordStackNav() {
  return (
    <RStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0A' } }}>
      <RStack.Screen name="TrackerStart" component={RecordScreenStub} />
    </RStack.Navigator>
  );
}

const JStack = createNativeStackNavigator<JournalStackParamList>();
function JournalStackNav() {
  return (
    <JStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0A' } }}>
      <JStack.Screen name="JournalList" component={JournalScreenStub} />
    </JStack.Navigator>
  );
}

const MStack = createNativeStackNavigator<MeStackParamList>();
function MeStackNav() {
  return (
    <MStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0A' } }}>
      <MStack.Screen name="Profile" component={MeScreenStub} />
    </MStack.Navigator>
  );
}

// === Tabs ===

const Tab = createBottomTabNavigator<AppTabParamList>();

const ROUTE_TO_TABID: Record<keyof AppTabParamList, TabId> = {
  Feed: 'feed',
  Chats: 'chats',
  Record: 'record',
  Journal: 'journal',
  Me: 'me',
};
const TABID_TO_ROUTE: Record<TabId, keyof AppTabParamList> = {
  feed: 'Feed',
  chats: 'Chats',
  record: 'Record',
  journal: 'Journal',
  me: 'Me',
};

function CursonaTabBar({ state, navigation }: BottomTabBarProps) {
  const current = state.routes[state.index].name as keyof AppTabParamList;
  const activeId = ROUTE_TO_TABID[current] ?? 'feed';
  return (
    <TabBar
      active={activeId}
      onTab={(id) => {
        const target = TABID_TO_ROUTE[id];
        navigation.navigate(target as never);
      }}
    />
  );
}

export function AppTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Feed"
      tabBar={CursonaTabBar}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Feed" component={FeedStackNav} />
      <Tab.Screen name="Chats" component={ChatsStackNav} />
      <Tab.Screen name="Record" component={RecordStackNav} />
      <Tab.Screen name="Journal" component={JournalStackNav} />
      <Tab.Screen name="Me" component={MeStackNav} />
    </Tab.Navigator>
  );
}
