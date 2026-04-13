#!/bin/sh

set -eu

NODE="node --no-warnings=ExperimentalWarning"
BACKEND="${NICTOOL_DATA_STORE:-mysql}"

case "$BACKEND" in
	toml|mysql) ;;
	*) echo "Unknown NICTOOL_DATA_STORE: $BACKEND" >&2; exit 1 ;;
esac

# shellcheck source=backends/mysql.sh
. "$(dirname "$0")/backends/${BACKEND}.sh"

setup
trap cleanup EXIT 1 2 3 6

if [ $# -ge 1 ]; then
	if [ "$1" = "watch" ]; then
		$NODE --test --watch
	else
		$NODE --test --test-reporter=spec "$1"
	fi
else
	run_tests
fi
