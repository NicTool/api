#!/bin/sh

# configure MySQL in the GitHub runners
case "$(uname -s)" in
    Linux*)
		export MYSQL_PWD=root
	;;
    Darwin*)
		mysqladmin --user=root --password='' --protocol=tcp password 'root'
		export MYSQL_PWD="root"
	;;
    CYGWIN*|MINGW*|MINGW32*|MSYS*)
		export MYSQL_PWD=""
	;;
esac

# AUTH="--defaults-extra-file=./sql/my-gha.cnf"

# mysql --user=root -e 'DROP DATABASE IF EXISTS nictool;' || exit 1
mysql --user=root -e 'CREATE DATABASE nictool;' || exit 1

for f in './sql/*.sql';
do
	cat $f | mysql --user=root nictool || exit 1
done

exit 0