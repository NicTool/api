#!/bin/sh

export MYSQL_PWD=root
# AUTH="--defaults-extra-file=./sql/my-gha.cnf"

# mysql --user=root -e 'DROP DATABASE IF EXISTS nictool;' || exit 1
mysql --user=root -e 'CREATE DATABASE nictool;' || exit 1

for f in './sql/*.sql';
do
	cat $f | mysql --user=root nictool || exit 1
done

exit 0