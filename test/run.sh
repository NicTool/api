#!/bin/sh

node test/suite.js setup
node --test
node test/suite.js teardown
