#!/bin/bash

set -x
set -e

###################################################################################################################
# test different type of configuration
###################################################################################################################

if [ "$DB" = "build" ] ; then
  .travis/build/build.sh
  docker build -t build:latest --label build .travis/build/
fi

if [ -n "$MAXSCALE_VERSION" ] ; then
  ###################################################################################################################
  # launch Maxscale with one server
  ###################################################################################################################
  export TEST_PORT=4007
  export TEST_USER=bob
  export TEXT_DATABASE=test2
  export COMPOSE_FILE=.travis/maxscale-compose.yml
  docker-compose -f ${COMPOSE_FILE} build
  docker-compose -f ${COMPOSE_FILE} up -d
else
  docker-compose -f .travis/docker-compose.yml up -d
fi

npm install coveralls
npm install
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

if [ -n "$LINT" ] ; then npm run test:lint; fi
if [ -z "$BENCH$LINT" ] ; then npm run test:base; fi
if [ -n "$BENCH" ] ; then
  npm install promise-mysql mysql2
  npm install microtime
  npm run benchmark
fi
