// 4-tab bottom-tabs shell.
//
// Tabs: Record (default) / Journal / Chats / Me.
// Custom tab bar — `<TabBar>` из design-system.

import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { TabBar, type TabId } from '../design';
import { useChatsStore } from '../state/social/useChatsStore';
import { FriendRequestsInboxScreen, useFriendsStore } from '../modules/friends';

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
import { RecordsScreen } from './screens/me/RecordsScreen';
import { StatsScreen } from './screens/me/StatsScreen';
import { WalletScreen } from './screens/me/WalletScreen';
import { RegionPickerScreen } from './screens/me/RegionPickerScreen';

// Chats stack — Phase M9 real screens.
import { ChatsListScreen } from './screens/chats/ChatsListScreen';
import { ChatScreen } from './screens/chats/ChatScreen';
import { CreateChatScreen } from './screens/chats/CreateChatScreen';
import { PeopleSearchScreen } from './screens/chats/PeopleSearchScreen';

import type {
  AppTabParamList,
  ChatsStackParamList,
  JournalStackParamList,
  MeStackParamList,
  RecordStackParamList,
} from './types';

// === Per-tab nested stacks ===

const CStack = createNativeStackNavigator<ChatsStackParamList>();
function ChatsStackNav() {
  return (
    <CStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#0A0A0A' } }}>
      <CStack.Screen name="ChatsList" component={ChatsListScreen} />
      <CStack.Screen name="Chat" component={ChatScreen} />
      <CStack.Screen name="CreateChat" component={CreateChatScreen} />
      <CStack.Screen
        name="PeopleSearch"
        component={PeopleSearchScreen}
        options={{ presentation: 'modal' }}
      />
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
      <MStack.Screen name="Records" component={RecordsScreen} />
      <MStack.Screen name="Stats" component={StatsScreen} />
      <MStack.Screen name="Wallet" component={WalletScreen} />
      <MStack.Screen name="RegionPicker" component={RegionPickerScreen} />
      {/* Phase 10 / ADR-0011 Amendment 6 — friend-request inbox. */}
      <MStack.Screen name="FriendRequests" component={FriendRequestsInboxScreen} />
    </MStack.Navigator>
  );
}

// === Tabs ===

const Tab = createBottomTabNavigator<AppTabParamList>();

const ROUTE_TO_TABID: Record<keyof AppTabParamList, TabId> = {
  Record: 'record',
  Journal: 'journal',
  Chats: 'chats',
  Me: 'me',
};
const TABID_TO_ROUTE: Record<TabId, keyof AppTabParamList> = {
  record: 'Record',
  journal: 'Journal',
  chats: 'Chats',
  me: 'Me',
};

function CursonaTabBar({ state, navigation }: BottomTabBarProps) {
  const current = state.routes[state.index].name as keyof AppTabParamList;
  const activeId = ROUTE_TO_TABID[current] ?? 'record';
  // Aggregate per-chat unreadCount → single badge number on "Чаты" tab.
  // Subscribes via selector so changes (mark-read, incoming message) re-render
  // only the TabBar, not the entire tab navigator.
  const totalUnread = useChatsStore((s) =>
    s.chats.reduce((acc, c) => acc + (c.unreadCount ?? 0), 0),
  );
  // Phase 10 / ADR-0011 Amendment 6 — incoming friend-request count on Me tab.
  const incomingFriendCount = useFriendsStore((s) => s.incoming.length);
  return (
    <TabBar
      active={activeId}
      badges={{ chats: totalUnread, me: incomingFriendCount }}
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
      initialRouteName="Record"
      tabBar={CursonaTabBar}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Record" component={RecordStackNav} />
      <Tab.Screen name="Journal" component={JournalStackNav} />
      <Tab.Screen name="Chats" component={ChatsStackNav} />
      <Tab.Screen name="Me" component={MeStackNav} />
    </Tab.Navigator>
  );
}
