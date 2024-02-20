import { TransactionAdapter } from 'pqb';
import { quoteWithSchema, RakeDbConfig } from '../common';
import { SilentQueries } from './migration';
import { ColumnSchemaConfig, RecordUnknown } from 'orchid-core';

export const saveMigratedVersion = async <
  SchemaConfig extends ColumnSchemaConfig,
  CT,
>(
  db: SilentQueries,
  version: string,
  config: RakeDbConfig<SchemaConfig, CT>,
): Promise<void> => {
  await db.silentArrays(
    `INSERT INTO ${quoteWithSchema({
      name: config.migrationsTable,
    })} VALUES ('${version}')`,
  );
};

export const removeMigratedVersion = async <
  SchemaConfig extends ColumnSchemaConfig,
  CT,
>(
  db: SilentQueries,
  version: string,
  config: RakeDbConfig<SchemaConfig, CT>,
) => {
  await db.silentArrays(
    `DELETE FROM ${quoteWithSchema({
      name: config.migrationsTable,
    })} WHERE version = '${version}'`,
  );
};

export class NoMigrationsTableError extends Error {}

export const getMigratedVersionsMap = async <
  SchemaConfig extends ColumnSchemaConfig,
  CT,
>(
  db: TransactionAdapter,
  config: RakeDbConfig<SchemaConfig, CT>,
): Promise<Record<string, boolean>> => {
  try {
    const result = await db.arrays<[string]>(
      `SELECT * FROM ${quoteWithSchema({ name: config.migrationsTable })}`,
    );
    return Object.fromEntries(result.rows.map((row) => [row[0], true]));
  } catch (err) {
    if ((err as RecordUnknown).code === '42P01') {
      throw new NoMigrationsTableError();
    } else {
      throw err;
    }
  }
};
