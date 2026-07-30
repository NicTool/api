# Copyright 2004-2024 The Network People, Inc.
#
# Adds the v3 nameserver runtime configuration columns to a database created by
# NicTool 2.x. New installs get these from sql/04_nt_nameserver.sql instead.
#
# MySQL has no ALTER TABLE ... ADD COLUMN IF NOT EXISTS, so re-running this
# errors with ER_DUP_FIELDNAME. That is safe to ignore.

ALTER TABLE nt_nameserver
    ADD COLUMN listen    JSON NULL DEFAULT NULL,
    ADD COLUMN publisher JSON NULL DEFAULT NULL,
    ADD COLUMN transport JSON NULL DEFAULT NULL,
    ADD COLUMN dnssec    JSON NULL DEFAULT NULL;
