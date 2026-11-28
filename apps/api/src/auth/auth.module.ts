import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserStatusGuard } from './guards/user-status.guard';
import { OrgTenantGuard } from './guards/org-tenant.guard';
import { ProjectTenantGuard } from './guards/project-tenant.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { ProjectAccessGuard } from './guards/project-access.guard';
import { ProjectAccessPolicy } from './policies/project-access.policy';

@Module({
  providers: [
    AuthService,
    JwtAuthGuard,
    UserStatusGuard,
    OrgTenantGuard,
    ProjectTenantGuard,
    PermissionsGuard,
    ProjectAccessPolicy,
    ProjectAccessGuard,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    UserStatusGuard,
    OrgTenantGuard,
    ProjectTenantGuard,
    PermissionsGuard,
    ProjectAccessPolicy,
    ProjectAccessGuard,
  ],
})
export class AuthModule { }
