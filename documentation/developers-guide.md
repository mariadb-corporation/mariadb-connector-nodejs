
# Contributing

Each pull request should address a single issue, and contain both the fix as well as a description of how the pull request and tests that validate that the PR fixes the issue in question.

For significant feature additions, we like to have an open issue in [[https://mariadb.atlassian.net/secure/RapidBoard.jspa?projectKey=CONJS|MariaDB JIRA]]. It is expected that discussion will have taken place in the attached issue.

# Fork source

Before downloading source, fork the project to your own repository, and use your repository as source.  


# Run local test

Before any submission :
Run the test locally : by default, you need to have a MySQL/MariaDB server on localhost:3306 with a database named "testn" and a user root without password.
so you can run 
    
```script
    npm run test:base
```
    
You can change those parameter by setting environment variables :
* `TEST_HOST` for hostname (default: 'localhost')
* `TEST_PASSWORD` for password (default: null)
* `TEST_DB` for default database (default: 'testn')
* `TEST_PORT` for port (default: 3306)
 
    
You can launch a specific test using :

{{{
    node.exe .\node_modules\mocha\bin\_mocha .\test\integration\test.js 
}}}
    
= Run CI test
    
Testing configuration is set for [appveyor](https://www.appveyor.com/) and [travis](https://www.travis-ci.org/).    
You have to enable your travis/appveyor to validate your fork. 
The advantage compared to running test locally is that it will launch tests for different version of node.js and MariaDB/MySQL servers. 

For that, you have to go on [[https://travis-ci.org|travis website]], connect with your github account, and activate your mariadb-connector-nodejs repository.
After this step, every push to your repository will launch a travis test. 

## Submitting a request

When your repository has the correction/change done, you can submit a pull request by clicking the "Pull request" button on github. 
Please detail the operation done in your request. 

## License

Distributed under the terms of the GNU Library or "Lesser" General Public License (LGPL).

