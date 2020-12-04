CREATE USER 'bob'@'%';
GRANT ALL ON *.* TO 'bob'@'%' with grant option;

/*M!100501 CREATE USER 'boby'@'%' identified by 'heyPassw0@rd'*/;
/*M!100501 GRANT ALL ON *.* TO 'boby'@'%' with grant option*/;

FLUSH PRIVILEGES;

CREATE DATABASE test2;