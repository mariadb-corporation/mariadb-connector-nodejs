#!/usr/bin/env bash

set -e

echo 'creating configuration done'

sleep 15

#################################################################################################
# wait for db availability for 60s
#################################################################################################
mysql=( mysql --protocol=tcp -ubob -hdb --port=3306 )
for i in {60..0}; do
    if echo 'use test2' | "${mysql[@]}" &> /dev/null; then
        break
    fi
    echo 'DB init process in progress...'
    sleep 1
done

echo 'use test2' | "${mysql[@]}"
if [ "$i" = 0 ]; then
    echo 'DB init process failed.'
    exit 1
fi

echo 'maxscale launching ...'

tail -n 500 /etc/maxscale.cnf

/usr/bin/maxscale --user=root --nodaemon

cd /var/log/maxscale
ls -lrt
tail -n 500 /var/log/maxscale/maxscale.log
