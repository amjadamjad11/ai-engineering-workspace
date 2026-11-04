/**
 * Authentication and User Profile Contracts
 */

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: UserProfileStatus;
  createdAt: string;
  updatedAt: string;
}

export enum UserProfileStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  INACTIVE = 'INACTIVE',
}

export interface UserMembershipSummary {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: OrganizationRole;
}

export interface CurrentUserContext extends UserProfile {
  organizations: UserMembershipSummary[];
}

export enum OrganizationRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  TEAM_LEAD = 'TEAM_LEAD',
  FRONTEND_DEV = 'FRONTEND_DEV',
  BACKEND_DEV = 'BACKEND_DEV',
  QA_ENGINEER = 'QA_ENGINEER',
  AI_DEV = 'AI_DEV',
  DEVOPS_DEV = 'DEVOPS_DEV',
  MEMBER = 'MEMBER',
}

