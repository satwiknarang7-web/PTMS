import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { TrimString } from '../../../common/transformers/query.transformers';

export class StartConversationDto {
  @ApiProperty({ description: 'The person to chat with' })
  @IsString()
  userId: string;
}

export class SendMessageDto {
  @ApiPropertyOptional({ description: 'Text; may be empty when images are attached' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(5000)
  body?: string;

  @ApiPropertyOptional({ type: [String], description: 'Images uploaded with POST /messages/images' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  attachmentIds?: string[];
}

export class MessageImageQueryDto {
  @ApiProperty()
  @IsString()
  conversationId: string;
}

export class MessagesQueryDto {
  @ApiPropertyOptional({ description: 'Return messages older than this message (for scrolling back)' })
  @IsOptional()
  @IsString()
  before?: string;
}
