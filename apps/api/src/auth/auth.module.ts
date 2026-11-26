import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserStatusGuard } from './guards/user-status.guard';
import { OrgTenantGuard } from './guards/org-tenant.guard';

@Module({
  providers: [AuthService, JwtAuthGuard, UserStatusGuard, OrgTenantGuard],
  exports: [AuthService, JwtAuthGuard, UserStatusGuard, OrgTenantGuard],
})
export class AuthModule {}
