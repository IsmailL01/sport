// modules/clubs/domain/errors — typed failures for clubs operations.

export type ClubErrorCode =
  | 'club_not_found'
  | 'forbidden'         // viewer is not the owner
  | 'invalid_name'      // empty / too long
  | 'invalid_description'
  | 'duplicate_member'  // member already in club
  | 'not_a_member';     // attempting to leave a club one is not in

export class ClubError extends Error {
  constructor(
    public readonly code: ClubErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ClubError';
  }
}

export const CLUB_NAME_MIN = 2;
export const CLUB_NAME_MAX = 60;
export const CLUB_DESCRIPTION_MAX = 280;

export function validateClubName(name: string): ClubError | null {
  const trimmed = name.trim();
  if (trimmed.length < CLUB_NAME_MIN || trimmed.length > CLUB_NAME_MAX) {
    return new ClubError(
      'invalid_name',
      `Название клуба должно быть от ${CLUB_NAME_MIN} до ${CLUB_NAME_MAX} символов`,
    );
  }
  return null;
}

export function validateClubDescription(description: string): ClubError | null {
  if (description.length > CLUB_DESCRIPTION_MAX) {
    return new ClubError(
      'invalid_description',
      `Описание не более ${CLUB_DESCRIPTION_MAX} символов`,
    );
  }
  return null;
}
