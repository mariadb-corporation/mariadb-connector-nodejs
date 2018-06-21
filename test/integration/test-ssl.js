"use strict";

const base = require("../base.js");
const { assert } = require("chai");
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

    shareConn.query("DROP USER 'sslTestUser'@'%'").catch(err => {});
    shareConn.query("DROP USER 'X509testUser'@'%'").catch(err => {});

    shareConn
      .query(
        "CREATE USER 'sslTestUser'@'%'" +
          ((shareConn.isMariaDB() && shareConn.hasMinVersion(10, 2, 0)) ||
          (!shareConn.isMariaDB() && shareConn.hasMinVersion(5, 7, 0))
            ? " REQUIRE SSL"
            : "")
      )
      .then(() => {
        return shareConn.query(
          "GRANT ALL PRIVILEGES ON *.* TO 'sslTestUser'@'%' " +
            ((shareConn.isMariaDB() && !shareConn.hasMinVersion(10, 2, 0)) ||
            (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 0))
              ? " REQUIRE SSL"
              : "")
        );
      })
      .then(() => {
        return shareConn.query(
          "CREATE USER 'X509testUser'@'%'" +
            ((shareConn.isMariaDB() && shareConn.hasMinVersion(10, 2, 0)) ||
            (!shareConn.isMariaDB() && shareConn.hasMinVersion(5, 7, 0))
              ? " REQUIRE X509"
              : "")
        );
      })
      .then(() => {
        return shareConn.query(
          "GRANT ALL PRIVILEGES ON *.* TO 'X509testUser'@'%'" +
            ((shareConn.isMariaDB() && !shareConn.hasMinVersion(10, 2, 0)) ||
            (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 0))
              ? " REQUIRE X509"
              : "")
        );
      })
      .then(() => {
        return shareConn.query("SET PASSWORD FOR 'sslTestUser'@'%' = PASSWORD('myPwd')");
      })
      .then(() => {
        return shareConn.query("SHOW VARIABLES LIKE 'have_ssl'");
      })
      .then(rows => {
        if (rows[0].Value === "YES") {
          sslEnable = true;
          done();
        } else {
          //ssl is not enable on database, skipping test.
          shareConn
            .query("SHOW VARIABLES LIKE 'ssl'")
            .then(rows => {
              console.log("ssl is not enable on database, skipping test :");
              for (let i = 0; i < rows.length; i++) {
                console.log(rows[0]["Variable_name"] + " = " + rows[0]["Value"]);
              }
              done();
            })
            .catch(done);
        }
      })
      .catch(done);
  });

  after(function(done) {
    shareConn
      .query("DROP USER 'sslTestUser'@'%'")
      .then(() => {
        return shareConn.query("DROP USER 'X509testUser'@'%'");
      })
      .then(() => {
        done();
      })
      .catch(done);
  });

  it("signed certificate error ", function(done) {
    if (!sslEnable) this.skip();
    base
      .createConnection({ user: "sslTestUser", password: "myPwd", ssl: true })
      .then(() => {
        done(new Error("Must have thrown an exception !"));
      })
      .catch(err => {
        assert(err.message.includes("self signed certificate"));
        done();
      });
  });

  it("signed certificate forcing", function(done) {
    if (!sslEnable) this.skip();
    base
      .createConnection({ ssl: { rejectUnauthorized: false }})
      .then(conn => {
        conn.end();
        done();
      })
      .catch(done);
  });

  it("ensure connection use SSL ", function(done) {
    if (!sslEnable) this.skip();
    base
      .createConnection({
        user: "sslTestUser",
        password: "myPwd",
        ssl: { rejectUnauthorized: false }
      })
      .then(conn => {
        conn.end();
        done();
      })
      .catch(done);
  });

  it("SSLv3 disable", function(done) {
    if (!sslEnable) this.skip();
    base
      .createConnection({
        ssl: { rejectUnauthorized: false, secureProtocol: "SSLv3_client_method" }
      })
      .then(() => {
        done(new Error("Must have thrown an exception !"));
      })
      .catch(err => {
        assert(err.message.includes("SSLv3 methods disabled"));
        done();
      });
  });

  it("SSLv2 disable", function(done) {
    if (!sslEnable) this.skip();
    base
      .createConnection({
        ssl: { rejectUnauthorized: false, secureProtocol: "SSLv2_method" }
      })
      .then(() => {
        done(new Error("Must have thrown an exception !"));
      })
      .catch(err => {
        assert(err.message.includes("SSLv2 methods disabled"));
        done();
      });
  });

  it("TLSv1 working", function(done) {
    if (!sslEnable) this.skip();
    base
      .createConnection({
        ssl: { rejectUnauthorized: false, secureProtocol: "TLSv1_method" }
      })
      .then(conn => {
        checkProtocol(conn, "TLSv1");
        conn.end();
        done();
      })
      .catch(done);
  });

  it("TLSv1.1 working", function(done) {
    if (!sslEnable) this.skip();
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 10)) this.skip();
    base
      .createConnection({
        ssl: { rejectUnauthorized: false, secureProtocol: "TLSv1_1_method" }
      })
      .then(conn => {
        checkProtocol(conn, "TLSv1.1");
        conn.end();
        done();
      })
      .catch(done);
  });

  it("TLSv1.1 with permit cipher", function(done) {
    if (!sslEnable) this.skip();
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 10)) this.skip();
    base
      .createConnection({
        ssl: {
          rejectUnauthorized: false,
          secureProtocol: "TLSv1_1_method",
          ciphers:
            "DHE-RSA-AES256-SHA:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256"
        }
      })
      .then(conn => {
        checkProtocol(conn, "TLSv1.1");
        conn.end();
        done();
      })
      .catch(done);
  });

  it("TLSv1.1 no common cipher", function(done) {
    if (!sslEnable) this.skip();
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 10)) this.skip();
    base
      .createConnection({
        ssl: {
          rejectUnauthorized: false,
          secureProtocol: "TLSv1_1_method",
          ciphers: "ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256"
        }
      })
      .then(() => {
        done(new Error("Must have thrown an exception !"));
      })
      .catch(err => {
        assert(err.message.includes("no ciphers available"));
        done();
      });
  });

  it("TLSv1.1 wrong cipher", function(done) {
    if (!sslEnable) this.skip();
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 10)) this.skip();
    base
      .createConnection({
        ssl: {
          rejectUnauthorized: false,
          secureProtocol: "TLSv1_1_method",
          ciphers: "ECDHE-ECDSA-AES256-STRANGE"
        }
      })
      .then(() => {
        done(new Error("Must have thrown an exception !"));
      })
      .catch(err => {
        assert(err.message.includes("no ciphers available"));
        done();
      });
  });

  it("TLSv1.2 working", function(done) {
    if (!sslEnable) this.skip();
    //MariaDB server doesn't permit TLSv1.2 on windows
    //MySQL community version doesn't support TLSv1.2
    const isWin = process.platform === "win32";
    if (isWin || !shareConn.isMariaDB()) this.skip();

    base
      .createConnection({
        ssl: { rejectUnauthorized: false, secureProtocol: "TLSv1_2_method" }
      })
      .then(conn => {
        checkProtocol(conn, "TLSv1.2");
        conn.end();
        done();
      })
      .catch(done);
  });

  it("TLSv1.2 with cipher working", function(done) {
    if (!sslEnable) this.skip();
    //MariaDB server doesn't permit TLSv1.2 on windows
    //MySQL community version doesn't support TLSv1.2
    const isWin = process.platform === "win32";
    if (isWin || !shareConn.isMariaDB()) this.skip();

    base
      .createConnection({
        ssl: {
          rejectUnauthorized: false,
          secureProtocol: "TLSv1_2_method",
          ciphers:
            "ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256"
        }
      })
      .then(conn => {
        checkProtocol(conn, "TLSv1.2");
        conn.end();
        done();
      })
      .catch(done);
  });

  it("CA provided ignoring name verification", function(done) {
    if (!sslEnable) this.skip();
    if (!ca) this.skip();
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 10)) this.skip();
    if (Conf.baseConfig.host !== "localhost") this.skip();

    base
      .createConnection({
        ssl: {
          ca: ca,
          checkServerIdentity: (servername, cert) => {
            return;
          }
        }
      })
      .then(conn => {
        conn.end();
        done();
      })
      .catch(done);
  });

  it("CA name verification error", function(done) {
    if (!sslEnable) this.skip();
    if (!ca) this.skip();
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 10)) this.skip();
    if (Conf.baseConfig.host !== "localhost") this.skip();

    base
      .createConnection({ host: "127.0.0.1", ssl: { ca: ca } })
      .then(() => {
        done(new Error("Must have thrown an exception !"));
      })
      .catch(err => {
        assert(
          err.message.includes(
            "Hostname/IP doesn't match certificate's altnames: \"IP: 127.0.0.1 is not in the cert's list"
          )
        );
        done();
      });
  });

  it("CA provided with matching cn", function(done) {
    if (!sslEnable) this.skip();
    if (!ca) this.skip();
    if (!shareConn.isMariaDB() && !shareConn.hasMinVersion(5, 7, 10)) this.skip();

    base
      .createConnection({ host: "mariadb.example.com", ssl: { ca: ca } })
      .then(conn => {
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
      })
      .catch(done);
  });

  it("Mutual authentication without providing client certificate", function(done) {
    if (!sslEnable) this.skip();
    if (!ca) this.skip();

    base
      .createConnection({
        user: "X509testUser",
        password: null,
        host: "mariadb.example.com",
        ssl: { ca: ca }
      })
      .then(() => {
        done(new Error("Must have thrown an exception !"));
      })
      .catch(err => {
        done();
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

    base
      .createConnection({
        user: "X509testUser",
        password: null,
        host: "mariadb.example.com",
        ssl: {
          ca: ca,
          cert: clientCert,
          key: clientKey
        }
      })
      .then(conn => {
        conn.end();
        done();
      })
      .catch(done);
  });

  it("Mutual authentication providing client keystore", function(done) {
    if (!sslEnable) this.skip();
    if (!ca) this.skip();

    const clientKeystoreFileName =
      process.env.TEST_SSL_CLIENT_KEYSTORE_FILE ||
      __dirname + "/../certificats/client-keystore.p12";
    const clientKeystore = fs.readFileSync(clientKeystoreFileName);

    base
      .createConnection({
        user: "X509testUser",
        password: null,
        host: "mariadb.example.com",
        ssl: {
          ca: ca,
          pfx: clientKeystore,
          passphrase: "kspass"
        }
      })
      .then(conn => {
        conn.end();
        done();
      })
      .catch(done);
  });

  it("ssl change user", function(done) {
    if (!shareConn.isMariaDB()) this.skip();
    if (!sslEnable) this.skip();
    let currUser;
    let conn;
    base
      .createConnection({ ssl: { rejectUnauthorized: false } })
      .then(con => {
        conn = con;
        conn.query("CREATE USER ChangeUser@'%' IDENTIFIED BY 'mypassword'");
        conn.query("GRANT ALL PRIVILEGES ON *.* TO ChangeUser@'%' with grant option");
        return conn.query("FLUSH PRIVILEGES");
      })
      .then(() => {
        conn
          .query("SELECT CURRENT_USER")
          .then(res => {
            currUser = res[0]["CURRENT_USER"];
            return conn.changeUser({
              user: "ChangeUser",
              password: "mypassword",
              connectAttributes: { par1: "bouh", par2: "bla" }
            });
          })
          .then(() => {
            return conn.query("SELECT CURRENT_USER");
          })
          .then(res => {
            const user = res[0]["CURRENT_USER"];
            assert.equal(user, "ChangeUser@%");
            assert(user !== currUser);
            conn.query("DROP USER ChangeUser@'%'");
            conn.end();
            done();
          })
          .catch(done);
      })
      .catch(done);
  });
});

function checkProtocol(conn, protocol) {
  const ver = process.version.substring(1).split(".");
  if (ver[0] > 5 || (ver[0] === 5 && ver[1] === 7)) {
    assert.equal(conn.__tests.getSocket().getProtocol(), protocol);
  }
}
