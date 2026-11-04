import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class PingDto {
  @ApiProperty({
    description: 'A message string to echo back',
    example: 'Hello AI Workspace',
    maxLength: 100,
  })
  @IsString({ message: 'message must be a valid string' })
  @IsNotEmpty({ message: 'message must not be empty' })
  @MaxLength(100, { message: 'message cannot exceed 100 characters' })
  message!: string;
}
