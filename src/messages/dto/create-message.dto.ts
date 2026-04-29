import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateMessageDto {
  @ApiProperty({
    description: 'Message content (1-1000 characters)',
    example: 'hello everyone',
  })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 1000, { message: 'Message content must be between 1 and 1000 characters' })
  content: string;
}
