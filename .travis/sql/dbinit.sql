CREATE USER 'bob'@'localhost';
GRANT ALL ON *.* TO 'bob'@'localhost' with grant option;

CREATE USER 'bob'@'%';
GRANT ALL ON *.* TO 'bob'@'%' with grant option;

CREATE USER 'boby'@'%' identified by 'heyPassw0@rd';
GRANT ALL ON *.* TO 'boby'@'%' with grant option;

CREATE USER 'boby'@'localhost' identified by 'heyPassw0@rd';
GRANT ALL ON *.* TO 'boby'@'localhost' with grant option;

FLUSH PRIVILEGES;

CREATE DATABASE test2;