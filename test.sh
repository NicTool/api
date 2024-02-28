#!/bin/sh

node --no-warnings=ExperimentalWarning test.js setup

if [ "$1" = "watch" ]; then
	node --no-warnings=ExperimentalWarning --test --watch
else
	node --no-warnings=ExperimentalWarning --test
	# npx mocha --exit --no-warnings=ExperimentalWarning lib/*.test.js routes/*.test.js
fi

node --no-warnings=ExperimentalWarning test.js teardown
