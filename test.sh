#!/bin/sh

set -eu

NODE="node --no-warnings=ExperimentalWarning"
$NODE test-fixtures.js teardown
$NODE test-fixtures.js setup

cleanup() {
	echo "cleaning DB objects"
	$NODE test-fixtures.js teardown
}

trap cleanup EXIT 1 2 3 6

if [ $# -ge 1 ]; then
	if [ "$1" = "watch" ]; then
		$NODE --test --watch
	else
		$NODE --test --test-reporter=spec "$1"
	fi
else
	# if [ -n "$GITHUB_WORKFLOW" ]; then
		# npm i --no-save node-test-github-reporter
		# $NODE --test --test-reporter=node-test-github-reporter
	# fi
	$NODE --test --test-reporter=spec lib/*.test.js routes/*.test.js
fi

# npx mocha --exit --no-warnings=ExperimentalWarning lib/*.test.js routes/*.test.js
