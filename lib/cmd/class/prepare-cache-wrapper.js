//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import PrepareWrapper from './prepare-wrapper.js';

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

export default PrepareCacheWrapper;
