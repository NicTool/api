#!/bin/sh

MYSQL_BIN=""

if [ "$MYSQL_PWD" = "" ];
then
	export MYSQL_PWD=root

	# configure MySQL in the GitHub workflow runners
	case "$(uname -s)" in
		Linux*)
		;;
		Darwin*)
			MYSQL_BIN=/opt/homebrew/opt/mysql@8.4/bin/
			${MYSQL_BIN}mysqladmin --user=root --password='' --protocol=tcp password 'root'
		;;
		CYGWIN*|MINGW*|MINGW32*|MSYS*)
			mysqladmin --user=root --password='' --protocol=tcp password 'root'
			# export MYSQL_PWD=""
		;;
	esac
fi

# AUTH="--defaults-extra-file=./sql/my-gha.cnf"

if [ "$1" = "drop" ]; then
	${MYSQL_BIN}mysql --user=root -e 'DROP DATABASE IF EXISTS nictool;' || exit 1
fi
${MYSQL_BIN}mysql --user=root -e 'CREATE DATABASE nictool;' || exit 1

for f in ./sql/*.sql;
do
	echo "cat $f | ${MYSQL_BIN}mysql nictool"
	cat $f | ${MYSQL_BIN}mysql --user=root nictool || exit 1
done

exit 0