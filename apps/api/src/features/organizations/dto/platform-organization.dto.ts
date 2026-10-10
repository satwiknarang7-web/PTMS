import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDefined, IsEmail, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { TrimString } from '../../../common/transformers/query.transformers';
import { IsPassword } from '../../../common/validation/password.policy';

export const ORGANIZATION_STATUS_FILTERS = ['active', 'suspended'] as const;
export type OrganizationStatusFilter = (typeof ORGANIZATION_STATUS_FILTERS)[number];

export class PlatformOrganizationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ORGANIZATION_STATUS_FILTERS })
  @IsOptional()
  @IsIn(ORGANIZATION_STATUS_FILTERS)
  status?: OrganizationStatusFilter;
}

export class InitialCoordinatorDto {
  @ApiProperty()
  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  firstName: string;

  @ApiProperty()
  @TrimString()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  lastName: string;

  @ApiProperty()
  @TrimString()
  @IsEmail()
  @MaxLength(254)
  email: string;

  @ApiPropertyOptional({ description: 'Initial password; leave out to email an invitation link instead' })
  @IsOptional()
  @IsPassword()
  password?: string;
}

export class CreatePlatformOrganizationDto {
  @ApiProperty()
  @TrimString()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ type: InitialCoordinatorDto, description: 'First project coordinator of the new organization' })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => InitialCoordinatorDto)
  coordinator: InitialCoordinatorDto;
}

export class UpdatePlatformOrganizationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @TrimString()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'false suspends the organization and signs all its users out' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
