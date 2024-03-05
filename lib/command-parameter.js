//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab
'use strict';
class CommandParameter {
  constructor(sql, values, opts, callback) {
    this.sql = sql;
    this.values = values;
    this.opts = opts;
    this.callback = callback;
  }
}

module.exports = CommandParameter;
