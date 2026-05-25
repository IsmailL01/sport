// modules/clubs/domain — local-first clubs entity (quick-task: profile-clubs-polish).
//
// No backend yet (CLUBS-BACKEND-SYNC backlogged for v1.0.1). Data persists
// in SQLite (migration v20). Members are user_ids of friends selected by
// the owner — friends-side notification stubbed until backend lands.

export type ClubRole = 'owner' | 'member';

/** Available avatar accent colors (palette must stay in sync with tokens.ts). */
export const CLUB_AVATAR_COLORS = [
  '#C6F560', // lime
  '#FF4D2E', // accent
  '#4DA8FF', // blueGlow
  '#FFB84D', // orange
  '#B388FF', // purple
  '#FF6B9D', // pink
] as const;

export type ClubAvatarColor = (typeof CLUB_AVATAR_COLORS)[number];

/** Persisted club entity. id = UUIDv4 generated mobile-side. */
export type Club = {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  avatarColor: ClubAvatarColor;
  /** ms epoch UTC */
  createdAt: number;
  /** ms epoch UTC */
  updatedAt: number;
};

/** Persisted club-member entity. */
export type ClubMember = {
  clubId: string;
  userId: string;
  role: ClubRole;
  /** ms epoch UTC */
  joinedAt: number;
};

/** UI-level summary returned by listClubsForUser — joined with member count. */
export type ClubSummary = Club & {
  membersCount: number;
  /** Current viewer's role within the club. */
  viewerRole: ClubRole;
};

/** UI-level detail returned by getClubDetail — includes full member list. */
export type ClubDetail = Club & {
  members: ClubMember[];
  viewerRole: ClubRole;
};

/** Input shape for createClub. */
export type CreateClubInput = {
  ownerId: string;
  name: string;
  description: string;
  avatarColor: ClubAvatarColor;
  /** Additional member user_ids (owner auto-added). */
  memberIds: string[];
};

/** Input shape for updateClub. */
export type UpdateClubInput = {
  id: string;
  name: string;
  description: string;
  avatarColor: ClubAvatarColor;
};
