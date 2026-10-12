import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TrimString } from '../../../common/transformers/query.transformers';

export class StartConversationDto {
  @ApiProperty({ description: 'The person to chat with' })
  @IsString()
  userId: string;
}

export class SendMessageDto {
  @ApiProperty()
  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body: string;
}

export class MessagesQueryDto {
  @ApiPropertyOptional({ description: 'Return messages older than this message (for scrolling back)' })
  @IsOptional()
  @IsString()
  before?: string;
}
