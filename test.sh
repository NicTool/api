#!/bin/sh

set -euo pipefail

NODE="node --no-warnings=ExperimentalWarning"
$NODE test.js teardown
$NODE test.js setup

function cleanup {
	echo "cleaning DB objects"
	$NODE test.js teardown
}

trap cleanup EXIT SIGINT SIGKILL

if [ $# -ge 1 ] && [ "$1" = "watch" ]; then
	$NODE --test --watch
else
	# if [ -n "$GITHUB_WORKFLOW" ]; then
		# npm i --no-save node-test-github-reporter
		# $NODE --test --test-reporter=node-test-github-reporter
	# else
		$NODE --test --test-reporter=spec
	# fi
fi

# npx mocha --exit --no-warnings=ExperimentalWarning lib/*.test.js routes/*.test.js
