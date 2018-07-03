# Connection options 

- [Essential options](#essential-option)
- [Support for big integer](#support-for-big-integer)
- [Ssl](#ssl)
  - [Configuration](#configuration)
  - [Certificate validation](#certificate-validation)
  - [One-way SSL authentication](#one-way-ssl-authentication)
  - [Two-way SSL authentication](#two-way-ssl-authentication)
- [Other options](#other-options)
- [F.A.Q.](#faq)

# Essential options 

| option| description| type| default| 
| ---: | --- | :---: | :---: | 
| **user** | user to access database |*string* | 
| **password** | user password |*string* | 
| **host** | IP or DNS of database server. *Not used when using option `socketPath`*|*string*| "localhost"|  
| **port** | database server port number|*integer*| 3306|
| **database** | default database when establishing connection| *string* | 
| **socketPath** | Permits connecting to the database via Unix domain socket or named pipe, if the server allows it|  *string* |  
| **compress** | the exchanges with database will be gzipped. That permit better performance when database is distant (not in same location)|*boolean*| false|  
| **connectTimeout** | connection timeout in ms|*integer* | 10 000|
| **socketTimeout** | socket timeout in ms after connection succeed|*integer* | 0|
| **rowsAsArray** | return resultset as array, not JSON. Faster way to get results. See Query for detail information|*boolean* | false|


# Support for big integer 

Javascript integer use IEEE-754 representation, meaning that integer not in ±9,007,199,254,740,991 range cannot be exactly represented.
MariaDB/MySQL server have data type that permit bigger integer. 
 
For those integer that are not in [safe](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/isSafeInteger) range default implementation will return an integer that may be not the exact representation. 
2 options permit to have the exact value :          

|option|description|type|default| 
|---:|---|:---:|:---:| 
| **bigNumberStrings** | if integer is not in "safe" range, the value will be return as a string  |*boolean* |false| 
| **supportBigNumbers** | if integer is not in "safe" range, the value will be return as a [Long](https://www.npmjs.com/package/long) object |*boolean* |false|


# Ssl

Data can be encrypted during transfer using the Transport Layer Security (TLS) protocol. TLS/SSL permits transfer encryption, and optionally server and client identity validation.
 
>The term SSL (Secure Sockets Layer) is often used interchangeably with TLS, although strictly-speaking the SSL protocol is the predecessor of TLS, and is not implemented as it is now considered insecure.

There is different kind of SSL authentication : 

One-way SSL authentication is that the client will verifies the certificate of the server. 
This will permit to encrypt all exhanges, and make sure that it is the expected server, i.e. no man in the middle attack.

Two-way SSL authentication (= mutual authentication, = client authentication) is if the server also verifies the certificate of the client. 
Client will also have a dedicated certificate.


### Server configuration
To ensure that SSL is correctly configured on the server, the query `SELECT @@have_ssl;` must return YES. 
If not, please refer to the [server documentation](https://mariadb.com/kb/en/library/secure-connections/).

### User configuration recommendation

Enabling the option ssl, driver will use One-way SSL authentication, but an additional step is recommended :
 
To ensure the type of authentication the user used for authentication must be set accordingly with "REQUIRE SSL" for One-way SSL authentication or "REQUIRE X509" for Two-way SSL authentication. 
See [CREATE USER](https://mariadb.com/kb/en/library/create-user/) for more details.

Example:
```sql
CREATE USER 'myUser'@'%' IDENTIFIED BY 'MyPwd';
GRANT ALL ON db_name.* TO 'myUser'@'%' REQUIRE SSL;
```
Setting `REQUIRE SSL` will ensure that if option ssl isn't enable on connector, connection will be rejected. 


## Configuration
* `ssl`: boolean/JSON object. 

JSON object: 

|option|description|type|default| 
|---:|---|:---:|:---:| 
|**checkServerIdentity**| function(servername, cert) to replace SNI default function| *Function*|
|**minDHSize**| Minimum size of the DH parameter in bits to accept a TLS connection | *number*|1024|
|**pfx**| Optional PFX or PKCS12 encoded private key and certificate chain. Encrypted PFX will be decrypted with `passphrase` if provided| *string / string[] / Buffer / Buffer[] / *Object[]*|
|**key**| Optional private keys in PEM format. Encrypted keys will be decrypted with `passphrase` if provided| *string / string[] / *Buffer* / *Buffer[]* / *Object[]*|
|**passphrase**| Optional shared passphrase used for a single private key and/or a PFX| *string*|
|**cert**| Optional cert chains in PEM format. One cert chain should be provided per private key| *string / string[] / Buffer / Buffer[]*|
|**ca**| Optionally override the trusted CA certificates. Default is to trust the well-known CAs curated by Mozilla. For self-signed certificates, the certificate is its own CA, and must be provided| *string / string[] / Buffer / Buffer[]*|
|**ciphers**| Optional cipher suite specification, replacing the default| *string*|
|**honorCipherOrder**| Attempt to use the server's cipher suite preferences instead of the client's| *boolean*|
|**ecdhCurve**| A string describing a named curve or a colon separated list of curve NIDs or names, for example P-521:P-384:P-256, to use for ECDH key agreement, or false to disable ECDH. Set to auto to select the curve automatically| *string*|tls.DEFAULT_ECDH_CURVE|
|**clientCertEngine**| Optional name of an OpenSSL engine which can provide the client certificate| *string*|
|**crl**| Optional PEM formatted CRLs (Certificate Revocation Lists)| *string / string[] / Buffer / Buffer[]*|
|**dhparam**| Diffie Hellman parameters, required for Perfect Forward Secrecy| *string / Buffer*|
|**secureProtocol**| Optional SSL method to use, default is "SSLv23_method" | *string*|

Connector rely on Node.js TLS implementation. See [Node.js TLS API](https://nodejs.org/api/tls.html#tls_tls_connect_options_callback) for more detail


## Certificate validation

### Trusted CA
Node.js trust by default well-known root CAs based on Mozilla: see [list](https://ccadb-public.secure.force.com/mozilla/IncludedCACertificateReport) (including free Let's Encrypt certificate authority).
If the server certificate is signed using a certificate chain using a root CA known in node.js, only needed configuration is enabling option ssl.

### Certificate chain validation
Certificate chain is a list of certificates that are related to each other because they were issued within the same CA hierarchy. 
In order for any certificate to be validated, all of the certificates in its chain have to be validated.

If intermediate/root certificate are not trusted by connector, connection will issue an error. 

Certificate can be provided to driver with  

### Hostname verification (SNI)
  hostname verification is done by default be done against the certificate’s subjectAlternativeName’s dNS name field. 

## One-way SSL authentication

If the server certificate is signed using a certificate chain using a root CA known in java default truststore, no additional step is required, but setting `ssl` option

Example : 
```javascript
   const mariadb = require('mariadb');
   mariadb
     .createConnection({
       host: 'myHost.com', 
       ssl: true, 
       user: 'myUser', 
       password:'MyPwd', 
       database:'db_name'
     }).then(conn => {})
```

If server use a selft signed certificate or use intermediate certificates, there is 2 differents possibiliy : 
* indicate connector to trust all certificates using option `rejectUnauthorized` *(NOT TO USE IN PRODUCTION)*
    
```javascript
   //connecting
   mariadb
     .createConnection({
       host: 'myHost.com', 
       ssl: {
         rejectUnauthorized: false
       }, 
       user: 'myUser', 
       password:'MyPwd', 
     }).then(conn => {})
```
* provide the certificate chain to driver
```javascript
   const fs = require("fs");
   const mariadb = require('mariadb');

   //reading certificates from file
   const serverCert = [fs.readFileSync("server.pem", "utf8")];

   //connecting
   mariadb
     .createConnection({
       user: "myUser",
       host: "myHost.com",
       ssl: {
         ca: serverCert
       }
     }).then(conn => {})
```
### Force use of specific TLS protocol / ciphers

A specific TLS protocol can be forced using option `secureProtocol`, and cipher using `ciphers`.

Example to connect using TLSv1.2 :
```javascript
   //connecting
   mariadb
     .createConnection({ 
       user:"myUser", 
       host: "myHost.com",
       ssl: {
         ca: serverCert,
         secureProtocol: "TLSv1_2_method",
         ciphers:
           "ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256"        
       }
     }).then(conn => {})
```

See [possible protocol](https://www.openssl.org/docs/man1.0.2/ssl/ssl.html#DEALING-WITH-PROTOCOL-METHODS) values.
 
 
## Two-way SSL authentication

Mutual SSL authentication or certificate based mutual authentication refers to two parties authenticating each other through verifying the provided digital certificate so that both parties are assured of the other's identity.
To enable mutual authentication, the user must be created with `REQUIRE X509` so the server asks the driver for client certificates. 

**If the user is not set with `REQUIRE X509`, only one way authentication will be done**

The client (driver) must then have its own certificate too (and related private key). 
If the driver doesn't provide a certificate, and the user used to connect is defined with `REQUIRE X509`, 
the server will then return a basic "Access denied for user". 

It may be interesting to check how the user is defined with `select SSL_TYPE, SSL_CIPHER, X509_ISSUER, X509_SUBJECT FROM mysql.user u where u.User = 'myUser'`because server might required some verification.

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
   mariadb
     .createConnection({ 
       user:"X509testUser", 
       host: "mariadb.example.com",
       ssl: {
         ca: serverCert,
         cert: clientCert,
         key: clientKey
       }
     }).then(conn => {})
```

### Using keystore

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
   const serverCert = fs.readFileSync("server.pem", "utf8");
   const clientKeystore = fs.readFileSync("keystore.p12");
    
   //connecting
   mariadb.createConnection({ 
     user:"X509testUser", 
     host: "mariadb.example.com",
     ssl: {
       ca: serverCert,
       pfx: clientKeystore,
       passphrase: "kspass"
     }
   }).then(conn => {});
```
    
# Other options 

|option|description|type|default| 
|---:|---|:---:|:---:| 
| **charset** | This define the protocol charset used with server. There is very few reason for micro optimization only. you must really know what you are doing |*string* |UTF8MB4_UNICODE_CI| 
| **dateStrings** | indicate if date must be retrieved as string (not as date)  |*boolean* |false| 
| **debug** |  log all exchanges with servers. display in hexa|*boolean* |false| 
| **foundRows** | active, update number correspond to update rows. disable indicate real rows changed | *boolean* |true|
| **multipleStatements** | Permit multi-queries like "insert into ab (i) values (1); insert into ab (i) values (2)". This may be **security risk** in case of sql injection|*boolean* |false|
| **namedPlaceholders** | Permit using named placeholder |*boolean* |false|
| **permitLocalInfile** |permit using LOAD DATA INFILE command.<br/> this (ie: loading a file from the client) may be a security problem :<br/>A "man in the middle" proxy server can change the actual file requested from the server so the client will send a local file to this proxy. if someone can execute a query from the client, he can have access to any file on the client (according to the rights of the user running the client process) |*boolean* |false|
| **timezone** | force using indicated timezone, not current node.js timezone. possible value are 'Z' (fot UTC), 'local' or '±HH:MM' format |*string* |
| **nestTables** | resultset are presented by table to avoid results with colliding fields. more example in query description.  |*boolean* |false|
| **pipelining** | query are send one by one but without waiting the results of previous entry ([detail information](/documentation/pipelining.md))|*boolean* |true|
| **trace** | will add the stack trace at the time of query creation to error stacktrace,  permitting easy identification of the part of code that issue the query. This is not activate by default due because stack creation cost|*boolean* |false|
| **typeCast** | permit casting results type |*function* |
| **connectAttributes** | if true, some information (client name, version, os, node version, ...) will be send to performance schema (see [connection attributes](https://mariadb.com/kb/en/library/performance-schema-session_connect_attrs-table/) ). if set, JSON attributes will be additionally sent to default one |*boolean/json* |false|
| **metaAsArray** | compatibility option so promise return an array object [rows, metadata] and not rows with property meta for compatibility  |*boolean* |false|

## F.A.Q.

#### error Hostname/IP doesn't match certificate's altnames
Client will verify certificate SAN (subject alternatives names) and CN to ensure certificate correspond to the hostname. 
If certificate's SAN /CN does not correspond to the `host` option, you will have an error like : 
```
Hostname/IP doesn't match certificate's altnames: "Host: other.example.com. is not cert's CN: mariadb.example.com"
```
solution : correct `host` value to correspond certificate
