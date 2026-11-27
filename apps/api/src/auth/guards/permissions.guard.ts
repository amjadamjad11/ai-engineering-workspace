import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OrgMemberStatus } from '@prisma/client';
import { PERMISSION_DEFINITIONS } from '@ai-workspace/shared';
import { PrismaService } from '../../database/prisma.service';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

const UUID_V4_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

const KNOWN_PERMISSION_CODES: ReadonlySet<string> = new Set(
  PERMISSION_DEFINITIONS.map((def) => def.code),
);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<unknown>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No permission metadata declared on route -> allow
    if (requiredPermissions === undefined) {
      return true;
    }

    // Validate metadata is a non-empty array of known permission codes
    if (
      !Array.isArray(requiredPermissions) ||
      requiredPermissions.length === 0 ||
      requiredPermissions.some(
        (code) => typeof code !== 'string' || !KNOWN_PERMISSION_CODES.has(code),
      )
    ) {
      throw new InternalServerErrorException('Invalid permission metadata configuration.');
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || typeof user.id !== 'string' || !UUID_V4_REGEX.test(user.id)) {
      throw new UnauthorizedException('Authentication required.');
    }

    const orgContext = request.orgContext;
    if (
      !orgContext ||
      typeof orgContext.organizationId !== 'string' ||
      !UUID_V4_REGEX.test(orgContext.organizationId) ||
      typeof orgContext.organizationMemberId !== 'string' ||
      !UUID_V4_REGEX.test(orgContext.organizationMemberId)
    ) {
      throw new ForbiddenException('Organization context required.');
    }

    // Resolve current active membership and role permissions directly from PostgreSQL
    const member = await this.prisma.organizationMember.findUnique({
      where: {
        uq_org_member: {
          organizationId: orgContext.organizationId,
          userId: user.id,
        },
      },
      select: {
        id: true,
        status: true,
        role: {
          select: {
            id: true,
            organizationId: true,
            isSystemRole: true,
            permissions: {
              select: {
                permission: {
                  select: {
                    code: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (
      !member ||
      member.id !== orgContext.organizationMemberId ||
      member.status !== OrgMemberStatus.ACTIVE ||
      !member.role
    ) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    // Validate role ownership consistency (system roles have null orgId; custom roles match orgContext)
    const { isSystemRole, organizationId: roleOrgId } = member.role;
    if (
      (isSystemRole && roleOrgId !== null) ||
      (!isSystemRole && roleOrgId !== orgContext.organizationId)
    ) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    const grantedCodes = new Set(
      member.role.permissions
        .map((rp) => rp.permission?.code)
        .filter((code): code is string => typeof code === 'string'),
    );

    const hasAllPermissions = (requiredPermissions as string[]).every((code) =>
      grantedCodes.has(code),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    return true;
  }
}
