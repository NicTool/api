#!/bin/sh

node --no-warnings=ExperimentalWarning test/suite.js setup
node --no-warnings=ExperimentalWarning --test
node --no-warnings=ExperimentalWarning test/suite.js teardown
