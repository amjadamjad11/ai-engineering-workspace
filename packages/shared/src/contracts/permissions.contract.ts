/**
 * Role-Based Access Control (RBAC) Permission Catalog Contract
 */

export const PermissionCode = {
  PROJECTS_READ_ALL: 'projects:read_all',
  PROJECTS_MANAGE_ALL: 'projects:manage_all',
} as const;

export type PermissionCode = (typeof PermissionCode)[keyof typeof PermissionCode];

export interface PermissionDefinition {
  readonly code: PermissionCode;
  readonly description: string;
  readonly module: string;
}

export const PERMISSION_DEFINITIONS: ReadonlyArray<PermissionDefinition> = Object.freeze([
  {
    code: PermissionCode.PROJECTS_READ_ALL,
    description: 'Read-only access to all projects within the organization, bypassing explicit project membership.',
    module: 'projects',
  },
  {
    code: PermissionCode.PROJECTS_MANAGE_ALL,
    description: 'Full management and governance over all projects within the organization, including updates and archiving.',
    module: 'projects',
  },
]);
