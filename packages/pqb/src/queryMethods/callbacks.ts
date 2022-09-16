import { Query } from '../query';
import { pushQueryValue } from '../queryDataUtils';

export type BeforeCallback<T extends Query> = (
  query: T,
) => void | Promise<void>;

export type AfterCallback<T extends Query> = (
  query: T,
  data: unknown,
) => void | Promise<void>;

export class QueryCallbacks {
  beforeQuery<T extends Query>(this: T, cb: BeforeCallback<T>): T {
    return this.clone()._beforeQuery(cb);
  }
  _beforeQuery<T extends Query>(this: T, cb: BeforeCallback<T>): T {
    return pushQueryValue(this, 'beforeQuery', cb);
  }

  afterQuery<T extends Query>(this: T, cb: AfterCallback<T>): T {
    return this.clone()._afterQuery(cb);
  }
  _afterQuery<T extends Query>(this: T, cb: AfterCallback<T>): T {
    return pushQueryValue(this, 'afterQuery', cb);
  }

  beforeInsert<T extends Query>(this: T, cb: BeforeCallback<T>): T {
    return this.clone()._beforeInsert(cb);
  }
  _beforeInsert<T extends Query>(this: T, cb: BeforeCallback<T>): T {
    return pushQueryValue(this, 'beforeInsert', cb);
  }

  afterInsert<T extends Query>(this: T, cb: AfterCallback<T>): T {
    return this.clone()._afterInsert(cb);
  }
  _afterInsert<T extends Query>(this: T, cb: AfterCallback<T>): T {
    return pushQueryValue(this, 'afterInsert', cb);
  }

  beforeUpdate<T extends Query>(this: T, cb: BeforeCallback<T>): T {
    return this.clone()._beforeUpdate(cb);
  }
  _beforeUpdate<T extends Query>(this: T, cb: BeforeCallback<T>): T {
    return pushQueryValue(this, 'beforeUpdate', cb);
  }

  afterUpdate<T extends Query>(this: T, cb: AfterCallback<T>): T {
    return this.clone()._afterUpdate(cb);
  }
  _afterUpdate<T extends Query>(this: T, cb: AfterCallback<T>): T {
    return pushQueryValue(this, 'afterUpdate', cb);
  }
}