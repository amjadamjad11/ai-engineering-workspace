import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { OrgMemberStatus, ProjectRole, ProjectStatus } from '@prisma/client';
import { PermissionCode } from '@ai-workspace/shared';
import { PrismaService } from '../../database/prisma.service';
import { ProjectAccessMode } from '../decorators/require-project-access.decorator';
import { OrgContext } from '../interfaces/org-context.interface';

const UUID_V4_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

const VALID_MODES: ReadonlySet<string> = new Set([
  'READ',
  'GOVERN',
  'MANAGE_MEMBERS',
]);

@Injectable()
export class ProjectAccessPolicy {
  constructor(private readonly prisma: PrismaService) {}

  async authorizeProjectAccess(params: {
    userId: unknown;
    orgContext: OrgContext | undefined;
    projectId: unknown;
    mode: ProjectAccessMode;
  }): Promise<void> {
    const { userId, orgContext, projectId, mode } = params;

    if (!VALID_MODES.has(mode)) {
      throw new InternalServerErrorException(
        'Invalid project access metadata configuration.',
      );
    }

    if (typeof userId !== 'string' || !UUID_V4_REGEX.test(userId)) {
      throw new UnauthorizedException('Authentication required.');
    }

    if (
      !orgContext ||
      typeof orgContext.organizationId !== 'string' ||
      !UUID_V4_REGEX.test(orgContext.organizationId) ||
      typeof orgContext.organizationMemberId !== 'string' ||
      !UUID_V4_REGEX.test(orgContext.organizationMemberId)
    ) {
      throw new ForbiddenException('Organization context required.');
    }

    if (typeof projectId !== 'string' || !UUID_V4_REGEX.test(projectId)) {
      throw new NotFoundException('Project not found.');
    }

    const organizationId = orgContext.organizationId;

    const project = await this.prisma.project.findUnique({
      where: {
        uq_project_id_org: {
          id: projectId,
          organizationId,
        },
      },
      select: {
        id: true,
        organizationId: true,
        status: true,
        deletedAt: true,
      },
    });

    if (
      !project ||
      project.organizationId !== organizationId ||
      project.deletedAt !== null
    ) {
      throw new NotFoundException('Project not found.');
    }

    const [orgMember, projectMember] = await Promise.all([
      this.prisma.organizationMember.findUnique({
        where: {
          uq_org_member: {
            organizationId,
            userId,
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
      }),
      this.prisma.projectMember.findUnique({
        where: {
          uq_project_user: {
            projectId,
            userId,
          },
        },
        select: {
          id: true,
          organizationId: true,
          projectRole: true,
        },
      }),
    ]);

    if (
      !orgMember ||
      orgMember.id !== orgContext.organizationMemberId ||
      orgMember.status !== OrgMemberStatus.ACTIVE ||
      !orgMember.role
    ) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    const { isSystemRole, organizationId: roleOrgId } = orgMember.role;
    if (
      (isSystemRole && roleOrgId !== null) ||
      (!isSystemRole && roleOrgId !== organizationId)
    ) {
      throw new ForbiddenException('Insufficient permissions.');
    }

    if (projectMember && projectMember.organizationId !== organizationId) {
      throw new NotFoundException('Project not found.');
    }

    const grantedCodes = new Set(
      orgMember.role.permissions
        .map((rp) => rp.permission?.code)
        .filter((code): code is string => typeof code === 'string'),
    );

    const hasReadAll = grantedCodes.has(PermissionCode.PROJECTS_READ_ALL);
    const hasManageAll = grantedCodes.has(PermissionCode.PROJECTS_MANAGE_ALL);
    const hasProjectAccess = Boolean(projectMember) || hasReadAll || hasManageAll;

    if (mode === 'READ') {
      if (!hasProjectAccess) {
        throw new NotFoundException('Project not found.');
      }
      return;
    }

    // GOVERN and MANAGE_MEMBERS
    if (!hasProjectAccess) {
      throw new NotFoundException('Project not found.');
    }

    if (project.status === ProjectStatus.ARCHIVED) {
      throw new ForbiddenException('Archived projects cannot be modified.');
    }

    const isProjectLead = projectMember?.projectRole === ProjectRole.LEAD;
    if (!isProjectLead && !hasManageAll) {
      throw new ForbiddenException('Insufficient permissions.');
    }
  }
}
