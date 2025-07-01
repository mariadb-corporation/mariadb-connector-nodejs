//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

/*
 * Callback-based API for mariadb-connector-nodejs
 * This file mirrors the structure of the promise-based API in index.d.ts,
 * but all async methods use Node.js-style callbacks as the last argument.
 *
 * Callback signature: (err: SqlError | null, result?: T, meta?: any) => void
 *
 * All types are reused from share.d.ts where possible.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import stream = require('stream');
import events = require('events');
import type {
  ConnectionConfig,
  ImportFileConfig,
  SqlError,
  FieldInfo,
  QueryOptions,
  UpsertResult,
  PoolConfig,
  PoolClusterConfig,
  SqlImportOptions,
  ConnectionInfo,
  UserConnectionConfig
} from './share';

export * from './share';

export const version: string;
export function createConnection(connectionUri: string | ConnectionConfig): Connection;
export function importFile(config: ImportFileConfig, callback: (err: SqlError | null) => void): void;

export interface Prepare {
  id: number;
  execute<T = any>(values: any, callback: (err: SqlError | null, result?: T, meta?: any) => void): void;
  /**
   * Execute query returning a Readable Object that will emit columns/data/end/error events
   * to permit streaming big result-set
   */
  executeStream(values: any): stream.Readable;
  close(): void;
}

export interface Connection extends events.EventEmitter {
  /** Connection information */
  info: ConnectionInfo | null;
  /** Alias of info.threadId for compatibility */
  readonly threadId: number | null;

  changeUser(options: UserConnectionConfig, callback: (err: SqlError | null) => void): void;
  beginTransaction(callback: (err: SqlError | null) => void): void;
  commit(callback: (err: SqlError | null) => void): void;
  rollback(callback: (err: SqlError | null) => void): void;
  query<T = any>(
    sql: string | QueryOptions,
    values: any,
    callback: (err: SqlError | null, result?: T, meta?: FieldInfo[]) => void
  ): void;
  query<T = any>(
    sql: string | QueryOptions,
    callback: (err: SqlError | null, result?: T, meta?: FieldInfo[]) => void
  ): void;
  prepare(sql: string | QueryOptions, callback: (err: SqlError | null, prepare?: Prepare) => void): void;
  execute<T = any>(
    sql: string | QueryOptions,
    values: any,
    callback: (err: SqlError | null, result?: T, meta?: FieldInfo[]) => void
  ): void;
  execute<T = any>(
    sql: string | QueryOptions,
    callback: (err: SqlError | null, result?: T, meta?: FieldInfo[]) => void
  ): void;
  batch<T = UpsertResult | UpsertResult[]>(
    sql: string | QueryOptions,
    values: any,
    callback: (err: SqlError | null, result?: T) => void
  ): void;
  batch<T = UpsertResult | UpsertResult[]>(
    sql: string | QueryOptions,
    callback: (err: SqlError | null, result?: T) => void
  ): void;
  queryStream(sql: string | QueryOptions, values?: any): stream.Readable;
  ping(callback: (err: SqlError | null) => void): void;
  reset(callback: (err: SqlError | null) => void): void;
  importFile(config: SqlImportOptions, callback: (err: SqlError | null) => void): void;
  isValid(): boolean;
  end(callback: (err: SqlError | null) => void): void;
  close(callback: (err: SqlError | null) => void): void;
  destroy(): void;
  pause(): void;
  resume(): void;
  serverVersion(): string;
  debug(value: boolean): void;
  debugCompress(value: boolean): void;
  escape(value: any): string;
  escapeId(identifier: string): string;
  on(ev: 'end', callback: () => void): Connection;
  on(ev: 'error', callback: (err: SqlError) => void): Connection;
  on(eventName: string | symbol, listener: (...args: any[]) => void): this;
  listeners(ev: 'end'): (() => void)[];
  listeners(ev: 'error'): ((err: SqlError) => void)[];
}

