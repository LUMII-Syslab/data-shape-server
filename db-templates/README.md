# Data Shape Server Database

This folder contains scripts for local setup of a DSS database.

## What is required to start

- Access to a PostgreSQL server instance where you have priviliges to create and administrate a database.

## Initial setup for the database

- Choose the name for your database, e.g., `dss`, and create the database:

```
createdb dss
```

- create the db role `rdf` which will own the DSS db objects

- Initialize the schema `public` (to be used as the schemata registry) and the schema `empty` (to be used as a template for all new endpoint schemata):

  - Upload the script `public-template-v2.pgsql` to create the schema `public`:

```
psql dss < public-template-v2.pgsql
```

  - Upload the script `empty-template.pgsql` to create the schema `empty`:

```
psql dss < empty-template.pgsql
```

If all the above commands executed successfully then the DSS database is ready.

To import schemata for your endpoints, see the folder [import-small](../import-small/) in this repository.

**Important** You should never import directly into the schema `empty`; instead, this schema is to be reserved as the source for schemata cloning.