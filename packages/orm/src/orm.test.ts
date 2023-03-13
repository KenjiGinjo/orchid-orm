import { OrchidORM, orchidORM } from './orm';
import {
  assertType,
  expectSql,
  useTestDatabase,
} from './test-utils/test-utils';
import { pgConfig } from './test-utils/test-db';
import { createBaseTable } from './table';

describe('orm', () => {
  useTestDatabase();

  let local:
    | OrchidORM<{ user: typeof UserTable; profile: typeof ProfileTable }>
    | undefined;

  afterEach(async () => {
    if (local) await local.$close();
  });

  const BaseTable = createBaseTable();

  type User = UserTable['columns']['type'];
  class UserTable extends BaseTable {
    table = 'user';
    columns = this.setColumns((t) => ({
      id: t.serial().primaryKey(),
      name: t.text(1, 10),
      password: t.text(1, 10),
    }));
  }

  class ProfileTable extends BaseTable {
    table = 'profile';
    columns = this.setColumns((t) => ({
      id: t.serial().primaryKey(),
    }));
  }

  it('should return object with provided adapter, close and transaction method, tables', () => {
    local = orchidORM(pgConfig, {
      user: UserTable,
      profile: ProfileTable,
    });

    expect('$adapter' in local).toBe(true);
    expect(local.$close).toBeInstanceOf(Function);
    expect(local.$transaction).toBeInstanceOf(Function);
    expect(Object.keys(local)).toEqual(
      expect.arrayContaining(['user', 'profile']),
    );
  });

  it('should return table which is a queryable interface', async () => {
    local = orchidORM(pgConfig, {
      user: UserTable,
      profile: ProfileTable,
    });

    const { id, name } = await local.user.create({
      name: 'name',
      password: 'password',
    });

    const query = local.user.select('id', 'name').where({ id: { gt: 0 } });

    expectSql(
      query.toSql(),
      `
        SELECT "user"."id", "user"."name"
        FROM "user"
        WHERE "user"."id" > $1
      `,
      [0],
    );

    const result = await query;
    expect(result).toEqual([{ id, name }]);

    assertType<typeof result, Pick<User, 'id' | 'name'>[]>();
  });

  it('should be able to turn on autoPreparedStatements', () => {
    local = orchidORM(
      { ...pgConfig, autoPreparedStatements: true },
      {
        user: UserTable,
        profile: ProfileTable,
      },
    );

    expect(local.user.query.autoPreparedStatements).toBe(true);
  });
});
