//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2026 MariaDB Corporation Ab

'use strict';

import runBenchSuite from './common-bench.js';
import * as bench from './benchs/do_1_pool.js';

await runBenchSuite(bench);
