#!/bin/sh

node test/fixtures/.setup.js
node --test
node test/fixtures/.teardown.js