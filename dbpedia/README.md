# DBPedia data shape retrieval services

The DBPedia retrieval services consist of several `node.js` scripts to be executed in the defined order to fill up the data shape server schema for DBPedia.

Required steps:

- create an empty schema in the database

- set up the connection parameters for both the SPARQL endpoint and the PostgreSQL database

- execute the steps in the following order:

  - classes
  - properties

  - ../common/set-ns-and-ln

  - same-as
  - subclass-of

  - cp_rels
  - cp_rels-object_cnt

  - domain-range
  - pp-rels

