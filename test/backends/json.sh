#!/bin/sh
# JSON backend lifecycle for test/run.sh

setup() {
	export NICTOOL_DATA_STORE_PATH="./test/conf.d"
	mkdir -p test/conf.d
	$NODE test/fixtures.js setup
}

cleanup() {
	echo "cleaning JSON test store"
	rm -f test/conf.d/*.json
}

test_files() {
	discover_tests | grep -vE "$NEEDS_DB"
}

run_tests() {
	# shellcheck disable=SC2046 # word splitting is how the file list is passed
	$NODE --test --test-force-exit --test-concurrency=1 "$@" $(test_files)
}
