import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserStatusGuard } from './guards/user-status.guard';
import { OrgTenantGuard } from './guards/org-tenant.guard';
import { ProjectTenantGuard } from './guards/project-tenant.guard';
import { PermissionsGuard } from './guards/permissions.guard';

@Module({
  providers: [
    AuthService,
    JwtAuthGuard,
    UserStatusGuard,
    OrgTenantGuard,
    ProjectTenantGuard,
    PermissionsGuard,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    UserStatusGuard,
    OrgTenantGuard,
    ProjectTenantGuard,
    PermissionsGuard,
  ],
})
export class AuthModule { }
