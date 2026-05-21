//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

// Type-only smoke test: exercise the public type surface in the shapes that
// broke under TS Node16 / NodeNext / Bundler in issue #346.

import mariadb, {
  createConnection as mdCreateConnection,
  Connection,
  Pool,
  PoolConfig,
  Types
} from 'mariadb';
import * as mariadbNs from 'mariadb';

const cfg: PoolConfig = { host: 'localhost', port: 3306 };

const p1: Pool = mariadb.createPool(cfg);
const p2: Pool = mariadbNs.createPool(cfg);
void p1.end();
void p2.end();
void mdCreateConnection('mariadb://localhost').then((c: Connection) => c.end());

const t: Types = Types.VARCHAR;
void t;
void mariadb.version;
