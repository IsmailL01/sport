// 5-tab bottom-tabs shell. Phase 8 / M2.
//
// Каждая вкладка — отдельный native-stack (заглушки сейчас).
// Custom tab bar — `<TabBar>` из design-system.

import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { TabBar, type TabId } from '../design';

// Feed stack — Phase M5 real screens.
import { FeedScreen } from './screens/feed/FeedScreen';
import { PostDetailScreen } from './screens/feed/PostDetailScreen';
import { StoryViewerScreen } from './screens/feed/StoryViewerScreen';
import { CreatePostScreen } from './screens/feed/CreatePostScreen';

// Record stack — Phase M6 real screens.
import { TrackerStartScreen } from './screens/record/TrackerStartScreen';
import { TrackerLiveScreen } from './screens/record/TrackerLiveScreen';
import { RunDetailsScreen } from './screens/record/RunDetailsScreen';

// Journal stack — Phase M7 real screens.
import { JournalScreen } from './screens/journal/JournalScreen';
import { SessionDetailScreen } from './screens/journal/SessionDetailScreen';

// Me stack — Phase M8 real screens.
import { MeScreen } from './screens/me/MeScreen';
import { SettingsScreen } from './screens/me/SettingsScreen';
import { ClubsScreen } from './screens/me/ClubsScreen';
import { ClubScreen } from './screens/me/ClubScreen';
import { CreateClubScreen } from './screens/me/CreateClubScreen';

// Chats stack — Phase M9 real screens.
import { ChatsListScreen } from './screens/chats/ChatsListScreen';
import { ChatScreen } from './screens/chats/ChatScreen';
import { CreateChatScreen } from './screens/chats/CreateChatScreen';

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
      <FStack.Screen name="FeedHome" component={FeedScreen} />
      <FStack.Screen name="PostDetail" component={PostDetailScreen} />
      <FStack.Screen
        name="StoryViewer"
        component={StoryViewerScreen}
        options={{ presentation: 'modal', animation: 'fade' }}
      />
      <FStack.Screen
        name="CreatePost"
        component={CreatePostScreen}
        options={{ presentation: 'modal' }}
      />
    </FStack.Navigator>
  );
}

const CStack = createNativeStackNavigator<ChatsStackParamList>();
function ChatsStackNav() {
  return (
    <CStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0A' } }}>
      <CStack.Screen name="ChatsList" component={ChatsListScreen} />
      <CStack.Screen name="Chat" component={ChatScreen} />
      <CStack.Screen name="CreateChat" component={CreateChatScreen} />
    </CStack.Navigator>
  );
}

const RStack = createNativeStackNavigator<RecordStackParamList>();
function RecordStackNav() {
  return (
    <RStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0A' } }}>
      <RStack.Screen name="TrackerStart" component={TrackerStartScreen} />
      <RStack.Screen
        name="TrackerLive"
        component={TrackerLiveScreen}
        options={{ gestureEnabled: false }}
      />
      <RStack.Screen
        name="RunDetails"
        component={RunDetailsScreen}
        options={{ gestureEnabled: false }}
      />
    </RStack.Navigator>
  );
}

const JStack = createNativeStackNavigator<JournalStackParamList>();
function JournalStackNav() {
  return (
    <JStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0A' } }}>
      <JStack.Screen name="JournalList" component={JournalScreen} />
      <JStack.Screen name="SessionDetail" component={SessionDetailScreen} />
    </JStack.Navigator>
  );
}

const MStack = createNativeStackNavigator<MeStackParamList>();
function MeStackNav() {
  return (
    <MStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0A' } }}>
      <MStack.Screen name="Profile" component={MeScreen} />
      <MStack.Screen name="Settings" component={SettingsScreen} />
      <MStack.Screen name="Clubs" component={ClubsScreen} />
      <MStack.Screen name="Club" component={ClubScreen} />
      <MStack.Screen name="CreateClub" component={CreateClubScreen} />
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
