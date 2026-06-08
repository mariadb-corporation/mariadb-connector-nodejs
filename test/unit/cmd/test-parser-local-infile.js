//  SPDX-License-Identifier: LGPL-2.1-or-later
//  Copyright (c) 2015-2025 MariaDB Corporation Ab

'use strict';

const { assert } = require('chai');
const Parser = require('../../../lib/cmd/parser');
const Errors = require('../../../lib/misc/errors');

describe('parser local-infile guard', () => {
  // A malicious / MitM server can send a 0xfb local-infile request even though the client never
  // advertised the capability. The driver must refuse it when permitLocalInfile is disabled,
  // rather than streaming a local file (CONJS-354).
  it('refuses a server local-infile request when permitLocalInfile is disabled', (done) => {
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

    const ctx = {
      sql: "LOAD DATA LOCAL INFILE 'secret.txt' INTO TABLE t (id)",
      initialValues: null,
      opts: {},
      reject: (err) => {
        try {
          assert.isTrue(emptyPacketWritten, 'driver must answer the request with an empty packet');
          assert.equal(err.errno, Errors.ER_LOCAL_INFILE_DISABLED);
          assert.equal(err.sqlState, 'HY000');
          assert.isFalse(fileAccessed, 'driver must not read the filename nor stream any local file');
          done();
        } catch (e) {
          done(e);
        }
      },
      resolve: () => {},
      readResponsePacket() {}
    };

    Parser.prototype.readLocalInfile.call(ctx, packet, out, { permitLocalInfile: false }, {});
  });
});
