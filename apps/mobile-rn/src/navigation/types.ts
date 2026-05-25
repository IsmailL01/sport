// React Navigation param maps — Phase 8 / M2.
//
// Keep these typed even on stubs так чтобы:
//   - auto-complete для navigation.navigate('...')
//   - линт ловил несоответствие param shape
//   - rename screens грозит compile-error, не runtime

import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

// === Root ===

export type RootStackParamList = {
  /** Authenticated: 5-tab app shell. */
  App: NavigatorScreenParams<AppTabParamList>;
  /** Unauthenticated: onboarding + auth stack. */
  Auth: NavigatorScreenParams<AuthStackParamList>;
  /** Authenticated + isNew=true: wizard (имя / дата рождения / permissions). */
  Onboarding: NavigatorScreenParams<OnboardingStackParamList>;
  /** Modal-style чужой профиль с кнопкой «Подписаться» — Phase M9.7. */
  ForeignProfile: { userId: string };
  /** Phase 11 / STORIES-REVIVAL — full-screen viewer for a single author's story group. */
  StoryViewer: { authorId: string; startIndex?: number };
  /** Phase 11 / STORIES-REVIVAL — composer (image pick + overlay text + publish). */
  StoryCreator: undefined;
};

// === Onboarding stack (post-signup wizard) ===

export type OnboardingStackParamList = {
  Name: undefined;
  Birthday: undefined;
  Permissions: undefined;
};

// === Auth stack ===

/** Auth mode прокидывается из Intro в Email и Code только для UX-labels.
 *  Backend всё равно сам решит signup vs signin по isNew flag. */
export type AuthMode = 'signup' | 'signin';

export type AuthStackParamList = {
  Splash: undefined;
  Intro: undefined;
  Email: { mode?: AuthMode } | undefined;
  Code: { email: string; mode?: AuthMode };
  // Name / Birthday / Permissions перенесены в OnboardingStackParamList —
  // открываются для нового user'а после login-with-code (isNew=true).
};

// === Main app tabs ===

export type AppTabParamList = {
  Record: NavigatorScreenParams<RecordStackParamList>;
  Journal: NavigatorScreenParams<JournalStackParamList>;
  Chats: NavigatorScreenParams<ChatsStackParamList>;
  Me: NavigatorScreenParams<MeStackParamList>;
};

// === Per-tab nested stacks ===

export type ChatsStackParamList = {
  ChatsList: undefined;
  Chat: { chatId: string };
  CreateChat: undefined;
  /** «Найти людей» — открыт из header ChatsList; tap → ForeignProfile. */
  PeopleSearch: undefined;
};

export type RecordStackParamList = {
  TrackerStart: undefined;
  TrackerLive: undefined;
  RunDetails: { sessionId: string };
};

export type JournalStackParamList = {
  JournalList: undefined;
  SessionDetail: { sessionId: string };
};

export type MeStackParamList = {
  Profile: undefined;
  Settings: undefined;
  Clubs: undefined;
  Club: { clubId: string };
  CreateClub: undefined;
  /** M10.1: Личные рекорды (дистанция / pace / duration / calories). */
  Records: undefined;
  /** M10.3: Подробная статистика с графиками. */
  Stats: undefined;
  /** Внутренняя валюта (см. docs/CURRENCY.md). */
  Wallet: undefined;
  /** PHASE1-10: manual offline tile-region picker (см. CONTEXT.md D-23..D-26). */
  RegionPicker: undefined;
  /** Phase 10 / ADR-0011 Amendment 6: incoming + outgoing friend requests. */
  FriendRequests: undefined;
};

// === Screen props helpers ===

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

export type AppTabScreenProps<T extends keyof AppTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<AppTabParamList, T>,
  RootScreenProps<keyof RootStackParamList>
>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
