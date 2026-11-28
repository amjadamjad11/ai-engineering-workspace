import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PROJECT_ACCESS_MODE_KEY,
  ProjectAccessMode,
} from '../decorators/require-project-access.decorator';
import { ProjectAccessPolicy } from '../policies/project-access.policy';

const VALID_MODES: ReadonlySet<string> = new Set([
  'READ',
  'GOVERN',
  'MANAGE_MEMBERS',
]);

@Injectable()
export class ProjectAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly projectAccessPolicy: ProjectAccessPolicy,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const mode = this.reflector.getAllAndOverride<unknown>(
      PROJECT_ACCESS_MODE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (mode === undefined) {
      return true;
    }

    if (typeof mode !== 'string' || !VALID_MODES.has(mode)) {
      throw new InternalServerErrorException(
        'Invalid project access metadata configuration.',
      );
    }

    const request = context.switchToHttp().getRequest();
    const projectId =
      request.params && typeof request.params === 'object'
        ? typeof request.params.projectId === 'string'
          ? request.params.projectId.trim()
          : undefined
        : undefined;

    await this.projectAccessPolicy.authorizeProjectAccess({
      userId: request.user?.id,
      orgContext: request.orgContext,
      projectId,
      mode: mode as ProjectAccessMode,
    });

    return true;
  }
}
