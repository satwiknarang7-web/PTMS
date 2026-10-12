import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { TrimString } from '../../common/transformers/query.transformers';

export class CreateFeedbackDto {
  @ApiProperty()
  @TrimString()
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  body: string;

  @ApiPropertyOptional({ description: 'Page the feedback was written on' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  page?: string;
}

export class UpdateFeedbackDto {
  @ApiProperty({ description: 'Mark as dealt with (or not)' })
  @IsBoolean()
  resolved: boolean;
}
