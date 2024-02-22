#!/bin/sh

node test/fixtures/.setup.js
node --test test/*.js
node test/fixtures/.teardown.js