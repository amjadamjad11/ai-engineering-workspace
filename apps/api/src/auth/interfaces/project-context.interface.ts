import { ProjectRole } from '@prisma/client';

export interface ProjectContext {
  readonly projectId: string;
  readonly organizationId: string;
  readonly projectMemberId: string;
  readonly projectRole: ProjectRole;
}
