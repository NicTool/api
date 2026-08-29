# Copyright 2004-2024 The Network People, Inc.
#
# Lookup rows added since NicTool 2.x. New installs get these from
# sql/04_nt_nameserver.sql and sql/06_resource_records.sql; a database
# created by 2.x has only the rows of its day (no coredns or native
# nameserver type), so re-seed. Safe to re-run: INSERT IGNORE keeps
# existing rows, so an id already in use keeps the row it has and the
# name below is not added.

INSERT IGNORE INTO `nt_nameserver_export_type` (`id`, `name`, `descr`, `url`)
VALUES (1,'djbdns','djbdns (tinydns & axfrdns)','cr.yp.to/djbdns.html'),
       (2,'bind','BIND (zone files)', 'www.isc.org/downloads/bind/'),
       (3,'maradns','MaraDNS', 'maradns.samiam.org'),
       (4,'powerdns','PowerDNS','www.powerdns.com'),
       (5,'bind-nsupdate','BIND (nsupdate protocol)',''),
       (6,'nsd','Name Server Daemon (NSD)','www.nlnetlabs.nl/projects/nsd/'),
       (7,'dynect','DynECT Standard DNS','dyn.com/managed-dns/'),
       (8,'knot','Knot DNS','www.knot-dns.cz'),
       (9,'coredns','CoreDNS','coredns.io'),
       (10,'native','NicTool (in-process)','nictool.com');

INSERT IGNORE INTO `resource_record_type` (`id`, `name`, `description`, `reverse`, `forward`, `obsolete`)
VALUES
    (1,'A','Address',1,1,0),
    (2,'NS','Name Server',1,1,0),
    (5,'CNAME','Canonical Name',1,1,0),
    (6,'SOA','Start Of Authority',0,0,0),
    (12,'PTR','Pointer',1,1,0),
    (13,'HINFO','Host Info',0,0,1),
    (15,'MX','Mail Exchanger',0,1,0),
    (16,'TXT','Text',1,1,0),
    (24,'SIG','Signature',0,0,0),
    (25,'KEY','Key',0,0,0),
    (28,'AAAA','Address IPv6',0,1,0),
    (29,'LOC','Location',0,1,0),
    (30,'NXT','Next',0,0,1),
    (33,'SRV','Service',0,1,0),
    (35,'NAPTR','Naming Authority Pointer',1,1,0),
    (39,'DNAME','Delegation Name',0,0,0),
    (43,'DS','Delegation Signer',1,1,0),
    (44,'SSHFP','Secure Shell Key Fingerprints',0,1,0),
    (46,'RRSIG','Resource Record Signature',0,1,0),
    (47,'NSEC','Next Secure',0,1,0),
    (48,'DNSKEY','DNS Public Key',0,1,0),
    (50,'NSEC3','Next Secure v3',0,0,0),
    (51,'NSEC3PARAM','NSEC3 Parameters',0,0,0),
    (99,'SPF','Sender Policy Framework',0,0,1),
    (250,'TSIG','Transaction Signature',0,0,0),
    (252,'AXFR',NULL,0,0,0),
    (256,'URI','URI',0,1,0),
    (257,'CAA','Certification Authority Authorization',0,1,0);
