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
	# Run serially: the file store uses shared files; parallel workers cause concurrent-write corruption
	for f in $(test_files); do
		$NODE --test --test-reporter=spec "$f" || exit 1
	done
}
