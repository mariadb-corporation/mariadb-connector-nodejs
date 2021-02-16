# vim:set ft=dockerfile:
FROM ubuntu:xenial

# add our user and group first to make sure their IDs get assigned consistently, regardless of whatever dependencies get added
RUN groupadd -r mysql && useradd -r -g mysql mysql

# https://bugs.debian.org/830696 (apt uses gpgv by default in newer releases, rather than gpg)
RUN set -ex; \
	apt-get update; \
	if ! which gpg; then \
		apt-get install -y --no-install-recommends gnupg; \
	fi; \
# Ubuntu includes "gnupg" (not "gnupg2", but still 2.x), but not dirmngr, and gnupg 2.x requires dirmngr
# so, if we're not running gnupg 1.x, explicitly install dirmngr too
	if ! gpg --version | grep -q '^gpg (GnuPG) 1\.'; then \
		 apt-get install -y --no-install-recommends dirmngr; \
	fi; \
	rm -rf /var/lib/apt/lists/*

# add gosu for easy step-down from root
ENV GOSU_VERSION 1.10
RUN set -ex; \
	\
	fetchDeps=' \
		ca-certificates \
		wget \
	'; \
	apt-get update; \
	apt-get install -y --no-install-recommends $fetchDeps; \
	rm -rf /var/lib/apt/lists/*; \
	\
	dpkgArch="$(dpkg --print-architecture | awk -F- '{ print $NF }')"; \
	wget -O /usr/local/bin/gosu "https://github.com/tianon/gosu/releases/download/$GOSU_VERSION/gosu-$dpkgArch"; \
	wget -O /usr/local/bin/gosu.asc "https://github.com/tianon/gosu/releases/download/$GOSU_VERSION/gosu-$dpkgArch.asc"; \
	\
# verify the signature
	export GNUPGHOME="$(mktemp -d)"; \
	gpg --batch --keyserver ha.pool.sks-keyservers.net --recv-keys B42F6819007F00F88E364FD4036A9C25BF357DD4; \
	gpg --batch --verify /usr/local/bin/gosu.asc /usr/local/bin/gosu; \
	command -v gpgconf > /dev/null && gpgconf --kill all || :; \
	rm -r "$GNUPGHOME" /usr/local/bin/gosu.asc; \
	\
	chmod +x /usr/local/bin/gosu; \
# verify that the binary works
	gosu nobody true; \
	\
	apt-get purge -y --auto-remove $fetchDeps

RUN mkdir /docker-entrypoint-initdb.d

# install "pwgen" for randomizing passwords
# install "apt-transport-https" for Percona's repo (switched to https-only)
RUN apt-get update && apt-get install -y --no-install-recommends \
		apt-transport-https ca-certificates \
		tzdata \
		pwgen \
	&& rm -rf /var/lib/apt/lists/*

RUN { \
		echo "mariadb-server-10.6" mysql-server/root_password password 'unused'; \
		echo "mariadb-server-10.6" mysql-server/root_password_again password 'unused'; \
	} | debconf-set-selections

RUN apt-get update -y
RUN apt-get install -y software-properties-common wget
RUN apt-key adv --recv-keys --keyserver keyserver.ubuntu.com 0xcbcb082a1bb943db
RUN apt-key adv --recv-keys --keyserver ha.pool.sks-keyservers.net F1656F24C74CD1D8
RUN echo 'deb http://yum.mariadb.org/galera/repo4/deb xenial main' > /etc/apt/sources.list.d/galera-test-repo.list
RUN apt-get update -y

RUN apt-get install -y curl libdbi-perl rsync socat libnuma1 libaio1 zlib1g-dev libreadline5 libjemalloc1 libsnappy1v5 libcrack2 apt-utils

RUN apt-get install -y galera4

COPY *.deb /root/
RUN chmod 777 /root/*

RUN dpkg --install /root/mysql-common*
RUN dpkg --install /root/mariadb-common*
RUN dpkg -R --unpack /root/
RUN apt-get install -f -y
RUN ls -lrt /etc/mysql
RUN ls -lrt /etc/mysql/mariadb.conf.d
RUN find / -type f -name "*tz_info*"
RUN ls -lrt /usr/bin/
RUN rm -rf /var/lib/apt/lists/* \
    	&& sed -ri 's/^user\s/#&/' /etc/mysql/my.cnf /etc/mysql/mariadb.conf.d/*.cnf \
    	&& rm -rf /var/lib/mysql && mkdir -p /var/lib/mysql /var/run/mysqld \
    	&& chown -R mysql:mysql /var/lib/mysql /var/run/mysqld \
    	&& chmod 777 /var/run/mysqld \
    	&& find /etc/mysql/ -name '*.cnf' -print0 \
    		| xargs -0 grep -lZE '^(bind-address|log)' \
    		| xargs -rt -0 sed -Ei 's/^(bind-address|log)/#&/' \
    	&& echo '[mysqld]\nskip-host-cache\nskip-name-resolve' > /etc/mysql/mariadb.conf.d/docker.cnf

VOLUME /var/lib/mysql

COPY docker-entrypoint.sh /usr/local/bin/
RUN ln -s usr/local/bin/docker-entrypoint.sh / # backwards compat
ENTRYPOINT ["docker-entrypoint.sh"]

EXPOSE 3306
CMD ["mysqld"]

