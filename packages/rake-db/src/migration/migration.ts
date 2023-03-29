import {
  ColumnsShape,
  ColumnType,
  ColumnTypes,
  ForeignKeyOptions,
  IndexColumnOptions,
  IndexOptions,
  logParamToLogObject,
  QueryLogObject,
  Sql,
  TransactionAdapter,
  TextColumn,
  createDb,
  DbResult,
  DefaultColumnTypes,
  EnumColumn,
  quote,
  columnTypes,
  getRaw,
  Adapter,
} from 'pqb';
import {
  MaybeArray,
  QueryInput,
  raw,
  RawExpression,
  singleQuote,
} from 'orchid-core';
import { createTable, CreateTableResult } from './createTable';
import { changeTable, TableChangeData, TableChanger } from './changeTable';
import {
  RakeDbConfig,
  quoteWithSchema,
  getSchemaAndTableFromName,
} from '../common';
import { RakeDbAst } from '../ast';
import { columnTypeToSql } from './migrationUtils';

export type DropMode = 'CASCADE' | 'RESTRICT';

export type TableOptions = {
  dropMode?: DropMode;
  comment?: string;
  noPrimaryKey?: boolean;
  snakeCase?: boolean;
};

type TextColumnCreator = () => TextColumn;

export type MigrationColumnTypes = Omit<
  ColumnTypes,
  'text' | 'string' | 'enum'
> & {
  text: TextColumnCreator;
  string: TextColumnCreator;
  citext: TextColumnCreator;
  enum: (name: string) => EnumColumn;
};

export type ColumnsShapeCallback<Shape extends ColumnsShape = ColumnsShape> = (
  t: MigrationColumnTypes & { raw: typeof raw },
) => Shape;

export type ChangeTableOptions = {
  snakeCase?: boolean;
  comment?: string | [string, string] | null;
};

export type ChangeTableCallback = (t: TableChanger) => TableChangeData;

export type ColumnComment = { column: string; comment: string | null };

export type SilentQueries = {
  // query without logging
  silentQuery: Adapter['query'];
  silentArrays: Adapter['arrays'];
};

export type Migration = DbResult<DefaultColumnTypes> &
  MigrationBase & {
    adapter: SilentQueries;
  };

type ConstraintArg = {
  name?: string;
  references?: [
    columns: [string, ...string[]],
    table: string,
    foreignColumn: [string, ...string[]],
    options: Omit<ForeignKeyOptions, 'name' | 'dropMode'>,
  ];
  check?: RawExpression;
  dropMode?: DropMode;
};

export const createMigrationInterface = (
  tx: TransactionAdapter,
  up: boolean,
  options: RakeDbConfig,
): Migration => {
  const adapter = new TransactionAdapter(tx, tx.client, tx.types);
  const { query, arrays } = adapter;
  const log = logParamToLogObject(options.logger || console, options.log);

  adapter.query = ((q, types) => {
    return wrapWithLog(log, q, () => query.call(adapter, q, types));
  }) as typeof adapter.query;

  adapter.arrays = ((q, types) => {
    return wrapWithLog(log, q, () => arrays.call(adapter, q, types));
  }) as typeof adapter.arrays;

  Object.assign(adapter, { silentQuery: query, silentArrays: arrays });

  const db = createDb({ adapter }) as unknown as Migration;

  const { prototype: proto } = MigrationBase;
  for (const key of Object.getOwnPropertyNames(proto)) {
    (db as unknown as Record<string, unknown>)[key] =
      proto[key as keyof typeof proto];
  }

  db.migratedAsts = [];

  return Object.assign(db, {
    adapter,
    log,
    up,
    options,
  });
};

export class MigrationBase {
  public adapter!: TransactionAdapter;
  public log?: QueryLogObject;
  public up!: boolean;
  public options!: RakeDbConfig;
  public migratedAsts!: RakeDbAst[];

  createTable<Table extends string, Shape extends ColumnsShape>(
    tableName: Table,
    options: TableOptions,
    fn: ColumnsShapeCallback<Shape>,
  ): Promise<CreateTableResult<Table, Shape>>;
  createTable<Table extends string, Shape extends ColumnsShape>(
    tableName: Table,
    fn: ColumnsShapeCallback<Shape>,
  ): Promise<CreateTableResult<Table, Shape>>;
  createTable(
    tableName: string,
    cbOrOptions: ColumnsShapeCallback | TableOptions,
    cb?: ColumnsShapeCallback,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const options = typeof cbOrOptions === 'function' ? {} : cbOrOptions;
    const fn = (cb || cbOrOptions) as ColumnsShapeCallback;

    return createTable(this, this.up, tableName, options, fn);
  }

