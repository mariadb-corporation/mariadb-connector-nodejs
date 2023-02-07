'use strict';
const LRU = require('lru-cache');

/**
 * LRU prepare cache
 *
 */
class LruPrepareCache {
  #lruCache;
  #info;
  constructor(info, prepareCacheLength) {
    this.#info = info;
    this.#lruCache = new LRU({
      max: prepareCacheLength,
      dispose: (value, key) => value.unCache()
    });
  }

  get(sql) {
    const key = this.#info.database + '|' + sql;
    const cachedItem = this.#lruCache.get(key);
    if (cachedItem) {
      return cachedItem.incrementUse();
    }
    return null;
  }

  set(sql, cache) {
    const key = this.#info.database + '|' + sql;
    this.#lruCache.set(key, cache);
  }

  toString() {
    let keyStr = '';
    for (const value of this.#lruCache.keys()) {
      keyStr += '[' + value + '],';
    }
    if (keyStr.length > 1) keyStr = keyStr.substring(0, keyStr.length - 1);
    return 'info{cache:' + keyStr + '}';
  }
}

module.exports = LruPrepareCache;
