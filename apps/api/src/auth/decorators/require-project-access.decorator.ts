import { SetMetadata } from '@nestjs/common';

export const PROJECT_ACCESS_MODE_KEY = 'project_access_mode';

export type ProjectAccessMode = 'READ' | 'GOVERN' | 'MANAGE_MEMBERS';

/**
 * Declares the project-level access mode required for a route.
 * Evaluated by ProjectAccessGuard via ProjectAccessPolicy.
 */
export const RequireProjectAccess = (mode: ProjectAccessMode) =>
  SetMetadata(PROJECT_ACCESS_MODE_KEY, mode);
