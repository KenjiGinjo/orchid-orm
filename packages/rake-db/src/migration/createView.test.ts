import { expectSql, getDb, resetDb, toLine } from '../test-utils';

const db = getDb();

const testUpAndDown = async (
  fn: (action: 'createView' | 'dropView') => Promise<void>,
  expectUp: () => void,
  expectDown: () => void,
) => {
  resetDb(true);
  await fn('createView');
  expectUp();

  resetDb(false);
  await fn('createView');
  expectDown();

  resetDb(true);
  await fn('dropView');
  expectDown();

  resetDb(false);
  await fn('dropView');
  expectUp();
};

describe('create and drop view', () => {
  it('should create and drop view', async () => {
    await testUpAndDown(
      (action) => db[action]('name', 'sql'),
      () =>
        expectSql(`
          CREATE VIEW "name" AS (sql)
        `),
      () =>
        expectSql(`
          DROP VIEW "name"
        `),
    );
  });

  it('should create and drop view with options', async () => {
    await testUpAndDown(
      (action) =>
        db[action](
          'name',
          {
            createOrReplace: true,
            dropIfExists: true,
            dropMode: 'CASCADE',
            temporary: true,
            recursive: true,
            columns: ['one', 'two'],
            with: {
              checkOption: 'LOCAL',
              securityBarrier: true,
              securityInvoker: true,
            },
          },
          'sql',
        ),
      () =>
        expectSql(
          toLine(`
            CREATE OR REPLACE TEMPORARY RECURSIVE VIEW "name"
            ("one", "two")
            WITH (
              check_option = 'LOCAL',
              security_barrier = true,
              security_invoker = true
            )
            AS (sql)
          `),
        ),
      () =>
        expectSql(`
          DROP VIEW IF EXISTS "name" CASCADE
        `),
    );
  });
});
