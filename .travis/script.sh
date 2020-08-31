#!/bin/bash

set -x
set -e

###################################################################################################################
# test different type of configuration
###################################################################################################################

if [ -n "$SKYSQL" ] ; then

  if [ -z "$SKYSQL_HOST" ] ; then
    echo "No SkySQL configuration found !"
    exit 0
  else
    export TEST_USER=$SKYSQL_USER
    export TEST_HOST=$SKYSQL_HOST
    export TEST_PASSWORD=$SKYSQL_PASSWORD
    export TEST_PORT=$SKYSQL_PORT
    export TEST_SSL_CA=$SKYSQL_SSL_CA
    export TEST_BULK=false
  fi

else

  if [ "$DB" = "build" ] ; then
    .travis/build/build.sh
    docker build -t build:latest --label build .travis/build/
  fi

  export ENTRYPOINT=$PROJ_PATH/.travis/entrypoint
  if [ -n "$MAXSCALE_VERSION" ] ; then
    ###################################################################################################################
    # launch Maxscale with one server
    ###################################################################################################################
    export COMPOSE_FILE=.travis/maxscale-compose.yml
    export ENTRYPOINT=$PROJ_PATH/.travis/sql
    docker-compose -f ${COMPOSE_FILE} build
    docker-compose -f ${COMPOSE_FILE} up -d
  else
    docker-compose -f .travis/docker-compose.yml up -d
  fi

  if [ -z "$SKIP_LEAK" ] ; then npm install node-memwatch; fi

  node .travis/wait-for-docker-up.js

  if [ -z "$MAXSCALE_VERSION" ] ; then
    docker-compose -f .travis/docker-compose.yml exec -u root db bash /pam/pam.sh
    sleep 1
    docker-compose -f .travis/docker-compose.yml stop db
    sleep 1
    docker-compose -f .travis/docker-compose.yml up -d
    docker-compose -f .travis/docker-compose.yml logs db
    node --version
    node .travis/wait-for-docker-up.js
  fi
fi

if [ -n "$LINT" ] ; then npm run test:lint; fi
if [ -z "$BENCH$LINT" ] ; then npm run coverage:test; fi
if [ -n "$BENCH" ] ; then
  npm install promise-mysql mysql2
  npm install microtime
  npm run benchmark
fi