  dropTable<Table extends string, Shape extends ColumnsShape>(
    tableName: Table,
    options: TableOptions,
    fn: ColumnsShapeCallback<Shape>,
  ): Promise<CreateTableResult<Table, Shape>>;
  dropTable<Table extends string, Shape extends ColumnsShape>(
    tableName: Table,
    fn: ColumnsShapeCallback<Shape>,
  ): Promise<CreateTableResult<Table, Shape>>;
  dropTable(
    tableName: string,
    cbOrOptions: ColumnsShapeCallback | TableOptions,
    cb?: ColumnsShapeCallback,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const options = typeof cbOrOptions === 'function' ? {} : cbOrOptions;
    const fn = (cb || cbOrOptions) as ColumnsShapeCallback;

    return createTable(this, !this.up, tableName, options, fn);
  }

  changeTable(
    tableName: string,
    options: ChangeTableOptions,
    fn?: ChangeTableCallback,
  ): Promise<void>;
  changeTable(tableName: string, fn: ChangeTableCallback): Promise<void>;
  changeTable(
    tableName: string,
    cbOrOptions: ChangeTableCallback | ChangeTableOptions,
    cb?: ChangeTableCallback,
  ) {
    const [fn, options] =
      typeof cbOrOptions === 'function' ? [cbOrOptions, {}] : [cb, cbOrOptions];

    return changeTable(this, this.up, tableName, options, fn);
  }

  async renameTable(from: string, to: string): Promise<void> {
    const [fromSchema, f] = getSchemaAndTableFromName(this.up ? from : to);
    const [toSchema, t] = getSchemaAndTableFromName(this.up ? to : from);
    const ast: RakeDbAst.RenameTable = {
      type: 'renameTable',
      fromSchema,
      from: f,
      toSchema,
      to: t,
    };

    await this.adapter.query(
      `ALTER TABLE ${quoteWithSchema({
        schema: ast.fromSchema,
        name: ast.from,
      })} RENAME TO ${quoteWithSchema({
        schema: ast.toSchema,
        name: ast.to,
      })}`,
    );

    this.migratedAsts.push(ast);
  }

  addColumn(
    tableName: string,
    columnName: string,
    fn: (t: MigrationColumnTypes) => ColumnType,
  ) {
    return addColumn(this, this.up, tableName, columnName, fn);
  }

  dropColumn(
    tableName: string,
    columnName: string,
    fn: (t: MigrationColumnTypes) => ColumnType,
  ) {
    return addColumn(this, !this.up, tableName, columnName, fn);
  }

  addIndex(
    tableName: string,
    columns: MaybeArray<string | IndexColumnOptions>,
    options?: IndexOptions,
  ) {
    return addIndex(this, this.up, tableName, columns, options);
  }

  dropIndex(
    tableName: string,
    columns: MaybeArray<string | IndexColumnOptions>,
    options?: IndexOptions,
  ) {
    return addIndex(this, !this.up, tableName, columns, options);
  }

  addForeignKey(
    tableName: string,
    columns: [string, ...string[]],
    foreignTable: string,
    foreignColumns: [string, ...string[]],
    options?: ForeignKeyOptions,
  ) {
    return addForeignKey(
      this,
      this.up,
      tableName,
      columns,
      foreignTable,
      foreignColumns,
      options,
    );
  }

  dropForeignKey(
    tableName: string,
    columns: [string, ...string[]],
    foreignTable: string,
    foreignColumns: [string, ...string[]],
    options?: ForeignKeyOptions,
  ) {
    return addForeignKey(
      this,
      !this.up,
      tableName,
      columns,
      foreignTable,
      foreignColumns,
      options,
    );
  }

  addPrimaryKey(
    tableName: string,
    columns: string[],
    options?: { name?: string },
  ) {
    return addPrimaryKey(this, this.up, tableName, columns, options);
  }

  dropPrimaryKey(
    tableName: string,
    columns: string[],
    options?: { name?: string },
  ) {
    return addPrimaryKey(this, !this.up, tableName, columns, options);
  }

  addCheck(tableName: string, check: RawExpression) {
    return addCheck(this, this.up, tableName, check);
  }

  dropCheck(tableName: string, check: RawExpression) {
    return addCheck(this, !this.up, tableName, check);
  }

  addConstraint(tableName: string, constraint: ConstraintArg) {
    return addConstraint(this, this.up, tableName, constraint);
  }

  dropConstraint(tableName: string, constraint: ConstraintArg) {
    return addConstraint(this, !this.up, tableName, constraint);
  }

  renameColumn(tableName: string, from: string, to: string) {
    return this.changeTable(tableName, (t) => ({
      [from]: t.rename(to),
    }));
  }

