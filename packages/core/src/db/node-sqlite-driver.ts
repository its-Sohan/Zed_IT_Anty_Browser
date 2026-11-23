import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import {
  NoopLogger,
  createTableRelationsHelpers,
  entityKind,
  extractTablesRelationalConfig,
  fillPlaceholders,
  sql,
  type ExtractTablesWithRelations,
  type Logger,
  type Query,
  type RelationalSchemaConfig,
  type TablesRelationalConfig,
} from 'drizzle-orm';
import {
  BaseSQLiteDatabase,
  SQLitePreparedQuery,
  SQLiteSession,
  SQLiteSyncDialect,
  SQLiteTransaction,
  type PreparedQueryConfig,
  type SQLiteExecuteMethod,
  type SQLiteTransactionConfig,
  type SelectedFieldsOrdered,
} from 'drizzle-orm/sqlite-core';
import * as drizzleUtils from 'drizzle-orm/utils';

type MapResultRowFn = (
  fields: SelectedFieldsOrdered,
  row: unknown[],
  joinsNotNullableMap: Record<string, boolean> | undefined,
) => Record<string, unknown>;

const mapResultRow = (drizzleUtils as unknown as { mapResultRow: MapResultRowFn }).mapResultRow;

function normalizeParam(value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return value as NodeJS.ArrayBufferView;
  }
  return String(value);
}

function normalizeParams(params: unknown[]): SQLInputValue[] {
  return params.map(normalizeParam);
}

/**
 * Lightweight synchronous SQLite client backed by Electron/Node's built-in `node:sqlite`,
 * requiring zero external native `.node` addons across Windows x64 and Linux x64.
 */
export class NodeSqliteClient {
  private readonly db: DatabaseSync;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
  }

  exec(sqlText: string): void {
    this.db.exec(sqlText);
  }

  pragma(statement: string, options?: { simple?: boolean }): unknown {
    const stmt = this.db.prepare(`PRAGMA ${statement}`);
    if (options?.simple) {
      stmt.setReturnArrays(true);
      const row = stmt.get() as unknown[] | undefined;
      return Array.isArray(row) ? row[0] : undefined;
    }
    return stmt.all();
  }

  prepare(sqlText: string) {
    const stmt = this.db.prepare(sqlText);
    return {
      run: (...params: unknown[]) => stmt.run(...normalizeParams(params)),
      all: (...params: unknown[]) => {
        stmt.setReturnArrays(false);
        return stmt.all(...normalizeParams(params));
      },
      get: (...params: unknown[]) => {
        stmt.setReturnArrays(false);
        return stmt.get(...normalizeParams(params));
      },
      raw: () => ({
        all: (...params: unknown[]) => {
          stmt.setReturnArrays(true);
          return stmt.all(...normalizeParams(params)) as unknown as unknown[][];
        },
        get: (...params: unknown[]) => {
          stmt.setReturnArrays(true);
          return stmt.get(...normalizeParams(params)) as unknown as unknown[] | undefined;
        },
      }),
    };
  }

  close(): void {
    this.db.close();
  }
}

type PreparedStatementLike = ReturnType<NodeSqliteClient['prepare']>;

class NodeSqlitePreparedQuery<
  T extends Omit<PreparedQueryConfig, 'statement' | 'run'> = Omit<PreparedQueryConfig, 'statement' | 'run'>,
> extends SQLitePreparedQuery<{
  type: 'sync';
  run: unknown;
  all: T['all'];
  get: T['get'];
  values: T['values'];
  execute: T['execute'];
}> {
  static override readonly [entityKind]: string = 'NodeSqlitePreparedQuery';
  declare joinsNotNullableMap?: Record<string, boolean>;

  constructor(
    private readonly stmt: PreparedStatementLike,
    query: Query,
    private readonly logger: Logger,
    private readonly fields: SelectedFieldsOrdered | undefined,
    executeMethod: SQLiteExecuteMethod,
    private readonly _isResponseInArrayMode: boolean,
    private readonly customResultMapper?: (rows: unknown[][]) => unknown,
  ) {
    super('sync', executeMethod, query);
  }

  run(placeholderValues?: Record<string, unknown>): unknown {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    return this.stmt.run(...params);
  }

  all(placeholderValues?: Record<string, unknown>): T['all'] {
    const { fields, joinsNotNullableMap, query, logger, stmt, customResultMapper } = this;
    if (!fields && !customResultMapper) {
      const params = fillPlaceholders(query.params, placeholderValues ?? {});
      logger.logQuery(query.sql, params);
      return stmt.all(...params) as T['all'];
    }
    const rows = this.values(placeholderValues) as unknown[][];
    if (customResultMapper) {
      return customResultMapper(rows) as T['all'];
    }
    return rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap)) as T['all'];
  }

  get(placeholderValues?: Record<string, unknown>): T['get'] {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    const { fields, stmt, joinsNotNullableMap, customResultMapper } = this;
    if (!fields && !customResultMapper) {
      return stmt.get(...params) as T['get'];
    }
    const row = stmt.raw().get(...params);
    if (!row) {
      return undefined as T['get'];
    }
    if (customResultMapper) {
      return customResultMapper([row]) as T['get'];
    }
    return mapResultRow(fields!, row, joinsNotNullableMap) as T['get'];
  }

  values(placeholderValues?: Record<string, unknown>): T['values'] {
    const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
    this.logger.logQuery(this.query.sql, params);
    return this.stmt.raw().all(...params) as T['values'];
  }

  isResponseInArrayMode(): boolean {
    return this._isResponseInArrayMode;
  }
}

