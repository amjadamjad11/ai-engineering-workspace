export interface OrgContext {
  readonly organizationId: string;
  readonly organizationMemberId: string;
  readonly roleId: string;
  readonly roleName: string;
  readonly isSystemRole: boolean;
}
