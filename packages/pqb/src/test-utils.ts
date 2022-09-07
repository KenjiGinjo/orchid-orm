import { Query } from './query';
import { Adapter } from './adapter';
import { createDb } from './db';
import {
  patchPgForTransactions,
  rollbackTransaction,
  startTransaction,
  unpatchPgForTransactions,
} from 'pg-transactional-tests';
import { Client } from 'pg';
import { quote } from './quote';
import { columnTypes } from './columnSchema';

export const dbClient = new Client({
  connectionString: process.env.DATABASE_URL,
});

export const adapter = Adapter({ connectionString: process.env.DATABASE_URL });

export const db = createDb(adapter);

const dateColumn = columnTypes.timestamp().parse((input) => new Date(input));

export const User = db('user', (t) => ({
  id: t.serial().primaryKey(),
  name: t.text(),
  password: t.text(),
  picture: t.text().nullable(),
  data: t
    .json((j) =>
      j.object({
        name: j.string(),
        tags: j.string().array(),
      }),
    )
    .nullable(),
  age: t.integer().nullable(),
  active: t.boolean().nullable(),
  createdAt: dateColumn,
  updatedAt: dateColumn,
}));

export const Profile = db('profile', (t) => ({
  id: t.serial().primaryKey(),
  userId: t.integer(),
  bio: t.text().nullable(),
  createdAt: dateColumn,
  updatedAt: dateColumn,
}));

export const Chat = db('chat', (t) => ({
  id: t.serial().primaryKey(),
  title: t.text(),
  createdAt: dateColumn,
  updatedAt: dateColumn,
}));

export const Message = db('message', (t) => ({
  id: t.serial().primaryKey(),
  chatId: t.integer(),
  authorId: t.integer(),
  text: t.text(),
  createdAt: dateColumn,
  updatedAt: dateColumn,
}));

export const line = (s: string) =>
  s.trim().replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')');

export const expectSql = (
  sql: { text: string; values: unknown[] },
  text: string,
  values: unknown[] = [],
) => {
  expect(sql.text).toBe(line(text));
  expect(sql.values).toEqual(values);
};

export const expectQueryNotMutated = (q: Query) => {
  expectSql(q.toSql(), `SELECT "${q.table}".* FROM "${q.table}"`);
};

export const expectMatchObjectWithTimestamps = (
  actual: { createdAt: Date; updatedAt: Date },
  expected: { createdAt: Date; updatedAt: Date },
) => {
  expect({
    ...actual,
    createdAt: actual.createdAt.toISOString(),
    updatedAt: actual.updatedAt.toISOString(),
  }).toMatchObject({
    ...expected,
    createdAt: expected.createdAt.toISOString(),
    updatedAt: expected.updatedAt.toISOString(),
  });
};

export type AssertEqual<T, Expected> = [T] extends [Expected]
  ? [Expected] extends [T]
    ? true
    : false
  : false;

export const insert = async <
  T extends Record<string, unknown> & { id: number },
>(
  table: string,
  record: T,
): Promise<T> => {
  const columns = Object.keys(record);
  const result = await dbClient.query<{ id: number }>(
    `INSERT INTO "${table}"(${columns
      .map((column) => `"${column}"`)
      .join(', ')}) VALUES (${columns
      .map((column) => quote(record[column]))
      .join(', ')}) RETURNING "id"`,
  );

  record.id = result.rows[0].id;
  return record;
};

let userIdCounter = 1;
export const insertUser = async (
  options: Partial<typeof User.type> & { count?: number } = {},
) => {
  const now = new Date();
  const { count = 1, ...data } = options;
  const id = userIdCounter;
  for (let i = 0; i < count; i++) {
    await insert('user', {
      id: userIdCounter++,
      name: 'name',
      password: 'password',
      picture: null,
      active: true,
      createdAt: now,
      updatedAt: now,
      ...data,
    });
  }
  return id;
};

let profileIdCounter = 1;
export const insertProfile = async (
  options: Partial<typeof Profile.type> & { count?: number } = {},
) => {
  const now = new Date();
  const { count = 1, ...data } = options;
  const id = profileIdCounter;
  for (let i = 0; i < count; i++) {
    await insert('profile', {
      id: profileIdCounter++,
      userId: userIdCounter,
      bio: 'text',
      createdAt: now,
      updatedAt: now,
      ...data,
    });
  }
  return id;
};

let chatIdCounter = 1;
export const insertChat = async (
  options: Partial<typeof Chat.type> & { count?: number } = {},
) => {
  const now = new Date();
  const { count = 1, ...data } = options;
  const id = chatIdCounter;
  for (let i = 0; i < count; i++) {
    await insert('chat', {
      id: chatIdCounter++,
      title: 'title',
      createdAt: now,
      updatedAt: now,
      ...data,
    });
  }
  return id;
};

let messageIdCounter = 1;
export const insertMessage = async (
  options: Partial<typeof Message.type> & { count?: number } = {},
) => {
  const now = new Date();
  const { count = 1, ...data } = options;
  const id = messageIdCounter;
  for (let i = 0; i < count; i++) {
    await insert('message', {
      id: messageIdCounter++,
      chatId: chatIdCounter,
      authorId: userIdCounter,
      text: 'text',
      createdAt: now,
      updatedAt: now,
      ...data,
    });
  }
  return id;
};

export const insertUsers = (
  count: number,
  options: Partial<typeof User.type> = {},
) => insertUser({ count, ...options });

export const useTestDatabase = () => {
  beforeAll(() => {
    patchPgForTransactions();
  });
  beforeEach(async () => {
    await startTransaction(dbClient);
  });
  afterEach(async () => {
    await rollbackTransaction(dbClient);
  });
  afterAll(async () => {
    unpatchPgForTransactions();
    await dbClient.end();
  });
};
