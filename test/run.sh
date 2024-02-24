#!/bin/sh

node test/.setup.js
node --test
node test/.teardown.js