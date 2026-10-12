import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsIn, IsInt, IsISO8601, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

import { AUDIT_RESULTS, type AuditResult } from "../../authentication/entities/audit-log.entity.js";

export const AUDIT_RESULT_VALUES = Object.values(AUDIT_RESULTS);
export const AUDIT_LOG_DEFAULT_PAGE_SIZE = 20;
export const AUDIT_LOG_MAX_PAGE_SIZE = 100;

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export class QueryAuditLogDto {
  @ApiPropertyOptional({ description: "Lower bound (inclusive), ISO 8601 date or timestamp", example: "2026-01-01" })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({
    description: "Upper bound (inclusive), ISO 8601. A date-only value covers that whole day.",
    example: "2026-01-31",
  })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;

  @ApiPropertyOptional({ description: "Case-insensitive match on the responsible employee's name or email" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(254)
  user?: string;

  @ApiPropertyOptional({ example: "fleet" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  module?: string;

  @ApiPropertyOptional({ example: "assign_pilot" })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  action?: string;

  @ApiPropertyOptional({ enum: AUDIT_RESULT_VALUES })
  @IsOptional()
  @IsIn(AUDIT_RESULT_VALUES)
  result?: AuditResult;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: AUDIT_LOG_DEFAULT_PAGE_SIZE, minimum: 1, maximum: AUDIT_LOG_MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(AUDIT_LOG_MAX_PAGE_SIZE)
  pageSize: number = AUDIT_LOG_DEFAULT_PAGE_SIZE;
}
