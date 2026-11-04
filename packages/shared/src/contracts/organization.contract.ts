/**
 * Organization Domain Contracts
 */

import { OrganizationRole } from './auth.contract';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  billingPlan: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateOrganizationDto {
  name: string;
  slug: string;
  logoUrl?: string;
}

export interface UpdateOrganizationDto {
  name?: string;
  logoUrl?: string;
}

export interface OrganizationMember {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: OrgMemberStatus;
  user: {
    email: string;
    fullName: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  joinedAt: string | null;
  createdAt: string;
}

export enum OrgMemberStatus {
  INVITED = 'INVITED',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export interface InviteMemberDto {
  email: string;
  role: OrganizationRole;
}

