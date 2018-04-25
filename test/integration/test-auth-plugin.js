"use strict";

const base = require("../base.js");
const assert = require("chai").assert;

describe("authentication plugin", () => {

  it("ed25519 authentication plugin", function(done) {
    if (!shareConn.isMariaDB() || !shareConn.hasMinVersion(10, 2)) this.skip();
    shareConn.query("INSTALL SONAME 'auth_ed25519'");
    shareConn.query("drop user verificationEd25519AuthPlugin@'%'");
    shareConn.query("CREATE USER verificationEd25519AuthPlugin@'%' IDENTIFIED "
          + "VIA ed25519 USING 'ZIgUREUg5PVgQ6LskhXmO+eZLS0nC8be6HPjYWR4YJY'");
    shareConn.query("GRANT ALL on *.* to verificationEd25519AuthPlugin@'%'");
    const conn = base.createConnection({user:'verificationEd25519AuthPlugin', password: 'secret'});
    conn.connect(function(err) {
      assert.isNotNull(err);
      assert.isTrue(err.message.includes("Client does not support authentication protocol 'client_ed25519' requested by server."));
      done();
    });
  });

});
