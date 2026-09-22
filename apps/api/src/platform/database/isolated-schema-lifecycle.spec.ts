import {
  cleanupIsolatedSchema,
  type IsolatedSchemaDataSource,
  type IsolatedSchemaQueryRunner,
} from "./isolated-schema-lifecycle.js";

describe("cleanupIsolatedSchema", () => {
  it("rolls back a failed baseline before dropping its schema", async () => {
    const events: string[] = [];
    const queryRunner: IsolatedSchemaQueryRunner = {
      query: async (statement) => {
        events.push(statement);
      },
      release: async () => {
        events.push("release");
      },
    };
    const dataSource: IsolatedSchemaDataSource = {
      destroy: async () => {
        events.push("destroy");
      },
      isInitialized: true,
    };

    await cleanupIsolatedSchema({
      dataSource,
      queryRunner,
      schemaName: "assignment_scope_test",
    });

    expect(events).toEqual([
      "ROLLBACK",
      'DROP SCHEMA IF EXISTS "assignment_scope_test" CASCADE',
      "release",
      "destroy",
    ]);
  });

  it("releases and destroys the data source when schema cleanup fails", async () => {
    const events: string[] = [];
    const queryRunner: IsolatedSchemaQueryRunner = {
      query: async (statement) => {
        events.push(statement);

        if (statement.startsWith("DROP SCHEMA")) {
          throw new Error("schema cleanup failed");
        }
      },
      release: async () => {
        events.push("release");
      },
    };
    const dataSource: IsolatedSchemaDataSource = {
      destroy: async () => {
        events.push("destroy");
      },
      isInitialized: true,
    };

    await expect(
      cleanupIsolatedSchema({
        dataSource,
        queryRunner,
        schemaName: "assignment_scope_test",
      }),
    ).rejects.toThrow("schema cleanup failed");

    expect(events).toEqual([
      "ROLLBACK",
      'DROP SCHEMA IF EXISTS "assignment_scope_test" CASCADE',
      "release",
      "destroy",
    ]);
  });
});
