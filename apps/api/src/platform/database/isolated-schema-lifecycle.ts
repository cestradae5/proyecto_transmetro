export interface IsolatedSchemaQueryRunner {
  query(statement: string): Promise<unknown>;
  release(): Promise<void>;
}

export interface IsolatedSchemaDataSource {
  destroy(): Promise<void>;
  isInitialized: boolean;
}

export interface IsolatedSchemaCleanupOptions {
  dataSource: IsolatedSchemaDataSource | undefined;
  queryRunner: IsolatedSchemaQueryRunner | undefined;
  schemaName: string | undefined;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

export async function cleanupIsolatedSchema({
  dataSource,
  queryRunner,
  schemaName,
}: IsolatedSchemaCleanupOptions): Promise<void> {
  try {
    if (queryRunner !== undefined) {
      try {
        await queryRunner.query("ROLLBACK");
      } finally {
        if (schemaName !== undefined) {
          await queryRunner.query(
            `DROP SCHEMA IF EXISTS ${quoteIdentifier(schemaName)} CASCADE`,
          );
        }
      }
    }
  } finally {
    try {
      if (queryRunner !== undefined) {
        await queryRunner.release();
      }
    } finally {
      if (dataSource?.isInitialized === true) {
        await dataSource.destroy();
      }
    }
  }
}
