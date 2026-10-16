# Copyright 2004-2026 The Network People, Inc.
#
# Gives record names that spell their zone the zone's canonical spelling,
# after 07 lowercased the zones. 2.x stored '@' as "<zone>." in the zone's
# own case, and powerdns-pipe and the web UI compare record names to the zone
# exactly. Absolute names keep their host's case: www.Example.com. becomes
# www.example.com. A bare name equal to the zone (Example.com) becomes the
# zone. NicTool 2.42's sql/upgrade.pl does the same rewrite.
#
# Idempotent, so it is safe to re-run:
#
#   mysql nictool < 08_lowercase_record_zone_suffix.sql

UPDATE nt_zone_record r
  JOIN nt_zone z ON z.nt_zone_id = r.nt_zone_id
   SET r.name = CONCAT(
         LEFT(r.name, CHAR_LENGTH(r.name) - CHAR_LENGTH(LOWER(TRIM(TRAILING '.' FROM z.zone))) - 1),
         LOWER(TRIM(TRAILING '.' FROM z.zone)), '.')
 WHERE (LOWER(r.name) = CONCAT(LOWER(TRIM(TRAILING '.' FROM z.zone)), '.')
        OR RIGHT(LOWER(r.name), CHAR_LENGTH(LOWER(TRIM(TRAILING '.' FROM z.zone))) + 2)
           = CONCAT('.', LOWER(TRIM(TRAILING '.' FROM z.zone)), '.'))
   AND RIGHT(r.name, CHAR_LENGTH(LOWER(TRIM(TRAILING '.' FROM z.zone))) + 1)
       <> CONCAT(LOWER(TRIM(TRAILING '.' FROM z.zone)), '.');

UPDATE nt_zone_record r
  JOIN nt_zone z ON z.nt_zone_id = r.nt_zone_id
   SET r.name = LOWER(TRIM(TRAILING '.' FROM z.zone))
 WHERE LOWER(r.name) = LOWER(TRIM(TRAILING '.' FROM z.zone))
   AND r.name <> LOWER(TRIM(TRAILING '.' FROM z.zone));
