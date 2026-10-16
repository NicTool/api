# Copyright 2004-2026 The Network People, Inc.
#
# Stores every zone name in the form NicTool 3 matches: lowercase, without
# the trailing dot. A zone created through the 2.x API or web UI keeps the
# case it was given (2.x imports lowercase it). NicTool 3 matches names
# exactly, so it can't find such a zone by name, and the zone doesn't block
# a second one of the same name.
#
# Record names that spell their zone then take its new spelling. 2.x stored
# '@' as "<zone>." in the zone's own case, and powerdns-pipe and the web UI
# compare record names to the zone exactly. Absolute names keep their host's
# case (www.Example.com. becomes www.example.com.), and a bare name equal to
# the zone becomes the zone. NicTool 2.42's sql/upgrade.pl does the same.
#
# A live zone is left alone when another live zone has the same canonical
# name. The SELECT at the end lists every live zone that shares its name with
# another, whatever its spelling, for an admin to rename or delete. DNS
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

# compared with z.zone as stored, so a zone left alone above, still in
# capitals, matches no lowercased name and its records keep its spelling
UPDATE nt_zone_record r
  JOIN nt_zone z ON z.nt_zone_id = r.nt_zone_id
   SET r.name = CONCAT(LEFT(r.name, CHAR_LENGTH(r.name) - CHAR_LENGTH(z.zone) - 1), z.zone, '.')
 WHERE (LOWER(r.name) = CONCAT(z.zone, '.')
        OR RIGHT(LOWER(r.name), CHAR_LENGTH(z.zone) + 2) = CONCAT('.', z.zone, '.'))
   AND RIGHT(r.name, CHAR_LENGTH(z.zone) + 1) <> CONCAT(z.zone, '.');

UPDATE nt_zone_record r
  JOIN nt_zone z ON z.nt_zone_id = r.nt_zone_id
   SET r.name = z.zone
 WHERE LOWER(r.name) = z.zone
   AND r.name <> z.zone;

SELECT nt_zone_id, zone AS `live zone sharing its name with another`
  FROM nt_zone
 WHERE deleted = 0
   AND LOWER(TRIM(TRAILING '.' FROM zone)) IN (SELECT canonical FROM nt_zone_name_taken)
 ORDER BY LOWER(TRIM(TRAILING '.' FROM zone)), nt_zone_id;

DROP TEMPORARY TABLE nt_zone_name_taken;
