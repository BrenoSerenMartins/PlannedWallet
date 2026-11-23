import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, Min, Max, IsIn, ValidateIf } from 'class-validator';
export class AlertPreferencesDto {
  @ApiProperty({ type: Number }) @IsInt() @Min(0) @Max(30) dueDays!: number;
  @ApiProperty({ type: Number }) @IsInt() @Min(1) @Max(100) budgetPercent!: number;
  @ApiProperty({ type: Boolean }) @IsBoolean() bills!: boolean;
  @ApiProperty({ type: Boolean }) @IsBoolean() budgets!: boolean;
  @ApiPropertyOptional({ type: Boolean, default: false })
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  budgetEarly?: boolean;
  @ApiProperty({ type: Boolean }) @IsBoolean() negativeBalance!: boolean;
  @ApiProperty({ type: Boolean }) @IsBoolean() goals!: boolean;
}
export class AlertActionDto {
  @ApiProperty({ enum: ['read', 'dismiss'] }) @IsIn(['read', 'dismiss']) action!:
    'read' | 'dismiss';
}
export class AlertDto {
  @ApiProperty({ type: String }) id!: string;
  @ApiProperty({ type: String }) kind!: string;
  @ApiProperty({ type: String }) title!: string;
  @ApiProperty({ type: String }) href!: string;
  @ApiProperty({ type: String }) createdAt!: string;
  @ApiProperty({ type: String, nullable: true }) readAt!: string | null;
}
export class AlertsSummaryDto {
  @ApiProperty({ type: AlertPreferencesDto }) preferences!: AlertPreferencesDto;
  @ApiProperty({ type: [AlertDto] }) items!: AlertDto[];
}
