//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2024 MariaDB Corporation Ab

'use strict';

import { assert, describe, test, beforeAll, afterAll } from 'vitest';
import * as CheckNode from '../../check-node.js';

describe.concurrent('test Check-node version', () => {
  test('hasMinVersion check', () => {
    assert.isTrue(CheckNode.hasMinVersion('12.1.0', '11'));
    assert.isTrue(CheckNode.hasMinVersion('12.1.0', '11.1'));

    assert.isTrue(CheckNode.hasMinVersion('12.0.0', '12'));
    assert.isTrue(CheckNode.hasMinVersion('12.1.0', '12'));
    assert.isTrue(CheckNode.hasMinVersion('12.1.0', '12.0'));
    assert.isTrue(CheckNode.hasMinVersion('12.1.0', '12.1'));
    assert.isFalse(CheckNode.hasMinVersion('12.1.0', '12.2'));

    assert.isFalse(CheckNode.hasMinVersion('12.1.0', '13'));
    assert.isFalse(CheckNode.hasMinVersion('12.1.0', '13.1'));
  });
});
