CREATE USER 'bob'@'localhost';
GRANT ALL ON *.* TO 'bob'@'localhost' with grant option;

CREATE USER 'bob'@'%';
GRANT ALL ON *.* TO 'bob'@'%' with grant option;

CREATE USER 'boby'@'%' identified by 'heyPassw0@rd';
GRANT ALL ON *.* TO 'boby'@'%' /*M!100401 identified by 'heyPassw0@rd'*/ with grant option;

CREATE USER 'boby'@'localhost' identified by 'heyPassw0@rd';
GRANT ALL ON *.* TO 'boby'@'localhost' /*M!100401 identified by 'heyPassw0@rd'*/ with grant option;

CREATE DATABASE test2;