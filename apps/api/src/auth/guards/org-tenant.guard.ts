import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgMemberStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { OrgContext } from '../interfaces/org-context.interface';

const UUID_V4_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

@Injectable()
export class OrgTenantGuard implements CanActivate {
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

    // Fail closed if unauthenticated
    if (!user || typeof user.id !== 'string' || !user.id) {
      throw new UnauthorizedException('Authentication required.');
    }

    // Resolve organization ID exclusively from route params (never body or headers)
    const orgId = this.extractOrgIdFromRouteParams(request);
    if (!orgId || !UUID_V4_REGEX.test(orgId)) {
      throw new NotFoundException('Organization not found.');
    }

    // Query active organization membership with organization existence, soft-delete check, and role
    const member = await this.prisma.organizationMember.findUnique({
      where: {
        uq_org_member: {
          organizationId: orgId,
          userId: user.id,
        },
      },
      select: {
        id: true,
        status: true,
        organization: {
          select: {
            id: true,
            deletedAt: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
            isSystemRole: true,
          },
        },
      },
    });

    // 1. Missing membership -> 404 to avoid revealing organization existence across tenants
    if (!member) {
      throw new NotFoundException('Organization not found.');
    }

    // 2. Organization was soft-deleted -> 404
    if (member.organization.deletedAt !== null) {
      throw new NotFoundException('Organization not found.');
    }

    // 3. Member status must be strictly ACTIVE -> 403
    if (member.status !== OrgMemberStatus.ACTIVE) {
      throw new ForbiddenException(
        'Organization membership is inactive or unauthorized.',
      );
    }

    // Safely attach verified organization context (frozen object to prevent accidental mutation)
    const orgContext: OrgContext = Object.freeze({
      organizationId: member.organization.id,
      organizationMemberId: member.id,
      roleId: member.role.id,
      roleName: member.role.name,
      isSystemRole: member.role.isSystemRole,
    });

    request.orgContext = orgContext;
    return true;
  }

  private extractOrgIdFromRouteParams(request: any): string | null {
    const params = request.params;
    if (!params || typeof params !== 'object') {
      return null;
    }

    // Supported route parameter conventions: 'orgId' or 'organizationId'
    const rawId = params.orgId || params.organizationId;
    if (typeof rawId !== 'string' || rawId.trim() === '') {
      return null;
    }

    return rawId.trim();
  }
}
