#!/bin/sh
# MySQL backend lifecycle for test/run.sh

setup() {
	# Set up test database connection for CI (GitHub Actions)
	if [ "${CI:-}" = "true" ]; then
		sed -i.bak 's/^user[[:space:]]*=.*/user = "root"/' conf.d/mysql.toml
		sed -i.bak 's/^password[[:space:]]*=.*/password = "root"/' conf.d/mysql.toml
	fi

	$NODE test/fixtures.js teardown
	$NODE test/fixtures.js setup
}

cleanup() {
	echo "cleaning DB objects"
	$NODE test/fixtures.js teardown
}

test_files() {
	discover_tests
}

run_tests() {
	# shellcheck disable=SC2046 # word splitting is how the file list is passed
	$NODE --test --test-force-exit --test-concurrency=1 "$@" $(test_files)
}
