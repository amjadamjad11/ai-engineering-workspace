import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../database/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ProjectContext } from '../interfaces/project-context.interface';

const UUID_V4_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;

@Injectable()
export class ProjectTenantGuard implements CanActivate {
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

    // Fail closed if unauthenticated or user.id is not a valid UUID
    if (!user || typeof user.id !== 'string' || !UUID_V4_REGEX.test(user.id)) {
      throw new UnauthorizedException('Authentication required.');
    }

    // Require verified request.orgContext from preceding OrgTenantGuard
    const orgContext = request.orgContext;
    if (
      !orgContext ||
      typeof orgContext.organizationId !== 'string' ||
      !UUID_V4_REGEX.test(orgContext.organizationId)
    ) {
      throw new ForbiddenException('Organization context required.');
    }

    // Resolve project ID exclusively from request.params.projectId
    const projectId = this.extractProjectIdFromRouteParams(request);
    if (!projectId || !UUID_V4_REGEX.test(projectId)) {
      throw new NotFoundException('Project not found.');
    }

    // Query ProjectMember using composite unique constraint uq_project_user and scoped organizationId
    const member = await this.prisma.projectMember.findUnique({
      where: {
        uq_project_user: {
          projectId: projectId,
          userId: user.id,
        },
        organizationId: orgContext.organizationId,
      },
      select: {
        id: true,
        organizationId: true,
        projectRole: true,
        project: {
          select: {
            id: true,
            organizationId: true,
            deletedAt: true,
          },
        },
      },
    });

    // 1. Missing membership -> 404 (non-disclosure of project existence across tenants)
    if (!member) {
      throw new NotFoundException('Project not found.');
    }

    // 2. Explicit tenant boundary check (member & project must belong to orgContext.organizationId)
    if (
      member.organizationId !== orgContext.organizationId ||
      !member.project ||
      member.project.organizationId !== orgContext.organizationId
    ) {
      throw new NotFoundException('Project not found.');
    }

    // 3. Soft-deleted project -> 404
    if (member.project.deletedAt !== null) {
      throw new NotFoundException('Project not found.');
    }

    // Safely attach verified project context (frozen object to prevent accidental mutation)
    const projectContext: ProjectContext = Object.freeze({
      projectId: member.project.id,
      organizationId: member.organizationId,
      projectMemberId: member.id,
      projectRole: member.projectRole,
    });

    request.projectContext = projectContext;
    return true;
  }

  private extractProjectIdFromRouteParams(request: any): string | null {
    const params = request.params;
    if (!params || typeof params !== 'object') {
      return null;
    }

    // Strictly resolve from 'projectId' parameter
    const rawId = params.projectId;
    if (typeof rawId !== 'string' || rawId.trim() === '') {
      return null;
    }

    return rawId.trim();
  }
}
