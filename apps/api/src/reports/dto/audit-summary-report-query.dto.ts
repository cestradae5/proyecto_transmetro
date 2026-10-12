import { ApiProperty } from "@nestjs/swagger";
import { IsISO8601, Matches } from "class-validator";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = "must be a date in YYYY-MM-DD format";

export class AuditSummaryReportQueryDto {
  @ApiProperty({ description: "First day included (YYYY-MM-DD)", example: "2026-01-01" })
  @Matches(DATE_ONLY, { message: `from ${DATE_MESSAGE}` })
  @IsISO8601({ strict: true })
  from!: string;

  @ApiProperty({ description: "Last day included (YYYY-MM-DD)", example: "2026-01-31" })
  @Matches(DATE_ONLY, { message: `to ${DATE_MESSAGE}` })
  @IsISO8601({ strict: true })
  to!: string;
}
