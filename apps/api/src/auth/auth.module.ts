import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UserStatusGuard } from './guards/user-status.guard';

@Module({
  providers: [AuthService, JwtAuthGuard, UserStatusGuard],
  exports: [AuthService, JwtAuthGuard, UserStatusGuard],
})
export class AuthModule {}
