import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class UserStatusGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || typeof user.id !== 'string' || !user.id) {
      throw new UnauthorizedException('Authentication required.');
    }

    // Query strictly minimal field (status) using verified user.id from JWT
    const profile = await this.prisma.profile.findUnique({
      where: { id: user.id },
      select: { status: true },
    });

    // Do not disclose whether profile is missing vs. suspended/inactive
    if (!profile || profile.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('User account is inactive or unauthorized.');
    }

    return true;
  }
}
