#!/bin/sh

DB_USER="${DB_USER:-root}"
DB_NAME="${DB_NAME:-nictool}"
MYSQL_BIN=""

if [ "$MYSQL_PWD" = "" ]; then
	if [ -n "$MYSQL_ROOT_PASSWORD" ]; then
		# Docker: MYSQL_ROOT_PASSWORD is set by the MariaDB container
		export MYSQL_PWD="$MYSQL_ROOT_PASSWORD"
	else
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
fi

if [ -z "$MYSQL_CMD" ]; then
	# prefer mariadb client if available (MariaDB 11+ dropped the mysql symlink)
	if [ -z "$MYSQL_BIN" ] && command -v mariadb >/dev/null 2>&1; then
		MYSQL_CMD="mariadb --user=$DB_USER"
	elif [ -n "$MYSQL_BIN" ]; then
		MYSQL_CMD="${MYSQL_BIN}mysql --user=$DB_USER"
	else
		MYSQL_CMD="mysql --user=$DB_USER"
	fi
fi

if [ "$1" = "drop" ]; then
	$MYSQL_CMD -e "DROP DATABASE IF EXISTS $DB_NAME;" || exit 1
fi

$MYSQL_CMD -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;" || exit 1

# In Docker, SQL_DIR is set via compose env (e.g. /sql).
# Outside Docker, defaults to ./sql relative to CWD (typically the repo root).
SQL_DIR="${SQL_DIR:-./sql}"

for f in "$SQL_DIR"/*.sql;
do
	echo "$f"
	$MYSQL_CMD "$DB_NAME" < "$f" || exit 1
done

exit 0
