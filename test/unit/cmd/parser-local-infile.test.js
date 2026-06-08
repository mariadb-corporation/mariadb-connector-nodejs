//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

import { assert, describe, test } from 'vitest';

import Parser from '../../../lib/cmd/parser.js';
import * as Errors from '../../../lib/misc/errors.js';

describe.concurrent('parser local-infile guard', () => {
  // A malicious / MitM server can send a 0xfb local-infile request even though the client never
  // advertised the capability. The driver must refuse it when permitLocalInfile is disabled,
  // rather than streaming a local file (CONJS-354).
  test('refuses a server local-infile request when permitLocalInfile is disabled', async () => {
    let emptyPacketWritten = false;
    let fileAccessed = false;
    const out = {
      startPacket() {},
      writeEmptyPacket() {
        emptyPacketWritten = true;
      },
      writeBuffer() {
        fileAccessed = true; // would only happen if a file were streamed
      }
    };
    const packet = {
      skip() {},
      readStringRemaining() {
        fileAccessed = true; // guard must reject before the filename is even read
        return 'secret.txt';
      }
    };

    let rejected = null;
    const ctx = {
      sql: "LOAD DATA LOCAL INFILE 'secret.txt' INTO TABLE t (id)",
      initialValues: null,
      opts: {},
      reject: (err) => {
        rejected = err;
      },
      resolve: () => {},
      readResponsePacket() {}
    };

    Parser.prototype.readLocalInfile.call(ctx, packet, out, { permitLocalInfile: false }, {});
    // the rejection is scheduled on the next tick
    await new Promise((resolve) => process.nextTick(resolve));

    assert.isTrue(emptyPacketWritten, 'driver must answer the request with an empty packet');
    assert.isNotNull(rejected, 'query must be rejected');
    assert.equal(rejected.errno, Errors.client.ER_LOCAL_INFILE_DISABLED);
    assert.equal(rejected.sqlState, 'HY000');
    assert.isFalse(fileAccessed, 'driver must not read the filename nor stream any local file');
  });
});
