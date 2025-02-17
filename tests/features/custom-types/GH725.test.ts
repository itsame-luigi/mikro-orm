import { EntitySchema, MikroORM, Type, ValidationError } from '@mikro-orm/core';
import type { AbstractSqlDriver } from '@mikro-orm/knex';
import { SchemaGenerator } from '@mikro-orm/knex';

export class DateTime {

  constructor(private readonly date = new Date()) { }

  toDate() {
    return this.date;
  }

  static fromString(d: string) {
    return new DateTime(new Date(d));
  }

}

type Maybe<T> = T | null | undefined;

export type TimestampTypeOptions = {
  hasTimeZone: boolean;
};

export class DateTimeType extends Type<Maybe<DateTime>, Maybe<Date>> {

  convertToDatabaseValue(value: unknown): Maybe<Date> {
    if (value === undefined || value === null || value instanceof Date) {
      return value;
    }

    if (value instanceof DateTime) {
      return value.toDate();
    }

    throw ValidationError.invalidType(DateTimeType, value, 'JS');
  }

  convertToJSValue(value: unknown): Maybe<DateTime> {
    if (value === undefined || value === null) {
      return value;
    }

    if (value instanceof Date) {
      return new DateTime(value);
    }

    throw ValidationError.invalidType(DateTimeType, value, 'database');
  }

  getColumnType(): string {
    return 'timestamptz';
  }

}

export class Test {

  id!: string;
  createdAt!: DateTime;
  updatedAt!: DateTime;

}

export const TestSchema = new EntitySchema<Test>({
  class: Test,
  properties: {
    id: {
      primary: true,
      type: String,
      columnType: 'uuid',
      defaultRaw: 'uuid_generate_v4()',
    },
    createdAt: {
      defaultRaw: 'now()',
      type: DateTimeType,
    },
    updatedAt: {
      onCreate: () => new DateTime(),
      onUpdate: () => new DateTime(),
      type: DateTimeType,
    },
  },
});

export class Test2 {

  id!: string;

}

export const TestSchema2 = new EntitySchema<Test2>({
  name: 'Test2',
  properties: {
    id: {
      primary: true,
      type: Number,
    },
  },
});

describe('GH issue 725', () => {

  test('mapping values from returning statement to custom types', async () => {
    const orm = await MikroORM.init<AbstractSqlDriver>({
      entities: [TestSchema],
      dbName: `mikro_orm_test_gh_725`,
      type: 'postgresql',
    });
    await orm.getSchemaGenerator().ensureDatabase();
    await orm.getSchemaGenerator().execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await new SchemaGenerator(orm.em).dropSchema();
    await new SchemaGenerator(orm.em).createSchema();

    const test = new Test();
    orm.em.persist(test);
    expect(test.id).toBeUndefined();
    expect(test.createdAt).toBeUndefined();

    await orm.em.flush();
    expect(typeof test.id).toBe('string');
    expect(test.id).toHaveLength(36);
    expect(test.createdAt).toBeInstanceOf(DateTime);

    test.createdAt = DateTime.fromString('2020-01-01T00:00:00Z');
    await orm.em.flush();
    orm.em.clear();

    const t1 = await orm.em.findOneOrFail(Test, test);
    expect(t1.createdAt).toBeInstanceOf(DateTime);
    expect(t1.createdAt.toDate().toISOString()).toBe('2020-01-01T00:00:00.000Z');

    await orm.close(true);
  });

  test('validation when trying to persist not discovered entity', async () => {
    const orm = await MikroORM.init<AbstractSqlDriver>({
      entities: [TestSchema2],
      dbName: `:memory:`,
      type: 'sqlite',
    });

    const test = new Test2();
    const err = `Trying to persist not discovered entity of type Test2. Entity with this name was discovered, but not the prototype you are passing to the ORM. If using EntitySchema, be sure to point to the implementation via \`class\`.`;
    expect(() => orm.em.persist(test)).toThrowError(err);
    await orm.close();
  });

});
