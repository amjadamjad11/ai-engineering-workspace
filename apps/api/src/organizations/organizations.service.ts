import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { OrgMemberStatus, Prisma } from '@prisma/client';
import { Organization } from '@ai-workspace/shared';
import { PrismaService } from '../database/prisma.service';
import { OrgContext } from '../auth/interfaces/org-context.interface';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';

function toOrganizationContract(org: {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  billingPlan: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Organization {
  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    logoUrl: org.logoUrl,
    billingPlan: org.billingPlan,
    createdById: org.createdById,
    createdAt: org.createdAt.toISOString(),
    updatedAt: org.updatedAt.toISOString(),
  };
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    dto: CreateOrganizationDto,
  ): Promise<Organization> {
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const ownerRole = await tx.role.findFirst({
          where: {
            name: 'OWNER',
            isSystemRole: true,
            organizationId: null,
          },
          select: { id: true },
        });

        if (!ownerRole) {
          throw new InternalServerErrorException(
            'System OWNER role is not configured.',
          );
        }

        const organization = await tx.organization.create({
          data: {
            name: dto.name,
            slug: dto.slug,
            logoUrl: dto.logoUrl ?? null,
            createdById: userId,
          },
        });

        await tx.organizationMember.create({
          data: {
            organizationId: organization.id,
            userId,
            roleId: ownerRole.id,
            status: OrgMemberStatus.ACTIVE,
            joinedAt: new Date(),
          },
        });

        return organization;
      });

      return toOrganizationContract(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Organization slug already exists.');
      }
      throw error;
    }
  }

  async findAllForUser(userId: string): Promise<Organization[]> {
    const orgs = await this.prisma.organization.findMany({
      where: {
        deletedAt: null,
        members: {
          some: {
            userId,
            status: OrgMemberStatus.ACTIVE,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return orgs.map(toOrganizationContract);
  }

  async findOne(orgContext: OrgContext): Promise<Organization> {
    const org = await this.prisma.organization.findFirst({
      where: {
        id: orgContext.organizationId,
        deletedAt: null,
      },
    });

    if (!org) {
      throw new NotFoundException('Organization not found.');
    }

    return toOrganizationContract(org);
  }

  async update(
    userId: string,
    orgContext: OrgContext,
    dto: UpdateOrganizationDto,
  ): Promise<Organization> {
    if (dto.name === undefined && dto.logoUrl === undefined) {
      throw new BadRequestException(
        'At least one updatable field (name or logoUrl) must be provided.',
      );
    }

    await this.assertCanonicalRole(userId, orgContext, ['OWNER', 'ADMIN']);

    const data: { name?: string; logoUrl?: string } = {};
    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.logoUrl !== undefined) {
      data.logoUrl = dto.logoUrl;
    }

    const updated = await this.prisma.organization.updateMany({
      where: {
        id: orgContext.organizationId,
        deletedAt: null,
      },
      data,
    });

    if (updated.count === 0) {
      throw new NotFoundException('Organization not found.');
    }

    return this.findOne(orgContext);
  }

  async softDelete(userId: string, orgContext: OrgContext): Promise<void> {
    await this.assertCanonicalRole(userId, orgContext, ['OWNER']);

    const result = await this.prisma.organization.updateMany({
      where: {
        id: orgContext.organizationId,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    if (result.count === 0) {
      throw new NotFoundException('Organization not found.');
    }
  }

  private async assertCanonicalRole(
    userId: string,
    orgContext: OrgContext,
    allowedRoles: ReadonlyArray<string>,
  ): Promise<void> {
    const member = await this.prisma.organizationMember.findUnique({
      where: {
        uq_org_member: {
          organizationId: orgContext.organizationId,
          userId,
        },
      },
      select: {
        id: true,
        status: true,
        role: {
          select: {
            name: true,
            isSystemRole: true,
            organizationId: true,
          },
        },
      },
    });

    if (
      !member ||
      member.id !== orgContext.organizationMemberId ||
      member.status !== OrgMemberStatus.ACTIVE ||
      !member.role ||
      !member.role.isSystemRole ||
      member.role.organizationId !== null ||
      !allowedRoles.includes(member.role.name)
    ) {
      throw new ForbiddenException('Insufficient permissions.');
    }
  }
}
