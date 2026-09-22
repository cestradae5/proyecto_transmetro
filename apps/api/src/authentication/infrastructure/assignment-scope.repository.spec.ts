import { AssignmentScopeRepository } from "./assignment-scope.repository.js";

interface QueryCall {
  parameters: (number | string)[] | undefined;
  statement: string;
}

interface ScopeRow {
  id: string;
}

class RecordingQueryExecutor {
  readonly calls: QueryCall[] = [];

  constructor(
    private readonly rowsForStatement: (statement: string) => ScopeRow[],
  ) {}

  async query(
    statement: string,
    parameters?: (number | string)[],
  ): Promise<ScopeRow[]> {
    this.calls.push({ parameters, statement });

    return this.rowsForStatement(statement);
  }
}

function scopeRows(statement: string): ScopeRow[] {
  if (statement.includes("tbl_asignacion_piloto")) {
    return [{ id: "unit-1" }];
  }

  if (statement.includes("tbl_estacion_linea")) {
    return [{ id: "line-1" }];
  }

  return [{ id: "station-1" }];
}

function findUnitQuery(calls: readonly QueryCall[]): QueryCall {
  const unitQuery = calls.find((call) =>
    call.statement.includes("tbl_asignacion_piloto"),
  );

  if (unitQuery === undefined) {
    throw new Error("The repository did not issue the unit-scope query.");
  }

  return unitQuery;
}

describe("AssignmentScopeRepository", () => {
  it("binds only the employee ID for the unit lookup", async () => {
    const queryExecutor = new RecordingQueryExecutor(scopeRows);
    const repository = new AssignmentScopeRepository(queryExecutor);

    await expect(repository.findByEmployeeId("employee-1")).resolves.toEqual({
      lineIds: ["line-1"],
      stationIds: ["station-1"],
      unitIds: ["unit-1"],
    });

    expect(findUnitQuery(queryExecutor.calls)).toEqual({
      parameters: ["employee-1"],
      statement: expect.stringContaining(
        "WHERE pilot_assignment.id_empleado = $1",
      ),
    });
  });

  it("keeps the unit lookup bind arity valid when the scope is empty", async () => {
    const queryExecutor = new RecordingQueryExecutor(() => []);
    const repository = new AssignmentScopeRepository(queryExecutor);

    await expect(
      repository.findByEmployeeId("employee-without-assignments"),
    ).resolves.toEqual({
      lineIds: [],
      stationIds: [],
      unitIds: [],
    });

    expect(findUnitQuery(queryExecutor.calls).parameters).toEqual([
      "employee-without-assignments",
    ]);
  });
});
