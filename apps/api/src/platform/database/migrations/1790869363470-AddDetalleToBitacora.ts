import { type MigrationInterface, type QueryRunner } from "typeorm";

/**
 * Adds `detalle JSONB` to `tbl_bitacora`.
 *
 * `database/init.sql` only ever uses `CREATE TABLE IF NOT EXISTS`, so a
 * database whose `tbl_bitacora` predates this column can never be evolved by
 * re-running init.sql — the statement is a silent no-op on an existing table.
 * This migration is the only mechanism that can add the column to such a
 * database.
 *
 * Both `IF NOT EXISTS` and `IF EXISTS` are required for idempotency: the column
 * is already present on databases provisioned from the current init.sql, and
 * migration runners track applied migrations by name, not by schema state.
 * Re-running either direction against any of those databases must be a no-op
 * rather than an error.
 */
export class AddDetalleToBitacora1790869363470 implements MigrationInterface {
  name = "AddDetalleToBitacora1790869363470";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tbl_bitacora" ADD COLUMN IF NOT EXISTS "detalle" jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "tbl_bitacora" DROP COLUMN IF EXISTS "detalle"`,
    );
  }
}