export interface PoolConnection extends Connection {
  release(callback: (err: SqlError | null) => void): void;
}

export interface Pool {
  closed: boolean;
  getConnection(callback: (err: SqlError | null, conn?: PoolConnection) => void): void;
  query<T = any>(
    sql: string | QueryOptions,
    values: any,
    callback: (err: SqlError | null, result?: T, meta?: FieldInfo[]) => void
  ): void;
  query<T = any>(
    sql: string | QueryOptions,
    callback: (err: SqlError | null, result?: T, meta?: FieldInfo[]) => void
  ): void;
  batch<T = UpsertResult | UpsertResult[]>(
    sql: string | QueryOptions,
    values: any,
    callback: (err: SqlError | null, result?: T) => void
  ): void;
  batch<T = UpsertResult | UpsertResult[]>(
    sql: string | QueryOptions,
    callback: (err: SqlError | null, result?: T) => void
  ): void;
  execute<T = any>(
    sql: string | QueryOptions,
    values: any,
    callback: (err: SqlError | null, result?: T, meta?: FieldInfo[]) => void
  ): void;
  execute<T = any>(
    sql: string | QueryOptions,
    callback: (err: SqlError | null, result?: T, meta?: FieldInfo[]) => void
  ): void;
  end(callback: (err: SqlError | null) => void): void;
  importFile(config: SqlImportOptions, callback: (err: SqlError | null) => void): void;
  activeConnections(): number;
  totalConnections(): number;
  idleConnections(): number;
  taskQueueSize(): number;
  escape(value: any): string;
  escapeId(identifier: string): string;
  on(ev: 'acquire', callback: (conn: Connection) => void): Pool;
  on(ev: 'connection', callback: (conn: Connection) => void): Pool;
  on(ev: 'enqueue', callback: () => void): Pool;
  on(ev: 'release', callback: (conn: Connection) => void): Pool;
}

export interface FilteredPoolCluster {
  getConnection(callback: (err: SqlError | null, conn?: PoolConnection) => void): void;
  query<T = any>(
    sql: string | QueryOptions,
    values: any,
    callback: (err: SqlError | null, result?: T, meta?: FieldInfo[]) => void
  ): void;
  query<T = any>(
    sql: string | QueryOptions,
    callback: (err: SqlError | null, result?: T, meta?: FieldInfo[]) => void
  ): void;
  batch<T = UpsertResult | UpsertResult[]>(
    sql: string | QueryOptions,
    values: any,
    callback: (err: SqlError | null, result?: T) => void
  ): void;
  batch<T = UpsertResult | UpsertResult[]>(
    sql: string | QueryOptions,
    callback: (err: SqlError | null, result?: T) => void
  ): void;
  execute<T = any>(
    sql: string | QueryOptions,
    values: any,
    callback: (err: SqlError | null, result?: T, meta?: FieldInfo[]) => void
  ): void;
  execute<T = any>(
    sql: string | QueryOptions,
    callback: (err: SqlError | null, result?: T, meta?: FieldInfo[]) => void
  ): void;
}

export interface PoolCluster {
  add(id: string, config: PoolConfig): void;
  end(callback: (err: SqlError | null) => void): void;
  of(pattern: string, selector?: string): FilteredPoolCluster;
  of(pattern: undefined | null | false, selector: string): FilteredPoolCluster;
  remove(pattern: string): void;
  getConnection(
    pattern: string | undefined | null,
    selector: string | undefined | null,
    callback: (err: SqlError | null, conn?: PoolConnection) => void
  ): void;
  getConnection(
    pattern: string | undefined | null,
    callback: (err: SqlError | null, conn?: PoolConnection) => void
  ): void;
  getConnection(callback: (err: SqlError | null, conn?: PoolConnection) => void): void;
  on(ev: 'remove', callback: (nodekey: string) => void): PoolCluster;
}
export function createPool(config: PoolConfig | string): Pool;
export function createPoolCluster(config?: PoolClusterConfig): PoolCluster;
