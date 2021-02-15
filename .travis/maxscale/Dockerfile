FROM centos:7

ARG MAXSCALE_VERSION
ENV MAXSCALE_VERSION ${MAXSCALE_VERSION:-2.5.3}

COPY maxscale/mariadb.repo /etc/yum.repos.d/

RUN rpm --import https://yum.mariadb.org/RPM-GPG-KEY-MariaDB \
    && yum -y install https://downloads.mariadb.com/MaxScale/${MAXSCALE_VERSION}/centos/7/x86_64/maxscale-${MAXSCALE_VERSION}-2.rhel.7.x86_64.rpm \
    && yum -y update

RUN yum -y install maxscale-${MAXSCALE_VERSION} MariaDB-client \
    && yum clean all \
    && rm -rf /tmp/*

COPY maxscale/docker-entrypoint.sh /
COPY maxscale/maxscale.cnf /etc/
RUN chmod 777 /etc/maxscale.cnf
RUN chmod 777 /docker-entrypoint.sh


EXPOSE 4006 4007 4008

ENTRYPOINT ["/docker-entrypoint.sh"]