// Structural coverage for the fleet domain error taxonomy (design.md
// Decision 3): every class must extend the correct shared base so
// DomainExceptionFilter dispatches it to the right HTTP status, and must
// keep a stable `.name` for the filter's `error` response field.
// Triangulation covers one representative of each base class; the 21
// classes are otherwise identical two-line shapes (no branching logic).

import { ConflictError, NotFoundError } from "../../shared/errors/domain-exception.filter.js";
import {
  DuplicatePlate,
  EmployeeNotFound,
  EnServicioRequiresBothAssignments,
  LineAssignmentNotFound,
  LineAssignmentUnchanged,
  LineNotFound,
  PilotAlreadyAssignedToUnit,
  PilotAssignmentNotFound,
  PilotAssignmentUnchanged,
  PilotHasNoUnitAssigned,
  PilotRoleRequired,
  StopNotFound,
  StopNotInAssignedLine,
  UnitAlreadyHasLineAssignment,
  UnitAlreadyHasPilotAssignment,
  UnitCannotBeCreatedEnServicio,
  UnitEnServicioCannotReassignPilot,
  UnitEnServicioCannotUnassignLine,
  UnitEnServicioCannotUnassignPilot,
  UnitHasNoLineAssignment,
  UnitNotFound,
} from "./fleet.errors.js";

describe("Fleet domain errors", () => {
  it.each([
    ["UnitNotFound", new UnitNotFound("1"), "UnitNotFound"],
    ["LineNotFound", new LineNotFound("1"), "LineNotFound"],
    ["EmployeeNotFound", new EmployeeNotFound("1"), "EmployeeNotFound"],
    ["StopNotFound", new StopNotFound("1"), "StopNotFound"],
    ["LineAssignmentNotFound", new LineAssignmentNotFound("1"), "LineAssignmentNotFound"],
    ["PilotAssignmentNotFound", new PilotAssignmentNotFound("1"), "PilotAssignmentNotFound"],
    ["PilotHasNoUnitAssigned", new PilotHasNoUnitAssigned(), "PilotHasNoUnitAssigned"],
  ])("%s extends the shared NotFoundError with a stable name", (_label, error, name) => {
    expect(error).toBeInstanceOf(NotFoundError);
    expect(error.name).toBe(name);
    expect(typeof error.message).toBe("string");
    expect(error.message.length).toBeGreaterThan(0);
  });

  it.each([
    ["DuplicatePlate", new DuplicatePlate("AB-12345"), "DuplicatePlate"],
    ["UnitCannotBeCreatedEnServicio", new UnitCannotBeCreatedEnServicio(), "UnitCannotBeCreatedEnServicio"],
    ["EnServicioRequiresBothAssignments", new EnServicioRequiresBothAssignments(), "EnServicioRequiresBothAssignments"],
    ["UnitAlreadyHasLineAssignment", new UnitAlreadyHasLineAssignment("1"), "UnitAlreadyHasLineAssignment"],
    ["LineAssignmentUnchanged", new LineAssignmentUnchanged(), "LineAssignmentUnchanged"],
    ["UnitEnServicioCannotUnassignLine", new UnitEnServicioCannotUnassignLine(), "UnitEnServicioCannotUnassignLine"],
    ["StopNotInAssignedLine", new StopNotInAssignedLine(), "StopNotInAssignedLine"],
    ["UnitHasNoLineAssignment", new UnitHasNoLineAssignment(), "UnitHasNoLineAssignment"],
    ["PilotRoleRequired", new PilotRoleRequired(), "PilotRoleRequired"],
    ["PilotAlreadyAssignedToUnit", new PilotAlreadyAssignedToUnit(), "PilotAlreadyAssignedToUnit"],
    ["UnitAlreadyHasPilotAssignment", new UnitAlreadyHasPilotAssignment(), "UnitAlreadyHasPilotAssignment"],
    ["PilotAssignmentUnchanged", new PilotAssignmentUnchanged(), "PilotAssignmentUnchanged"],
    ["UnitEnServicioCannotReassignPilot", new UnitEnServicioCannotReassignPilot(), "UnitEnServicioCannotReassignPilot"],
    ["UnitEnServicioCannotUnassignPilot", new UnitEnServicioCannotUnassignPilot(), "UnitEnServicioCannotUnassignPilot"],
  ])("%s extends the shared ConflictError with a stable name", (_label, error, name) => {
    expect(error).toBeInstanceOf(ConflictError);
    expect(error.name).toBe(name);
    expect(typeof error.message).toBe("string");
    expect(error.message.length).toBeGreaterThan(0);
  });
});
