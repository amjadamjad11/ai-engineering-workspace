import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserStatusGuard } from './guards/user-status.guard';
import { OrgTenantGuard } from './guards/org-tenant.guard';
import { ProjectTenantGuard } from './guards/project-tenant.guard';

@Module({
  providers: [
    AuthService,
    JwtAuthGuard,
    UserStatusGuard,
    OrgTenantGuard,
    ProjectTenantGuard,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    UserStatusGuard,
    OrgTenantGuard,
    ProjectTenantGuard,
  ],
})
export class AuthModule {}