  createSchema(schemaName: string) {
    return createSchema(this, this.up, schemaName);
  }

  dropSchema(schemaName: string) {
    return createSchema(this, !this.up, schemaName);
  }

  createExtension(
    name: string,
    options: Omit<RakeDbAst.Extension, 'type' | 'action' | 'name'> = {},
  ) {
    return createExtension(this, this.up, name, options);
  }

  dropExtension(
    name: string,
    options: Omit<
      RakeDbAst.Extension,
      'type' | 'action' | 'name' | 'values'
    > = {},
  ) {
    return createExtension(this, !this.up, name, options);
  }

  createEnum(
    name: string,
    values: [string, ...string[]],
    options?: Omit<
      RakeDbAst.Enum,
      'type' | 'action' | 'name' | 'values' | 'schema'
    >,
  ) {
    return createEnum(this, this.up, name, values, options);
  }

  dropEnum(
    name: string,
    values: [string, ...string[]],
    options?: Omit<
      RakeDbAst.Enum,
      'type' | 'action' | 'name' | 'values' | 'schema'
    >,
  ) {
    return createEnum(this, !this.up, name, values, options);
  }

  createDomain(
    name: string,
    fn: (t: ColumnTypes) => ColumnType,
    options?: Omit<
      RakeDbAst.Domain,
      'type' | 'action' | 'schema' | 'name' | 'baseType'
    >,
  ) {
    return createDomain(this, this.up, name, fn, options);
  }

  dropDomain(
    name: string,
    fn: (t: ColumnTypes) => ColumnType,
    options?: Omit<
      RakeDbAst.Domain,
      'type' | 'action' | 'schema' | 'name' | 'baseType'
    >,
  ) {
    return createDomain(this, !this.up, name, fn, options);
  }

  async tableExists(tableName: string) {
    return queryExists(this, {
      text: `SELECT 1 FROM "information_schema"."tables" WHERE "table_name" = $1`,
      values: [tableName],
    });
  }

  async columnExists(tableName: string, columnName: string): Promise<boolean> {
    return queryExists(this, {
      text: `SELECT 1 FROM "information_schema"."columns" WHERE "table_name" = $1 AND "column_name" = $2`,
      values: [tableName, columnName],
    });
  }

  async constraintExists(constraintName: string): Promise<boolean> {
    return queryExists(this, {
      text: `SELECT 1 FROM "information_schema"."table_constraints" WHERE "constraint_name" = $1`,
      values: [constraintName],
    });
  }
}

const wrapWithLog = async <Result>(
  log: QueryLogObject | undefined,
  query: QueryInput,
  fn: () => Promise<Result>,
): Promise<Result> => {
  if (!log) {
    return fn();
  } else {
    const sql = (
      typeof query === 'string'
        ? { text: query, values: [] }
        : query.values
        ? query
        : { ...query, values: [] }
    ) as Sql;

    const logData = log.beforeQuery(sql);

    try {
      const result = await fn();
      log.afterQuery(sql, logData);
      return result;
    } catch (err) {
      log.onError(err as Error, sql, logData);
      throw err;
    }
  }
};

const addColumn = (
  migration: MigrationBase,
  up: boolean,
  tableName: string,
  columnName: string,
  fn: (t: MigrationColumnTypes) => ColumnType,
): Promise<void> => {
  return changeTable(migration, up, tableName, {}, (t) => ({
    [columnName]: t.add(fn(t)),
  }));
};

const addIndex = (
  migration: MigrationBase,
  up: boolean,
  tableName: string,
  columns: MaybeArray<string | IndexColumnOptions>,
  options?: IndexOptions,
): Promise<void> => {
  return changeTable(migration, up, tableName, {}, (t) => ({
    ...t.add(t.index(columns, options)),
  }));
};

const addForeignKey = (
  migration: MigrationBase,
  up: boolean,
  tableName: string,
  columns: [string, ...string[]],
  foreignTable: string,
  foreignColumns: [string, ...string[]],
  options?: ForeignKeyOptions,
): Promise<void> => {
  return changeTable(migration, up, tableName, {}, (t) => ({
    ...t.add(t.foreignKey(columns, foreignTable, foreignColumns, options)),
  }));
};

const addPrimaryKey = (
  migration: MigrationBase,
  up: boolean,
  tableName: string,
  columns: string[],
  options?: { name?: string },
): Promise<void> => {
  return changeTable(migration, up, tableName, {}, (t) => ({
    ...t.add(t.primaryKey(columns, options)),
  }));
};

