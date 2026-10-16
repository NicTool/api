# Copyright 2004-2026 The Network People, Inc.
#
# An index on each zone's canonical name: lowercase, without the trailing
# dot. The API matches zone names in that form, and without this index every
# lookup by name scans nt_zone. The column is virtual, so 2.x, which names
# the columns it writes, never sees it.
#
# Idempotent, so it is safe to re-run:
#
#   mysql nictool < 07_zone_canonical_name.sql

SET @have_column = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'nt_zone'
       AND COLUMN_NAME  = 'zone_canonical'
);

SET @nt_ddl = IF(@have_column, 'DO 0',
    'ALTER TABLE `nt_zone`
       ADD COLUMN `zone_canonical` VARCHAR(255)
           GENERATED ALWAYS AS (LOWER(TRIM(TRAILING ''.'' FROM `zone`))) VIRTUAL AFTER `zone`,
       ADD KEY `nt_zone_idx4` (`zone_canonical`)');

PREPARE nt_stmt FROM @nt_ddl;
EXECUTE nt_stmt;
DEALLOCATE PREPARE nt_stmt;
