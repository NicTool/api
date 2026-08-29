#!/bin/sh

set -eu

NODE="node --no-warnings=ExperimentalWarning"
BACKEND="${NICTOOL_DATA_STORE:-mysql}"

case "$BACKEND" in
	json|toml|mysql) ;;
	*) echo "Unknown NICTOOL_DATA_STORE: $BACKEND" >&2; exit 1 ;;
esac

# Everything `node --test` discovers, less test/, whose helpers are not tests.
discover_tests() {
	find lib routes sql \( -name '*.test.js' -o -path '*/test/*.js' \) | sort
}

# Tests that require a live database. The file backends subtract these.
# shellcheck disable=SC2034 # read by the backend sourced below
NEEDS_DB='(^|/)mysql\.test\.js$|/test/mysql\.js$|^sql/schema\.test\.js$'

# Workspace siblings are symlinked, not vendored, so coverage counts their source
# as ours. They report their own. Excluding them also keeps the file count stable,
# since which of their modules load varies with the tests selected.
# Passing any --test-coverage-exclude replaces node's built-in exclusions, so the
# test globs it applies by default have to be restated here.
COVERAGE_EXCLUDE="--test-coverage-exclude=../**
--test-coverage-exclude=**/*.test.js
--test-coverage-exclude=**/test/**
--test-coverage-exclude=test/**"

# shellcheck source=backends/mysql.sh
. "$(dirname "$0")/backends/${BACKEND}.sh"

setup
trap cleanup EXIT 1 2 3 6

if [ $# -ge 1 ]; then
	if [ "$1" = "watch" ]; then
		$NODE --test --watch
	elif [ "$1" = "coverage" ]; then
		# shellcheck disable=SC2046 # word splitting is how the file list is passed
		$NODE --test --experimental-test-coverage $COVERAGE_EXCLUDE $(test_files)
	elif [ "$1" = "coverage:lcov" ]; then
		mkdir -p coverage
		# lcov alone writes only to the file, so a failure exits 1 with an empty log
		# shellcheck disable=SC2046 # word splitting is how the file list is passed
		$NODE --test --experimental-test-coverage $COVERAGE_EXCLUDE \
			--test-reporter=lcov --test-reporter-destination=coverage/lcov.info \
			--test-reporter=spec --test-reporter-destination=stdout \
			$(test_files)
	else
		$NODE --test --test-reporter=spec "$1"
	fi
else
	run_tests
fi
