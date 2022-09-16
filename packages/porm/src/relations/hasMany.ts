import {
  RelationData,
  RelationInfo,
  RelationThunkBase,
  RelationThunks,
} from './relations';
import { Model } from '../model';
import {
  addQueryOn,
  HasManyNestedInsert,
  HasManyNestedUpdate,
  HasManyRelation,
  InsertData,
  JoinCallback,
  MaybeArray,
  Query,
  QueryBase,
  Relation,
} from 'pqb';
import { WhereArg, WhereResult } from 'pqb/src/queryMethods/where';

export interface HasMany extends RelationThunkBase {
  type: 'hasMany';
  returns: 'many';
  options: HasManyRelation['options'];
}

export type HasManyInfo<
  T extends Model,
  Relations extends RelationThunks,
  Relation extends HasMany,
> = {
  params: Relation['options'] extends { primaryKey: string }
    ? Record<
        Relation['options']['primaryKey'],
        T['columns']['shape'][Relation['options']['primaryKey']]['type']
      >
    : Relation['options'] extends { through: string }
    ? RelationInfo<
        T,
        Relations,
        Relations[Relation['options']['through']]
      >['params']
    : never;
  populate: Relation['options'] extends { foreignKey: string }
    ? Relation['options']['foreignKey']
    : never;
};

export const makeHasManyMethod = (
  model: Query,
  relation: HasMany,
  query: Query,
): RelationData => {
  if ('through' in relation.options) {
    const { through, source } = relation.options;

    type ModelWithQueryMethod = Record<
      string,
      (params: Record<string, unknown>) => Query
    >;

    const throughRelation = (model.relations as Record<string, Relation>)[
      through
    ];

    const sourceRelation = (
      throughRelation.model.relations as Record<string, Relation>
    )[source];

    const whereExistsCallback = () => sourceRelation.joinQuery;

    return {
      returns: 'many',
      method: (params: Record<string, unknown>) => {
        const throughQuery = (model as unknown as ModelWithQueryMethod)[
          through
        ](params);

        return query.whereExists<Query, Query>(
          throughQuery,
          whereExistsCallback as unknown as JoinCallback<Query, Query>,
        );
      },
      nestedInsert: undefined,
      nestedUpdate: undefined,
      joinQuery: query.whereExists<Query, Query>(
        throughRelation.joinQuery,
        whereExistsCallback as unknown as JoinCallback<Query, Query>,
      ),
      primaryKey: sourceRelation.primaryKey,
    };
  }

  const { primaryKey, foreignKey } = relation.options;

  return {
    returns: 'many',
    method: (params: Record<string, unknown>) => {
      const values = { [foreignKey]: params[primaryKey] };
      return query.where(values)._defaults(values);
    },
    nestedInsert: (async (q, data) => {
      const connect = data.filter(
        (
          item,
        ): item is [
          Record<string, unknown>,
          { connect: WhereArg<QueryBase>[] },
        ] => Boolean(item[1].connect),
      );

      const t = query.transacting(q);

      if (connect.length) {
        await Promise.all(
          connect.flatMap(([selfData, { connect }]) =>
            connect.map((item) =>
              t
                .where<Query>(item)
                ._updateOrThrow({ [foreignKey]: selfData[primaryKey] }),
            ),
          ),
        );
      }

      const connectOrCreate = data.filter(
        (
          item,
        ): item is [
          Record<string, unknown>,
          {
            connectOrCreate: {
              where: WhereArg<QueryBase>;
              create: Record<string, unknown>;
            }[];
          },
        ] => Boolean(item[1].connectOrCreate),
      );

      let connected: number[];
      if (connectOrCreate.length) {
        connected = await Promise.all(
          connectOrCreate.flatMap(([selfData, { connectOrCreate }]) =>
            connectOrCreate.map((item) =>
              (
                t.where(item.where) as WhereResult<Query & { hasSelect: false }>
              )._update({
                [foreignKey]: selfData[primaryKey],
              }),
            ),
          ),
        );
      } else {
        connected = [];
      }

      let connectedI = 0;
      const create = data.filter(
        (
          item,
        ): item is [
          Record<string, unknown>,
          {
            create?: Record<string, unknown>[];
            connectOrCreate?: {
              where: WhereArg<QueryBase>;
              create: Record<string, unknown>;
            }[];
          },
        ] => {
          if (item[1].connectOrCreate) {
            const length = item[1].connectOrCreate.length;
            connectedI += length;
            for (let i = length; i > 0; i--) {
              if (connected[connectedI - i] === 0) return true;
            }
          }
          return Boolean(item[1].create);
        },
      );

      connectedI = 0;
      if (create.length) {
        await t.insert(
          create.flatMap(
            ([selfData, { create = [], connectOrCreate = [] }]) => {
              return [
                ...create.map((item) => ({
                  [foreignKey]: selfData[primaryKey],
                  ...item,
                })),
                ...connectOrCreate
                  .filter(() => connected[connectedI++] === 0)
                  .map((item) => ({
                    [foreignKey]: selfData[primaryKey],
                    ...item.create,
                  })),
              ];
            },
          ) as InsertData<Query>[],
        );
      }
    }) as HasManyNestedInsert,
    nestedUpdate: (async (q, data, params) => {
      const t = query.transacting(q);
      if (params.disconnect || params.set) {
        await t
          .where<Query>(
            getWhereForNestedUpdate(
              data,
              params.disconnect,
              primaryKey,
              foreignKey,
            ),
          )
          ._update({ [foreignKey]: null });

        if (params.set) {
          await t
            .where<Query>(
              Array.isArray(params.set)
                ? {
                    OR: params.set,
                  }
                : params.set,
            )
            ._update({ [foreignKey]: data[0][primaryKey] });
        }
      } else if (params.delete) {
        await t
          .where(
            getWhereForNestedUpdate(
              data,
              params.delete,
              primaryKey,
              foreignKey,
            ),
          )
          .delete();
      }
    }) as HasManyNestedUpdate,
    joinQuery: addQueryOn(query, query, model, foreignKey, primaryKey),
    primaryKey,
  };
};

const getWhereForNestedUpdate = (
  data: Record<string, unknown>[],
  params: MaybeArray<WhereArg<QueryBase>> | undefined,
  primaryKey: string,
  foreignKey: string,
) => {
  const where: WhereArg<Query> = {
    [foreignKey]: { in: data.map((item) => item[primaryKey]) },
  };
  if (params) {
    if (Array.isArray(params)) {
      where.OR = params;
    } else {
      Object.assign(where, params);
    }
  }
  return where;
};