const addCheck = (
  migration: MigrationBase,
  up: boolean,
  tableName: string,
  check: RawExpression,
): Promise<void> => {
  return changeTable(migration, up, tableName, {}, (t) => ({
    ...t.add(t.check(check)),
  }));
};

const addConstraint = (
  migration: MigrationBase,
  up: boolean,
  tableName: string,
  constraint: ConstraintArg,
): Promise<void> => {
  return changeTable(migration, up, tableName, {}, (t) => ({
    ...t.add(t.constraint(constraint)),
  }));
};

const createSchema = async (
  migration: MigrationBase,
  up: boolean,
  name: string,
): Promise<void> => {
  const ast: RakeDbAst.Schema = {
    type: 'schema',
    action: up ? 'create' : 'drop',
    name,
  };

  await migration.adapter.query(
    `${ast.action === 'create' ? 'CREATE' : 'DROP'} SCHEMA "${name}"`,
  );

  migration.migratedAsts.push(ast);
};

const createExtension = async (
  migration: MigrationBase,
  up: boolean,
  name: string,
  options: Omit<RakeDbAst.Extension, 'type' | 'action' | 'name'>,
): Promise<void> => {
  const ast: RakeDbAst.Extension = {
    type: 'extension',
    action: up ? 'create' : 'drop',
    name,
    ...options,
  };

  let query;
  if (ast.action === 'drop') {
    query = `DROP EXTENSION${ast.dropIfExists ? ' IF EXISTS' : ''} "${
      ast.name
    }"${ast.cascade ? ' CASCADE' : ''}`;
  } else {
    query = `CREATE EXTENSION${
      ast.createIfNotExists ? ' IF NOT EXISTS' : ''
    } "${ast.name}"${ast.schema ? ` SCHEMA "${ast.schema}"` : ''}${
      ast.version ? ` VERSION '${ast.version}'` : ''
    }${ast.cascade ? ' CASCADE' : ''}`;
  }

  await migration.adapter.query(query);

  migration.migratedAsts.push(ast);
};

const createEnum = async (
  migration: MigrationBase,
  up: boolean,
  name: string,
  values: [string, ...string[]],
  options: Omit<
    RakeDbAst.Enum,
    'type' | 'action' | 'name' | 'values' | 'schema'
  > = {},
): Promise<void> => {
  const [schema, enumName] = getSchemaAndTableFromName(name);

  const ast: RakeDbAst.Enum = {
    type: 'enum',
    action: up ? 'create' : 'drop',
    schema,
    name: enumName,
    values,
    ...options,
  };

  let query;
  const quotedName = quoteWithSchema(ast);
  if (ast.action === 'create') {
    query = `CREATE TYPE ${quotedName} AS ENUM (${values
      .map(quote)
      .join(', ')})`;
  } else {
    query = `DROP TYPE${ast.dropIfExists ? ' IF EXISTS' : ''} ${quotedName}${
      ast.cascade ? ' CASCADE' : ''
    }`;
  }

  await migration.adapter.query(query);

  migration.migratedAsts.push(ast);
};

const createDomain = async (
  migration: MigrationBase,
  up: boolean,
  name: string,
  fn: (t: ColumnTypes) => ColumnType,
  options?: Omit<
    RakeDbAst.Domain,
    'type' | 'action' | 'schema' | 'name' | 'baseType'
  >,
): Promise<void> => {
  const [schema, domainName] = getSchemaAndTableFromName(name);

  const ast: RakeDbAst.Domain = {
    type: 'domain',
    action: up ? 'create' : 'drop',
    schema,
    name: domainName,
    baseType: fn(columnTypes),
    ...options,
  };

  let query;
  const values: unknown[] = [];
  const quotedName = quoteWithSchema(ast);
  if (ast.action === 'create') {
    query = `CREATE DOMAIN ${quotedName} AS ${columnTypeToSql(ast.baseType)}${
      ast.collation
        ? `
COLLATION ${singleQuote(ast.collation)}`
        : ''
    }${
      ast.default
        ? `
DEFAULT ${getRaw(ast.default, values)}`
        : ''
    }${ast.notNull || ast.check ? '\n' : ''}${[
      ast.notNull && 'NOT NULL',
      ast.check && `CHECK ${getRaw(ast.check, values)}`,
    ]
      .filter(Boolean)
      .join(' ')}`;
  } else {
    query = `DROP DOMAIN ${quotedName}${ast.cascade ? ' CASCADE' : ''}`;
  }

  await migration.adapter.query({
    text: query,
    values,
  });

  migration.migratedAsts.push(ast);
};

const queryExists = (
  db: MigrationBase,
  sql: { text: string; values: unknown[] },
): Promise<boolean> => {
  return db.adapter.query(sql).then(({ rowCount }) => rowCount > 0);
};
