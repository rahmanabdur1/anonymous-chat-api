import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class GetMessagesDto {
  @ApiPropertyOptional({ description: 'Max number of messages to return', default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @ApiPropertyOptional({ description: 'Message ID cursor — returns messages older than this' })
  @IsOptional()
  @IsString()
  before?: string;
}