class NodeSqliteTransaction<
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'sync', unknown, TFullSchema, TSchema> {
  static override readonly [entityKind]: string = 'NodeSqliteTransaction';

  constructor(
    private readonly dialectRef: SQLiteSyncDialect,
    private readonly sessionRef: NodeSqliteSession<TFullSchema, TSchema>,
    schemaRef: RelationalSchemaConfig<TSchema> | undefined,
    nestedIndex = 0,
  ) {
    super('sync', dialectRef, sessionRef, schemaRef, nestedIndex);
  }

  transaction<T>(transaction: (tx: NodeSqliteTransaction<TFullSchema, TSchema>) => T): T {
    const savepointName = `sp${this.nestedIndex}`;
    const tx = new NodeSqliteTransaction(
      this.dialectRef,
      this.sessionRef,
      this.schema,
      this.nestedIndex + 1,
    );
    this.sessionRef.run(sql.raw(`savepoint ${savepointName}`));
    try {
      const result = transaction(tx);
      this.sessionRef.run(sql.raw(`release savepoint ${savepointName}`));
      return result;
    } catch (err) {
      this.sessionRef.run(sql.raw(`rollback to savepoint ${savepointName}`));
      throw err;
    }
  }
}

class NodeSqliteSession<
  TFullSchema extends Record<string, unknown>,
  TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'sync', unknown, TFullSchema, TSchema> {
  static override readonly [entityKind]: string = 'NodeSqliteSession';
  private readonly logger: Logger;

  constructor(
    private readonly client: NodeSqliteClient,
    private readonly dialectRef: SQLiteSyncDialect,
    private readonly schema: RelationalSchemaConfig<TSchema> | undefined,
    options: { logger?: Logger } = {},
  ) {
    super(dialectRef);
    this.logger = options.logger ?? new NoopLogger();
  }

  prepareQuery<T extends Omit<PreparedQueryConfig, 'statement' | 'run'>>(
    query: Query,
    fields: SelectedFieldsOrdered | undefined,
    executeMethod: SQLiteExecuteMethod,
    isResponseInArrayMode: boolean,
    customResultMapper?: (rows: unknown[][]) => unknown,
  ): NodeSqlitePreparedQuery<T> {
    const stmt = this.client.prepare(query.sql);
    return new NodeSqlitePreparedQuery<T>(
      stmt,
      query,
      this.logger,
      fields,
      executeMethod,
      isResponseInArrayMode,
      customResultMapper,
    );
  }

  transaction<T>(
    transaction: (tx: NodeSqliteTransaction<TFullSchema, TSchema>) => T,
    config: SQLiteTransactionConfig = {},
  ): T {
    const tx = new NodeSqliteTransaction(this.dialectRef, this, this.schema);
    const behavior = (config.behavior ?? 'deferred').toUpperCase();
    this.client.exec(`BEGIN ${behavior}`);
    try {
      const result = transaction(tx);
      this.client.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        this.client.exec('ROLLBACK');
      } catch {
        // Ignore rollback failure if transaction is already closed
      }
      throw err;
    }
  }
}

/**
 * Creates a Drizzle ORM synchronous SQLite instance backed by `NodeSqliteClient` (`node:sqlite`).
 */
export function createNodeSqliteDrizzle<TSchema extends Record<string, unknown>>(
  client: NodeSqliteClient,
  config: { schema?: TSchema } = {},
): BaseSQLiteDatabase<'sync', unknown, TSchema> & { $client: NodeSqliteClient } {
  const dialect = new SQLiteSyncDialect();
  let schemaConfig: RelationalSchemaConfig<ExtractTablesWithRelations<TSchema>> | undefined;
  if (config.schema) {
    const tablesConfig = extractTablesRelationalConfig(config.schema, createTableRelationsHelpers);
    schemaConfig = {
      fullSchema: config.schema,
      schema: tablesConfig.tables,
      tableNamesMap: tablesConfig.tableNamesMap,
    } as RelationalSchemaConfig<ExtractTablesWithRelations<TSchema>>;
  }
  const session = new NodeSqliteSession(
    client,
    dialect,
    schemaConfig as RelationalSchemaConfig<TablesRelationalConfig> | undefined,
  );
  const db = new BaseSQLiteDatabase('sync', dialect, session as never, schemaConfig as never) as unknown as
    BaseSQLiteDatabase<'sync', unknown, TSchema> & { $client: NodeSqliteClient };
  db.$client = client;
  return db;
}
