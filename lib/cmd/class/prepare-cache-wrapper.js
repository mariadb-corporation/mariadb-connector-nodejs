'use strict';

const PrepareWrapper = require('./prepare-wrapper');

/**
 * Prepare cache wrapper
 * see https://mariadb.com/kb/en/com_stmt_prepare/#com_stmt_prepare_ok
 */
class PrepareCacheWrapper {
  #use = 0;
  #cached;
  #prepare;

  constructor(prepare) {
    this.#prepare = prepare;
    this.#cached = true;
  }

  incrementUse() {
    this.#use += 1;
    return new PrepareWrapper(this, this.#prepare);
  }

  unCache() {
    this.#cached = false;
    if (this.#use === 0) {
      this.#prepare.close();
    }
  }

  decrementUse() {
    this.#use -= 1;
    if (this.#use === 0 && !this.#cached) {
      this.#prepare.close();
    }
  }

  toString() {
    return 'Prepare{use:' + this.#use + ',cached:' + this.#cached + '}';
  }
}

module.exports = PrepareCacheWrapper;
