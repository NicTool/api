# Copyright 2004-2026 The Network People, Inc.
#
# Stores every zone name in the form NicTool 3 matches: lowercase, without
# the trailing dot. A zone created through the 2.x API or web UI keeps the
# case it was given (2.x imports lowercase it). NicTool 3 matches names
# exactly, so it can't find such a zone by name, and the zone doesn't block
# a second one of the same name.
#
# A live zone is left alone when another live zone has the same canonical
# name; the final SELECT lists those for an admin to rename or delete. DNS
# names are case-insensitive, so the zone itself is unchanged, and
# last_modified is kept so it doesn't read as edited.
#
# Idempotent, so it is safe to re-run:
#
#   mysql nictool < 07_lowercase_zone_names.sql

CREATE TEMPORARY TABLE nt_zone_name_taken AS
SELECT LOWER(TRIM(TRAILING '.' FROM zone)) AS canonical
  FROM nt_zone
 WHERE deleted = 0
 GROUP BY canonical
HAVING COUNT(*) > 1;

UPDATE nt_zone
   SET zone = LOWER(TRIM(TRAILING '.' FROM zone)),
       last_modified = last_modified
 WHERE zone <> LOWER(TRIM(TRAILING '.' FROM zone))
   AND (deleted = 1
        OR LOWER(TRIM(TRAILING '.' FROM zone)) NOT IN (SELECT canonical FROM nt_zone_name_taken));

DROP TEMPORARY TABLE nt_zone_name_taken;

SELECT nt_zone_id, zone AS `live zone sharing its name with another`
  FROM nt_zone
 WHERE deleted = 0
   AND zone <> LOWER(TRIM(TRAILING '.' FROM zone));
