//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';
const LRU = require('lru-cache');

/**
 * LRU prepare cache for storing prepared SQL statements
 *
 * This class provides caching functionality for prepared statements
 * using a Least Recently Used (LRU) cache strategy.
 */
class LruPrepareCache {
  #lruCache;
  #info;

  /**
   * Creates a new LRU prepare cache
   *
   * @param {Object} info - Database connection information
   * @param {number} prepareCacheLength - Maximum number of prepared statements to cache
   */
  constructor(info, prepareCacheLength) {
    if (!Number.isInteger(prepareCacheLength) || prepareCacheLength <= 0) {
      throw new TypeError('prepareCacheLength must be a positive integer');
    }

    this.#info = info;
    this.#lruCache = new LRU.LRUCache({
      max: prepareCacheLength,
      dispose: (value, key) => value.unCache()
    });
  }

  /**
   * Gets a cached prepared statement
   *
   * @param {string} sql - SQL statement to retrieve
   * @returns {Object|null} Cached prepared statement or null if not found
   */
  get(sql) {
    const key = this.#info.database + '|' + sql;
    const cachedItem = this.#lruCache.get(key);
    if (cachedItem) {
      return cachedItem.incrementUse();
    }

    return null;
  }

  /**
   * Adds a prepared statement to the cache
   *
   * @param {string} sql - SQL statement
   * @param {Object} cache - Prepared statement object
   * @returns {void}
   */
  set(sql, cache) {
    const key = this.#info.database + '|' + sql;
    this.#lruCache.set(key, cache);
  }

  /**
   * Provides a string representation of the cache contents
   *
   * @returns {string} String representation of cache
   */
  toString() {
    const keys = [...this.#lruCache.keys()];
    const keyStr = keys.length ? keys.map((key) => `[${key}]`).join(',') : '';
    return `info{cache:${keyStr}}`;
  }

  /**
   * Clears all cached prepared statements
   *
   * @returns {void}
   */
  reset() {
    this.#lruCache.clear();
  }
}

module.exports = LruPrepareCache;
