import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, Length } from 'class-validator';

export class CreateRoomDto {
  @ApiProperty({
    description: 'Room name (3-32 chars, alphanumeric and hyphens only)',
    example: 'general',
  })
  @IsString()
  @Length(3, 32, { message: 'name must be between 3 and 32 characters' })
  @Matches(/^[a-zA-Z0-9-]+$/, {
    message: 'name can only contain alphanumeric characters and hyphens',
  })
  name: string;
}
