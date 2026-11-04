/**
 * Task Management Domain Contracts
 */

export interface Task {
  id: string;
  projectId: string;
  milestoneId: string | null;
  parentTaskId: string | null;
  taskNumber: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  estimatedHours: number | null;
  dueDate: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export enum TaskStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  IN_REVIEW = 'IN_REVIEW',
  BLOCKED = 'BLOCKED',
  DONE = 'DONE',
  CANCELLED = 'CANCELLED',
}

export enum TaskPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface CreateTaskDto {
  title: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  milestoneId?: string;
  parentTaskId?: string;
  assigneeIds?: string[];
  estimatedHours?: number;
  dueDate?: string;
}

export interface UpdateTaskDto {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  milestoneId?: string | null;
  assigneeIds?: string[];
  estimatedHours?: number | null;
  dueDate?: string | null;
}

export interface TaskComment {
  id: string;
  taskId: string;
  authorId: string | null;
  content: string;
  isAiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
  author?: {
    fullName: string;
    avatarUrl: string | null;
  };
}

