import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrgTenantGuard } from '../auth/guards/org-tenant.guard';
import { UserStatusGuard } from '../auth/guards/user-status.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { OrgContext } from '../auth/interfaces/org-context.interface';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, UserStatusGuard)
  @ApiOperation({ summary: 'Create a new organization' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOrganizationDto,
  ) {
    return this.organizationsService.create(user.id, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard, UserStatusGuard)
  @ApiOperation({ summary: 'List active organizations for current user' })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.findAllForUser(user.id);
  }

  @Get(':orgId')
  @UseGuards(JwtAuthGuard, UserStatusGuard, OrgTenantGuard)
  @ApiOperation({ summary: 'Get organization details' })
  findOne(@Req() req: { orgContext: OrgContext }) {
    return this.organizationsService.findOne(req.orgContext);
  }

  @Patch(':orgId')
  @UseGuards(JwtAuthGuard, UserStatusGuard, OrgTenantGuard)
  @ApiOperation({ summary: 'Update organization details (OWNER or ADMIN)' })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { orgContext: OrgContext },
    @Body() dto: UpdateOrganizationDto,
  ) {
    return this.organizationsService.update(user.id, req.orgContext, dto);
  }

  @Delete(':orgId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard, UserStatusGuard, OrgTenantGuard)
  @ApiOperation({ summary: 'Soft-delete an organization (OWNER only)' })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: { orgContext: OrgContext },
  ) {
    return this.organizationsService.softDelete(user.id, req.orgContext);
  }
}
