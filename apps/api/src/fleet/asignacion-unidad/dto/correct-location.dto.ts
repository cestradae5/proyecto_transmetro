import { ReportLocationDto } from "./report-location.dto.js";

// Same shape as ReportLocationDto (task 3.2.2 notes the two operations are
// identical logic); kept as a distinct named type so the central-operator
// PATCH route and the report route each have their own DTO class, matching
// the file list task 3.2.2 specifies.
export class CorrectLocationDto extends ReportLocationDto {}
