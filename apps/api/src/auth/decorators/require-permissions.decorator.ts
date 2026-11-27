import { SetMetadata } from '@nestjs/common';
import { PermissionCode } from '@ai-workspace/shared';

export const REQUIRED_PERMISSIONS_KEY = 'required_permissions';

/**
 * Declares the organization-level permissions required to access a route.
 * By default, ALL listed permissions must be held by the caller's active
 * organization role.
 */
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
