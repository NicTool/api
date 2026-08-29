#!/bin/sh

set -eu

NODE="node --no-warnings=ExperimentalWarning"
BACKEND="${NICTOOL_DATA_STORE:-mysql}"

case "$BACKEND" in
	json|toml|mysql) ;;
	*) echo "Unknown NICTOOL_DATA_STORE: $BACKEND" >&2; exit 1 ;;
esac

# shellcheck source=backends/mysql.sh
. "$(dirname "$0")/backends/${BACKEND}.sh"

setup
trap cleanup EXIT 1 2 3 6

if [ $# -ge 1 ]; then
	if [ "$1" = "watch" ]; then
		$NODE --test --watch
	elif [ "$1" = "coverage" ]; then
		$NODE --test --experimental-test-coverage
	elif [ "$1" = "coverage:lcov" ]; then
		mkdir -p coverage
		# lcov alone writes only to the file, so a failure exits 1 with an empty log
		$NODE --test --experimental-test-coverage \
			--test-reporter=lcov --test-reporter-destination=coverage/lcov.info \
			--test-reporter=spec --test-reporter-destination=stdout
	else
		$NODE --test --test-reporter=spec "$1"
	fi
else
	run_tests
fi
