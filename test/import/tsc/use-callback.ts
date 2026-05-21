//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

import mariadbCb, { createPool, PoolConfig } from 'mariadb/callback';

const cfg: PoolConfig = { host: 'localhost', port: 3306 };
const p1 = mariadbCb.createPool(cfg);
const p2 = createPool(cfg);
p1.end(() => {});
p2.end(() => {});
void mariadbCb.version;
