
# Contribution 

Developers interested in contributing to the MariaDB Node.js Connector can do so through GitHub.  Each pull request should address a single issue, and contain both the fix as well as a description of how the changes work and tests to validate that the pull request fixes the issue in question. 

In the event that you would like to contribute to the development a significant feature, we like to have an open issue on the [MariaDB JIRA](https://jira.mariadb.org/projects/CONJS).  Discussions of the issue will take place on the JIRA ticket.

## Development 

Rather than downloading the source code for the Connector directly from GitHub or cloning this repository, instead fork the project onto your own account.  Then send pull requests from your fork.

### Testing

Before submitting a pull request to the project, run local and continuous integration testing.  This ensures that your patch works and can be accepted without breaking the Connector.

#### Running Local Tests

The repository contains a series of tests to evaluate the Connector and to make sure it can connect to and operate on MariaDB with the new code.  Run local tests using npm. 

In order for these tests to pass, you need to have a MariaDB or MySQL server installed, which by default it assumes is running at localhost:3306 with a database named `testn` and a user `root` without a password.
Alternatively you will need to create a user [with grant privilege](https://mariadb.com/kb/en/grant/#the-grant-option-privilege).
Example, with `root` user create the new user and grant privileges:
```
MariaDB [(none)]> create user anel@localhost identified by ('testpass');
MariaDB [(none)]> grant all privileges on *.* to anel@localhost WITH GRANT OPTION;
```
Once this is set up, you can run the tests with npm:
 
```
$ npm run test:base
```
Or via environment variables with specific user:
```
$ TEST_DB=testn TEST_USER=anel TEST_PASSWORD=testpass TEST_PORT=3306 TEST_HOST=localhost npm run test:base
```
The tests retrieve the host, password, database and port number from environmental variables, which you can manually set if you want to connect to MariaDB in other ways.
 
* `TEST_HOST` Hostname.  By default, localhost.
* `TEST_PASSWORD` Password for `root`.  Null by default.
* `TEST_DB` Database to run tests on.  Defaults to `testn`.
* `TEST_PORT` Port to connect to. 3306 by default. 
 

On Windows, you can launch specific tests by calling them.  For instance,

```
node.exe .\node_modules\mocha\bin\_mocha .\test\integration\test.js 
```

Or, you can run the entire test suite:

```
npm test 
```

#### Running CI test

Continuous Integration testing for the Connector is set for [appveyor](https://www.appveyor.com/) and [travis](https://www.travis-ci.org/).   You can test your own code using either, provided you configure them to validate your fork, rather than the project repository. 

The advantage of CI tools over running tests locally is that it launches tests for different versions of Node.js and different versions of MariaDB and MySQL servers.  This to ensure that your patch will work across other builds, in addition to the one you have on your local system. 

In order to do that, go to [Travis CI](https://travis-ci.org), connect your GitHub account and active your fork of the MariaDB Connector repository.  Once this is done, Travis runs tests against every push you make to your repository on GitHub. 


#### Coverage test

To ensure coverage of new code is well tested, you can run coverage tests.

```
npm install nyc -g 
nyc npm test
```

results will be : 

```
  ... will run tests
  
  263 passing (50s)
  9 pending

-------------------------------------------------|----------|----------|----------|----------|-------------------|
File                                             |  % Stmts | % Branch |  % Funcs |  % Lines | Uncovered Line #s |
-------------------------------------------------|----------|----------|----------|----------|-------------------|
All files                                        |    95.71 |    84.26 |    90.38 |    95.88 |                   |
 mariadb-connector-nodejs                        |      100 |      100 |      100 |      100 |                   |
  callback.js                                    |      100 |      100 |      100 |      100 |                   |
  promise.js                                     |      100 |      100 |      100 |      100 |                   |
 mariadb-connector-nodejs/lib                    |    93.82 |    82.38 |    88.33 |    93.92 |                   |
  connection-callback.js                         |      100 |    96.97 |      100 |      100 |                77 |
  connection.js                                  |    94.13 |    79.33 |    90.28 |    94.13 |... 42,644,645,663 |
...                                              |          |          |          |          |                   | 
 mariadb-connector-nodejs/lib/misc               |      100 |    97.91 |      100 |      100 |                   |
  connection-information.js                      |      100 |      100 |      100 |      100 |                   |
  errors.js                                      |      100 |    81.82 |      100 |      100 |        9,11,13,22 |
  parse.js                                       |      100 |      100 |      100 |      100 |                   |
  utils.js                                       |      100 |      100 |      100 |      100 |                   |
-------------------------------------------------|----------|----------|----------|----------|-------------------|


### Submitting Pull Requests

When you feel your patch is ready, has the corrections and changes that you want done, you can submit a pull request to the project by clicking the **Pull request** button GitHub.

Please detail what the pull request does in your request.

# License

Distributed under the terms of the GNU Library or "Lesser" General Public License (LGPL).

