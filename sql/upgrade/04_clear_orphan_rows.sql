# Copyright 2004-2024 The Network People, Inc.
#
# Prepares a NicTool 2.x database for 05_enable_foreign_keys.sql. Safe to
# re-run. Two things block those constraints:
#
#   1. Zero datetimes. Adding a constraint rebuilds the table, and MySQL 8's
#      NO_ZERO_DATE re-validates every row, so '0000-00-00 00:00:00' left by
#      MySQL 5.x aborts the ALTER with errno 1292.
#   2. Orphan rows — DESTRUCTIVE, see below.
#

# ---------------------------------------------------------------------------
# Zero datetimes -> NULL
#
# Lossless: the API already reads these as absent (see the Date.parse guard in
# lib/zone_record/store/mysql.js and the last_publish check in the zone store).
# sql_mode is relaxed for the session because strict mode rejects the literal
# in the comparison as well as in the write.
# ---------------------------------------------------------------------------

SET @nt_old_sql_mode = @@SESSION.sql_mode;
SET SESSION sql_mode = '';

UPDATE nt_zone_record SET timestamp = NULL WHERE timestamp = '0000-00-00 00:00:00';
UPDATE nt_zone SET last_publish = NULL WHERE last_publish = '0000-00-00 00:00:00';

SET SESSION sql_mode = @nt_old_sql_mode;

# nt_zone.last_modified is NOT NULL, so a zero there has no lossless
# replacement. It blocks nothing today; deal with it if nt_zone is ever
# rebuilt:
#   UPDATE nt_zone SET last_modified = '1970-01-01 00:00:01'
#    WHERE last_modified = '0000-00-00 00:00:00';

# ---------------------------------------------------------------------------
# Orphan rows — DESTRUCTIVE
#
# A database that ran with the constraints disabled accumulates rows whose
# parent has since been deleted. With ON DELETE CASCADE in force those rows
# would have gone automatically, so removing them restores the state the schema
# has always intended. They are almost entirely audit-log entries for objects
# that no longer exist.
#
# Check what would be removed before running this:
#
#   SELECT COUNT(*) FROM nt_zone_record c
#     LEFT JOIN nt_zone p ON c.nt_zone_id = p.nt_zone_id
#    WHERE p.nt_zone_id IS NULL;

DELETE c FROM nt_group_log c
  LEFT JOIN nt_group p ON c.nt_group_id = p.nt_group_id
 WHERE p.nt_group_id IS NULL;

DELETE c FROM nt_group_subgroups c
  LEFT JOIN nt_group p ON c.nt_group_id = p.nt_group_id
 WHERE p.nt_group_id IS NULL;

DELETE c FROM nt_user_session c
  LEFT JOIN nt_user p ON c.nt_user_id = p.nt_user_id
 WHERE p.nt_user_id IS NULL;

DELETE c FROM nt_user_session_log c
  LEFT JOIN nt_user p ON c.nt_user_id = p.nt_user_id
 WHERE p.nt_user_id IS NULL;

DELETE c FROM nt_user_global_log c
  LEFT JOIN nt_user p ON c.nt_user_id = p.nt_user_id
 WHERE p.nt_user_id IS NULL;

DELETE c FROM nt_nameserver c
  LEFT JOIN nt_group p ON c.nt_group_id = p.nt_group_id
 WHERE p.nt_group_id IS NULL;

DELETE c FROM nt_delegate c
  LEFT JOIN nt_group p ON c.nt_group_id = p.nt_group_id
 WHERE p.nt_group_id IS NULL;

# zone_record before its log, so the log's own parent check sees the result.
DELETE c FROM nt_zone_record c
  LEFT JOIN nt_zone p ON c.nt_zone_id = p.nt_zone_id
 WHERE p.nt_zone_id IS NULL;

DELETE c FROM nt_zone_log c
  LEFT JOIN nt_zone p ON c.nt_zone_id = p.nt_zone_id
 WHERE p.nt_zone_id IS NULL;

DELETE c FROM nt_zone_log c
  LEFT JOIN nt_group p ON c.nt_group_id = p.nt_group_id
 WHERE p.nt_group_id IS NULL;

DELETE c FROM nt_zone_log c
  LEFT JOIN nt_user p ON c.nt_user_id = p.nt_user_id
 WHERE p.nt_user_id IS NULL;

DELETE c FROM nt_zone_record_log c
  LEFT JOIN nt_zone p ON c.nt_zone_id = p.nt_zone_id
 WHERE p.nt_zone_id IS NULL;

DELETE c FROM nt_zone_record_log c
  LEFT JOIN nt_user p ON c.nt_user_id = p.nt_user_id
 WHERE p.nt_user_id IS NULL;

DELETE c FROM nt_zone_record_log c
  LEFT JOIN nt_zone_record p ON c.nt_zone_record_id = p.nt_zone_record_id
 WHERE p.nt_zone_record_id IS NULL;
