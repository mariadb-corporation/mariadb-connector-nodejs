"use strict";

const base = require("../base.js");
const assert = require("chai").assert;
const fs = require("fs");
const Conf = require("../conf");

describe("ssl", function() {
  let ca = null;
  let sslEnable = false;

  before(function(done) {
    if (process.env.TEST_SSL_CA_FILE) {
      const caFileName = process.env.TEST_SSL_CA_FILE;
      ca = [fs.readFileSync(caFileName, "utf8")];
    } else {
      ca = [fs.readFileSync(__dirname + "/../certificats/server.crt", "utf8")];
    }

    shareConn.query("DROP USER 'sslTestUser'@'%'", err => {});
    shareConn.query(
      "CREATE USER 'sslTestUser'@'%'" +
        ((shareConn.isMariaDB() && shareConn.hasMinVersion(10, 2, 0)) ||
        (!shareConn.isMariaDB() && shareConn.hasMinVersion(5, 7, 0))
          ? " REQUIRE SSL"
          : "")
    );
    shareConn.query(
      "GRANT ALL PRIVILEGES ON *.* TO 'sslTestUser'@'%' " +
        ((shareConn.isMariaDB() && !shareConn.hasMinVersion(10, 2, 0)) ||
        (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 0))
          ? " REQUIRE SSL"
          : "")
    );
    shareConn.query("DROP USER 'X509testUser'@'%'", err => {});
    shareConn.query(
      "CREATE USER 'X509testUser'@'%'" +
        ((shareConn.isMariaDB() && shareConn.hasMinVersion(10, 2, 0)) ||
        (!shareConn.isMariaDB() && shareConn.hasMinVersion(5, 7, 0))
          ? " REQUIRE X509"
          : "")
    );
    shareConn.query(
      "GRANT ALL PRIVILEGES ON *.* TO 'X509testUser'@'%'" +
        ((shareConn.isMariaDB() && !shareConn.hasMinVersion(10, 2, 0)) ||
        (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 0))
          ? " REQUIRE X509"
          : "")
    );
    shareConn.query("SHOW VARIABLES LIKE 'have_ssl'", (err, rows) => {
      if (rows[0].Value === "YES") {
        sslEnable = true;
        done();
      } else {
        //ssl is not enable on database, skipping test.
        shareConn.query("SHOW VARIABLES LIKE 'ssl'", (err, rows) => {
          console.log("ssl is not enable on database, skipping test :");
          for (let i = 0; i < rows.length; i++) {
            console.log(rows[0]["Variable_name"] + " = " + rows[0]["Value"]);
          }
          done();
        });
      }
    });
  });

  after(function(done) {
    shareConn.query("DROP USER 'sslTestUser'@'%'");
    shareConn.query("DROP USER 'X509testUser'@'%'", err => {
      done();
    });
  });

  it("signed certificate error ", function(done) {
    if (!sslEnable) this.skip();
    const conn = base.createConnection({ user: "sslTestUser", password: null, ssl: true });
    conn.connect(err => {
      if (err) {
        assert.isTrue(err.message.includes("self signed certificate"));
        done();
      } else {
        done(new Error("Must have thrown an exception !"));
      }
    });
  });

  it("signed certificate forcing", function(done) {
    if (!sslEnable) this.skip();
    const conn = base.createConnection({ ssl: { rejectUnauthorized: false } });
    conn.connect(err => {
      if (err) {
        done(err);
      } else {
        conn.end();
        done();
      }
    });
  });

  it("ensure connection use SSL ", function(done) {
    if (!sslEnable) this.skip();
    const conn = base.createConnection({
      user: "sslTestUser",
      password: null,
      ssl: { rejectUnauthorized: false }
    });
    conn.connect(err => {
      if (err) {
        done(err);
      } else {
        conn.end();
        done();
      }
    });
  });

  it("SSLv3 disable", function(done) {
    if (!sslEnable) this.skip();
    const conn = base.createConnection({
      ssl: { rejectUnauthorized: false, secureProtocol: "SSLv3_client_method" }
    });
    conn.connect(err => {
      if (err) {
        assert.isTrue(err.message.includes("SSLv3 methods disabled"));
        conn.end();

        done();
      } else {
        done(new Error("Must have thrown an exception !"));
      }
    });
  });

  it("SSLv2 disable", function(done) {
    if (!sslEnable) this.skip();
    const conn = base.createConnection({
      ssl: { rejectUnauthorized: false, secureProtocol: "SSLv2_method" }
    });
    conn.connect(err => {
      if (err) {
        assert.isTrue(err.message.includes("SSLv2 methods disabled"));
        done();
      } else {
        done(new Error("Must have thrown an exception !"));
      }
    });
  });

  it("TLSv1 working", function(done) {
    if (!sslEnable) this.skip();
    const conn = base.createConnection({
      ssl: { rejectUnauthorized: false, secureProtocol: "TLSv1_method" }
    });
    conn.connect(err => {
      if (err) {
        done(err);
      } else {
        checkProtocol(conn, "TLSv1");
        conn.end();
        done();
      }
    });
  });

  it("TLSv1.1 working", function(done) {
    if (!sslEnable) this.skip();
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 10)) this.skip();
    const conn = base.createConnection({
      ssl: { rejectUnauthorized: false, secureProtocol: "TLSv1_1_method" }
    });
    conn.connect(err => {
      if (err) {
        done(err);
      } else {
        checkProtocol(conn, "TLSv1.1");
        conn.end();
        done();
      }
    });
  });

  it("TLSv1.1 with permit cipher", function(done) {
    if (!sslEnable) this.skip();
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 10)) this.skip();
    const conn = base.createConnection({
      ssl: {
        rejectUnauthorized: false,
        secureProtocol: "TLSv1_1_method",
        ciphers:
          "DHE-RSA-AES256-SHA:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256"
      }
    });
    conn.connect(err => {
      if (err) {
        done(err);
      } else {
        checkProtocol(conn, "TLSv1.1");
        conn.end();
        done();
      }
    });
  });

  it("TLSv1.1 no common cipher", function(done) {
    if (!sslEnable) this.skip();
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 10)) this.skip();
    const conn = base.createConnection({
      ssl: {
        rejectUnauthorized: false,
        secureProtocol: "TLSv1_1_method",
        ciphers: "ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256"
      }
    });
    conn.connect(err => {
      if (err) {
        assert.isTrue(err.message.includes("no ciphers available"));
        done();
      } else {
        done(new Error("Must have thrown an exception !"));
      }
    });
  });

  it("TLSv1.1 wrong cipher", function(done) {
    if (!sslEnable) this.skip();
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 10)) this.skip();
    const conn = base.createConnection({
      ssl: {
        rejectUnauthorized: false,
        secureProtocol: "TLSv1_1_method",
        ciphers: "ECDHE-ECDSA-AES256-STRANGE"
      }
    });
    conn.connect(err => {
      if (err) {
        assert.isTrue(err.message.includes("no ciphers available"));
        done();
      } else {
        done(new Error("Must have thrown an exception !"));
      }
    });
  });

  it("TLSv1.2 working", function(done) {
    if (!sslEnable) this.skip();
    //MariaDB server doesn't permit TLSv1.2 on windows
    //MySQL community version doesn't support TLSv1.2
    const isWin = process.platform === "win32";
    if (isWin || !shareConn.isMariaDB()) this.skip();

    const conn = base.createConnection({
      ssl: { rejectUnauthorized: false, secureProtocol: "TLSv1_2_method" }
    });
    conn.connect(err => {
      if (err) {
        done(err);
      } else {
        checkProtocol(conn, "TLSv1.2");
        conn.end();
        done();
      }
    });
  });

  it("TLSv1.2 with cipher working", function(done) {
    if (!sslEnable) this.skip();
    //MariaDB server doesn't permit TLSv1.2 on windows
    //MySQL community version doesn't support TLSv1.2
    const isWin = process.platform === "win32";
    if (isWin || !shareConn.isMariaDB()) this.skip();

    const conn = base.createConnection({
      ssl: {
        rejectUnauthorized: false,
        secureProtocol: "TLSv1_2_method",
        ciphers:
          "ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256"
      }
    });
    conn.connect(err => {
      if (err) {
        done(err);
      } else {
        checkProtocol(conn, "TLSv1.2");
        conn.end();
        done();
      }
    });
  });

  it("CA provided ignoring name verification", function(done) {
    if (!sslEnable) this.skip();
    if (!ca) this.skip();
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 10)) this.skip();
    if (Conf.baseConfig.host !== "localhost") this.skip();

    const conn = base.createConnection({
      ssl: {
        ca: ca,
        checkServerIdentity: (servername, cert) => {
          return;
        }
      }
    });
    conn.connect(err => {
      if (err) {
        done(err);
      } else {
        conn.end();
        done();
      }
    });
  });

  it("CA name verification error", function(done) {
    if (!sslEnable) this.skip();
    if (!ca) this.skip();
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 10)) this.skip();
    if (Conf.baseConfig.host !== "localhost") this.skip();

    const conn = base.createConnection({ host: "127.0.0.1", ssl: { ca: ca } });
    conn.connect(err => {
      if (err) {
        assert.isTrue(
          err.message.includes(
            "Hostname/IP doesn't match certificate's altnames: \"IP: 127.0.0.1 is not in the cert's list"
          )
        );
        done();
      } else {
        done(new Error("Must have thrown an exception !"));
      }
    });
  });

  it("CA provided with matching cn", function(done) {
    if (!sslEnable) this.skip();
    if (!ca) this.skip();
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 10)) this.skip();

    const conn = base.createConnection({ host: "mariadb.example.com", ssl: { ca: ca } });
    conn.connect(err => {
      if (err) {
        done(err);
      } else {
        const isWin = process.platform === "win32";
        let expectedProtocol = "TLSv1.2";
        if (shareConn.isMariaDB()) {
          if (isWin) expectedProtocol = "TLSv1.1";
        } else if (!shareConn.hasMinVersion(8, 0, 0)) {
          expectedProtocol = "TLSv1.1";
        }
        checkProtocol(conn, expectedProtocol);
        conn.end();
        done();
      }
    });
  });

  it("Mutual authentication without providing client certificate", function(done) {
    if (!sslEnable) this.skip();
    if (!ca) this.skip();

    const conn = base.createConnection({
      user: "X509testUser",
      password: null,
      host: "mariadb.example.com",
      ssl: { ca: ca }
    });
    conn.connect(err => {
      if (err) {
        done();
      } else {
        done(new Error("Must have thrown an exception !"));
      }
    });
  });

  it("Mutual authentication providing client certificate", function(done) {
    if (!sslEnable) this.skip();
    if (!ca) this.skip();

    const clientKeyFileName =
      process.env.TEST_SSL_CLIENT_KEY_FILE || __dirname + "/../certificats/client.key";
    const clientCertFileName =
      process.env.TEST_SSL_CLIENT_CERT_FILE || __dirname + "/../certificats/client.crt";
    const clientKey = [fs.readFileSync(clientKeyFileName, "utf8")];
    const clientCert = [fs.readFileSync(clientCertFileName, "utf8")];

    const conn = base.createConnection({
      user: "X509testUser",
      password: null,
      host: "mariadb.example.com",
      ssl: {
        ca: ca,
        cert: clientCert,
        key: clientKey
      }
    });

    conn.connect(err => {
      if (err) {
        done(err);
      } else {
        conn.end();
        done();
      }
    });
  });

  it("Mutual authentication providing client keystore", function(done) {
    if (!sslEnable) this.skip();
    if (!ca) this.skip();

    const clientKeystoreFileName =
      process.env.TEST_SSL_CLIENT_KEYSTORE_FILE ||
      __dirname + "/../certificats/client-keystore.p12";
    const clientKeystore = fs.readFileSync(clientKeystoreFileName);

    const conn = base.createConnection({
      user: "X509testUser",
      password: null,
      host: "mariadb.example.com",
      ssl: {
        ca: ca,
        pfx: clientKeystore,
        passphrase: "kspass"
      }
    });

    conn.connect(err => {
      if (err) {
        done(err);
      } else {
        conn.end();
        done();
      }
    });
  });
});

function checkProtocol(conn, protocol) {
  const ver = process.version.substring(1).split(".");
  if (ver[0] > 5 || (ver[0] === 5 && ver[1] === 7)) {
    assert.equal(conn._socket.getProtocol(), protocol);
  }
}
