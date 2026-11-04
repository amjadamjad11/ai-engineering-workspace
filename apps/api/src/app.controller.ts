import { Controller, Get, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse as SwaggerApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { PingDto } from './dto/ping.dto';

@ApiTags('Health')
@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'System health check',
    description: 'Returns operational status and active server timestamp',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'System is operational',
  })
  getHealth() {
    return this.appService.getHealthStatus();
  }

  @Post('ping')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validation ping echo',
    description: 'Echoes message back to verify ValidationPipe and standard envelope',
  })
  @SwaggerApiResponse({
    status: 200,
    description: 'Payload validated and echoed successfully',
  })
  @SwaggerApiResponse({
    status: 400,
    description: 'Validation failed on submitted payload',
  })
  ping(@Body() body: PingDto) {
    return this.appService.echoPing(body.message);
  }
}
