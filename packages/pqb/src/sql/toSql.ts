import { EMPTY_OBJECT, getRaw, isRaw } from '../common';
import { Query } from '../query';
import { q, qc } from './common';
import { QueryData } from './types';
import { pushDistinctSql } from './distinct';
import { pushSelectSql } from './select';
import { windowToSql } from './window';
import { pushJoinSql } from './join';
import { pushWhereSql } from './where';
import { pushHavingSql } from './having';
import { pushWithSql } from './with';
import { pushFromAndAs } from './fromAndAs';
import { pushInsertSql } from './insert';
import { pushUpdateSql } from './update';
import { pushDeleteSql } from './delete';
import { pushTruncateSql } from './truncate';
import { pushColumnInfoSql } from './columnInfo';
import { pushOrderBySql } from './orderBy';

export const toSql = (model: Query): string => {
  const query = (model.query || EMPTY_OBJECT) as QueryData;

  const sql: string[] = [];
  if ('type' in query) {
    if (query.type === 'truncate') {
      if (!model.table) throw new Error('Table is missing for truncate');

      pushTruncateSql(sql, model.table, query);
      return sql.join(' ');
    }

    if (query.type === 'columnInfo') {
      if (!model.table) throw new Error('Table is missing for truncate');

      pushColumnInfoSql(sql, model.table, query);
      return sql.join(' ');
    }
  }

  const quotedAs = model.table && q(query.as || model.table);

  if (query.with) {
    pushWithSql(sql, query.with);
  }

  if ('type' in query) {
    if (query.type === 'insert') {
      if (!quotedAs) throw new Error('Table is missing for insert');

      pushInsertSql(sql, model, query, quotedAs);
      return sql.join(' ');
    }

    if (query.type === 'update') {
      if (!quotedAs) throw new Error('Table is missing for update');

      pushUpdateSql(sql, model, query, quotedAs);
      return sql.join(' ');
    }

    if (query.type === 'delete') {
      if (!quotedAs) throw new Error('Table is missing for delete');

      pushDeleteSql(sql, model, query, quotedAs);
      return sql.join(' ');
    }

    return '';
  }

  sql.push('SELECT');

  if (query.distinct) {
    pushDistinctSql(sql, query.distinct, quotedAs);
  }

  pushSelectSql(sql, model, query.select, quotedAs);

  pushFromAndAs(sql, model, query, quotedAs);

  pushJoinSql(sql, model, query, quotedAs);

  pushWhereSql(sql, model, query, quotedAs);

  if (query.group) {
    const group = query.group.map((item) =>
      typeof item === 'object' && isRaw(item)
        ? getRaw(item)
        : qc(item as string, quotedAs),
    );
    sql.push(`GROUP BY ${group.join(', ')}`);
  }

  pushHavingSql(sql, model, query, quotedAs);

  if (query.window) {
    const window: string[] = [];
    query.window.forEach((item) => {
      for (const key in item) {
        window.push(`${q(key)} AS ${windowToSql(item[key], quotedAs)}`);
      }
    });
    sql.push(`WINDOW ${window.join(', ')}`);
  }

  if (query.union) {
    query.union.forEach((item) => {
      const itemSql = isRaw(item.arg) ? getRaw(item.arg) : item.arg.toSql();
      sql.push(`${item.kind} ${item.wrap ? `(${itemSql})` : itemSql}`);
    });
  }

  if (query.order) pushOrderBySql(sql, quotedAs, query.order);

  const limit = query.take ? 1 : query.limit;
  if (limit) {
    sql.push(`LIMIT ${limit}`);
  }

  if (query.offset) {
    sql.push(`OFFSET ${query.offset}`);
  }

  if (query.for) {
    sql.push('FOR', query.for.type);
    const { tableNames } = query.for;
    if (tableNames) {
      if (isRaw(tableNames)) {
        sql.push('OF', getRaw(tableNames));
      } else {
        sql.push('OF', tableNames.map(q).join(', '));
      }
    }
    if (query.for.mode) sql.push(query.for.mode);
  }

  return sql.join(' ');
};
