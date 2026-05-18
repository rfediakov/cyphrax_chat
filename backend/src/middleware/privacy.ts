import { Types } from 'mongoose';
import type { PrivacyLevel, IUser } from '../models/user.model.js';

type VisibilityField = 'privacyLocation' | 'privacyBattery' | 'privacyOnlineStatus' | 'privacyLastSeen' | 'privacyProfile';

/**
 * Returns true when the requesting user is allowed to see the given field on targetUser.
 * "contacts" level requires both users to have each other in their contact lists —
 * here we approximate by checking guardianIds and emergencyContacts for simplicity; a
 * full implementation would query the FriendRequest/Contact model.
 */
export function canViewField(
  requesterId: string,
  targetUser: Pick<IUser, VisibilityField | 'guardianIds' | 'emergencyContacts'>,
  field: VisibilityField,
  contactIds: string[] = [],
): boolean {
  const level: PrivacyLevel = targetUser[field] as PrivacyLevel;

  if (level === 'everyone') return true;
  if (level === 'nobody') return false;

  // 'contacts' level
  const isContact = contactIds.includes(requesterId);
  const isGuardian = targetUser.guardianIds.some(
    (id: Types.ObjectId) => id.toString() === requesterId,
  );
  const isEmergency = targetUser.emergencyContacts.some(
    (id: Types.ObjectId) => id.toString() === requesterId,
  );

  return isContact || isGuardian || isEmergency;
}

/**
 * Filter a data object based on the target user's privacy settings.
 * Fields that should be hidden are replaced with undefined (omitted).
 */
export function applyPrivacyFilter<T extends Record<string, unknown>>(
  requesterId: string,
  targetUser: Pick<IUser, VisibilityField | 'guardianIds' | 'emergencyContacts'>,
  data: T,
  fieldMap: Partial<Record<keyof T, VisibilityField>>,
  contactIds: string[] = [],
): Partial<T> {
  const result = { ...data } as Partial<T>;

  for (const [dataField, privacyField] of Object.entries(fieldMap) as [keyof T, VisibilityField][]) {
    if (!canViewField(requesterId, targetUser, privacyField, contactIds)) {
      delete result[dataField];
    }
  }

  return result;
}
