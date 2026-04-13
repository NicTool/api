#!/bin/sh
# TOML backend lifecycle for test/run.sh

setup() {
	export NICTOOL_DATA_STORE_PATH="./test/conf.d"
	mkdir -p test/conf.d
	$NODE test/fixtures.js setup
}

cleanup() {
	echo "cleaning TOML test store"
	rm -f test/conf.d/*.toml
}

run_tests() {
	# Run serially: TOML uses shared files; parallel workers cause concurrent-write corruption
	for f in \
		lib/group/test/index.js \
		lib/nameserver/test/index.js \
		lib/permission/test/index.js \
		lib/session/test/index.js \
		lib/user/test/index.js \
		lib/zone/test/index.js \
		lib/zone_record/test/index.js \
		lib/config.test.js \
		lib/util.test.js \
		routes/group.test.js \
		routes/nameserver.test.js \
		routes/permission.test.js \
		routes/session.test.js \
		routes/user.test.js \
		routes/zone.test.js \
		routes/zone_record.test.js; do
		$NODE --test --test-reporter=spec "$f" || exit 1
	done
}
