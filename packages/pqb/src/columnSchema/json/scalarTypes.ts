import { constructType, JSONType, JSONTypeAny } from './typeBase';
import { BaseNumberData } from '../number';
import { BaseStringData } from '../string';
import { numberTypeMethods, stringTypeMethods } from '../commonMethods';

export type JSONAny = JSONTypeAny & {
  dataType: 'any';
};
const any = () => {
  return constructType<JSONAny>({
    dataType: 'any',
  });
};

export type JSONBigInt = JSONType<bigint, 'bigint'> & {
  data: BaseNumberData;
} & typeof bigIntMethods;
const bigIntMethods = {
  dataType: 'bigint' as const,
  ...numberTypeMethods<JSONType<bigint, 'bigint'> & { data: BaseNumberData }>(),
};
const bigint = () => {
  return constructType<JSONBigInt>(bigIntMethods);
};

export type JSONBoolean = JSONType<boolean, 'boolean'>;
const boolean = () => {
  return constructType<JSONBoolean>({
    dataType: 'boolean',
  });
};

export type JSONNaN = JSONType<number, 'nan'>;
const nan = () => {
  return constructType<JSONNaN>({
    dataType: 'nan',
  });
};

export type JSONNever = JSONType<unknown, 'never'>;
const never = () => {
  return constructType<JSONNever>({
    dataType: 'never',
  });
};

export type JSONNull = JSONType<null, 'null'>;
const nullType = () => {
  return constructType<JSONNull>({
    dataType: 'null',
  });
};

export type JSONNumber = JSONType<number, 'number'> & {
  data: BaseNumberData;
} & typeof numberMethods;
const numberMethods = {
  ...numberTypeMethods<JSONType<number, 'number'> & { data: BaseNumberData }>(),
  dataType: 'number' as const,
};
const number = () => {
  return constructType<JSONNumber>(numberMethods);
};

export type JSONDate = JSONType<Date, 'date'>;
const date = () => {
  return constructType<JSONDate>({
    dataType: 'date',
  });
};

export type JSONString = JSONType<string, 'string'> & {
  data: BaseStringData;
} & typeof stringMethods;
const stringMethods = {
  ...stringTypeMethods<JSONType<number, 'string'> & { data: BaseStringData }>(),
  dataType: 'string' as const,
};
const string = () => {
  return constructType<JSONString>(stringMethods);
};

export type JSONUndefined = JSONType<undefined, 'undefined'>;
const undefinedType = () => {
  return constructType<JSONUndefined>({
    dataType: 'undefined',
  });
};

export type JSONUnknown = JSONType<unknown, 'unknown'>;
const unknown = () => {
  return constructType<JSONUnknown>({
    dataType: 'unknown',
  });
};

export type JSONVoid = JSONType<void, 'void'>;
const voidType = () => {
  return constructType<JSONVoid>({
    dataType: 'void',
  });
};

export const scalarTypes = {
  any,
  bigint,
  boolean,
  date,
  nan,
  never,
  null: nullType,
  number,
  string,
  undefined: undefinedType,
  unknown,
  void: voidType,
};