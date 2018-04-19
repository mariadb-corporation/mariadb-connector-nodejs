# Using SSL 

This document explains how to configure the MariaDB driver to support TLS/SSL.
Data can be encrypted during transfer using the Transport Layer Security (TLS) protocol. TLS/SSL permits transfer encryption, and optionally server and client identity validation.
 
>The term SSL (Secure Sockets Layer) is often used interchangeably with TLS, although strictly-speaking the SSL protocol is the predecessor of TLS, and is not implemented as it is now considered insecure.

## SSL authentication type

There is different kind of SSL authentication : 

One-way SSL authentication is that the client will verifies the certificate of the server. 
This will permit to encrypt all exhanges, and make sure that it is the expected server, i.e. no man in the middle attack.

Two-way SSL authentication (= mutual authentication, = client authentication) is if the server also verifies the certificate of the client. 
Client will also have a dedicated certificate.


#### Server configuration
To ensure that SSL is correctly configured on the server, the query `SELECT @@have_ssl;` must return YES. 
If not, please refer to the [server documentation](https://mariadb.com/kb/en/library/secure-connections/).

#### User configuration recommendation

Enabling the option ssl, driver will use One-way SSL authentication, but an additional step is recommended :
 
To ensure the type of authentication the user used for authentication must be set accordingly with "REQUIRE SSL" for One-way SSL authentication or "REQUIRE X509" for Two-way SSL authentication. 
See [CREATE USER](https://mariadb.com/kb/en/library/create-user/) for more details.

Example;
```sql
CREATE USER 'myUser'@'%' IDENTIFIED BY 'MyPwd';
GRANT ALL ON db_name.* TO 'myUser'@'%' REQUIRE SSL;
```
Setting `REQUIRE SSL` will ensure that if option ssl isn't enable on connector, connection will be rejected. 


## Configuration
* `ssl`: boolean/JSON object. 

JSON object: 
* `checkServerIdentity(servername, cert)` *Function* replace SNI default function
* `minDHSize` *number* Minimum size of the DH parameter in bits to accept a TLS connection. Defaults to 1024.
* `pfx` *string* | *string[]* | *Buffer* | *Buffer[]* | *Object[]* Optional PFX or PKCS12 encoded private key and certificate chain. Encrypted PFX will be decrypted with `passphrase` if provided.
* `key` *string* | *string[]* | *Buffer* | *Buffer[]* | *Object[]* Optional private keys in PEM format. Encrypted keys will be decrypted with `passphrase` if provided.
* `passphrase` *string* Optional shared passphrase used for a single private key and/or a PFX.
* `cert` *string* | *string[]* | *Buffer* | *Buffer[]* Optional cert chains in PEM format. One cert chain should be provided per private key. 
* `ca` *string* | *string[]* | *Buffer* | *Buffer[]* Optionally override the trusted CA certificates. Default is to trust the well-known CAs curated by Mozilla. For self-signed certificates, the certificate is its own CA, and must be provided.
* `ciphers` *string* Optional cipher suite specification, replacing the default. 
* `honorCipherOrder` *boolean* Attempt to use the server's cipher suite preferences instead of the client's.
* `ecdhCurve` *string* A string describing a named curve or a colon separated list of curve NIDs or names, for example P-521:P-384:P-256, to use for ECDH key agreement, or false to disable ECDH. Set to auto to select the curve automatically. Defaults to tls.DEFAULT_ECDH_CURVE. 
* `clientCertEngine` *string* Optional name of an OpenSSL engine which can provide the client certificate.
* `crl` *string* | *string[]* | *Buffer* | *Buffer[]* Optional PEM formatted CRLs (Certificate Revocation Lists).
* `dhparam` *string* | *Buffer* Diffie Hellman parameters, required for Perfect Forward Secrecy. 
* `secureOptions` *number* Optionally affect the OpenSSL protocol behavior, which is not usually necessary.
* `secureProtocol` *string* Optional SSL method to use, default is "SSLv23_method".

Connector rely on Node.js TLS implementation. See [Node.js TLS API](https://nodejs.org/api/tls.html#tls_tls_connect_options_callback) for more detail


### Certificate validation

#### Trusted CA
Node.js trust by default well-known root CAs based on Mozilla including free Let's Encrypt certificate authority (see [list](https://ccadb-public.secure.force.com/mozilla/IncludedCACertificateReport) ).
If the server certificate is signed using a certificate chain using a root CA known in node.js, only needed configuration is enabling option ssl.

#### Certificate chain validation
Certificate chain is a list of certificates that are related to each other because they were issued within the same CA hierarchy. 
In order for any certificate to be validated, all of the certificates in its chain have to be validated.

If intermediate/root certificate are not trusted by connector, connection will issue an error. 

Certificate can be provided to driver with  

#### Hostname verification (SNI)
  hostname verification is done by default be done against the certificate’s subjectAlternativeName’s dNS name field. 

### One-way SSL authentication

If the server certificate is signed using a certificate chain using a root CA known in java default truststore, no additional step is required, but setting `ssl` option

Example : 
```javascript
    const mariadb = require('mariadb');
    const conn = mariadb.createConnection({
      host: 'myHost.com', 
      ssl: true, 
      user: 'myUser', 
      password:'MyPwd', 
      database:'db_name'
    });
```

If server use a selft signed certificate or use intermediate certificates, there is 2 differents possibiliy : 
* indicate connector to trust all certificates using option `rejectUnauthorized` *(NOT TO USE IN PRODUCTION)*
    
```javascript
    const conn = mariadb.createConnection({
      host: 'myHost.com', 
      ssl: {
        rejectUnauthorized: false
      }, 
      user: 'myUser', 
      password:'MyPwd', 
      database:'db_name'});
```
* provide the certificate chain to driver
```javascript
    const fs = require("fs");
    const mariadb = require('mariadb');

   //reading certificates from file
    const serverCert = [fs.readFileSync("server.pem", "utf8")];

   //connecting
    const conn = base.createConnection({ 
      user:"myUser", 
      host: "myHost.com",
      ssl: {
        ca: serverCert,
      }
    });
```
#### Force use of specific TLS protocol / ciphers

A specific TLS protocol can be forced using option `secureProtocol`, and cipher using `ciphers`.

Example:
```javascript
   //connecting
    const conn = base.createConnection({ 
      user:"myUser", 
      host: "myHost.com",
      ssl: {
        ca: serverCert,
        secureProtocol: "TLSv1_2_method",
        ciphers:
          "ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256"        
      }
    });
```

See [possible protocol] (https://www.openssl.org/docs/man1.0.2/ssl/ssl.html#DEALING-WITH-PROTOCOL-METHODS) values.
 
 
## Two-way SSL authentication

Mutual SSL authentication or certificate based mutual authentication refers to two parties authenticating each other through verifying the provided digital certificate so that both parties are assured of the others' identity.
To enable mutual authentication, the user must be created with `REQUIRE X509` so the server asks the driver for client certificates. 

**If the user is not set with `REQUIRE X509`, only one way authentication will be done**

The client (driver) must then have its own certificate too (and related private key). 
If the driver doesn't provide a certificate, and the user used to connect is defined with `REQUIRE X509`, 
the server will then return a basic "Access denied for user". 
Check how the user is defined with `select SSL_TYPE, SSL_CIPHER, X509_ISSUER, X509_SUBJECT FROM mysql.user u where u.User = 'myUser'`.

Example:
```sql
    CREATE USER 'X509testUser'@'%';
    GRANT ALL PRIVILEGES ON *.* TO 'X509testUser'@'%' REQUIRE X509;
```

```javascript
    const fs = require("fs");
    const mariadb = require('mariadb');

   //reading certificates from file
    const serverCert = [fs.readFileSync("server.pem", "utf8")];
    const clientKey = [fs.readFileSync("client.key", "utf8")];
    const clientCert = [fs.readFileSync("client.pem", "utf8")];

   //connecting
    const conn = base.createConnection({ 
      user:"X509testUser", 
      host: "mariadb.example.com",
      ssl: {
        ca: serverCert,
        cert: clientCert,
        key: clientKey
      }
    });
```

#### Using keystore

Keystore permit storing private key and certificate chain encrypted with a password in a file. 

Generating an encrypted keystore in PKCS12 format  :
```
  # generate a keystore with the client cert & key
  openssl pkcs12 \
    -export \
    -in "${clientCertFile}" \
    -inkey "${clientKeyFile}" \
    -out "${keystoreFile}" \
    -name "mariadbAlias" \
    -passout pass:kspass
```    

```javascript
    const fs = require("fs");
    const mariadb = require('mariadb');

   //reading certificates from file (keystore must be read as binary)
    const serverCert = [fs.readFileSync("server.pem", "utf8")];
    const clientKeystore = [fs.readFileSync("keystore.p12")];
    
   //connecting
    const conn = base.createConnection({ 
      user:"X509testUser", 
      host: "mariadb.example.com",
      ssl: {
        ca: serverCert,
        pfx: clientKeystore,
        passphrase: "kspass"
      }
    });
```




