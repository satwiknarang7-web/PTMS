import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { TrimString } from '../../../common/transformers/query.transformers';

export class CommentQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsString() taskId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() issueId?: string;
}

export class CreateCommentDto extends CommentQueryDto {
  @ApiPropertyOptional({ description: 'Text; may be empty when images are attached' })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(10000)
  body?: string;

  @ApiPropertyOptional({ type: [String], description: 'Images uploaded with POST /comments/images' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  attachmentIds?: string[];
}

export class UpdateCommentDto {
  @ApiProperty()
  @TrimString()
  @IsString()
  @MaxLength(10000)
  body: string;
}
