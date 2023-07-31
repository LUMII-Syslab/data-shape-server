# Data Shape Server (DSS)

## About

The Data Shape Server serves a stored knowledge graph schema information (e.g., the classes, the properties and their connections) to a client that can use it, e.g., in autocompletion of SPARQL queries over the data set with the corresponding schema.
The Data Shape Server is used in the context of ViziQuer tool (https://github.com/LUMII-Syslab/viziquer) to support auto-completion of visual queries over RDF databases.

## Requirements

- `node.js` installation [Link](https://nodejs.org/en/), version >= 18
- access to the `PostgreSQL` database containing the data schema information (the meta information about the endpoint to be queried).

## Getting started

Steps to start the data shape server locally:

- `cd server`
- run `npm ci` once to install the DSS dependencies
- create `.env` file from `sample.env` and enter there the DB connection string and the port number the DSS app will be listening to
- run `npm run dev` to start DSS in development mode or `npm start` to start DSS in production mode 

## Acknowledgements

The Data Shape Server has been developed at Institute of Mathematics and Computer Science, University of Latvia, https://lumii.lv, 
with partial support from Latvian Science Council project lzp-2021/1-0389 "Visual Queries in Distributed Knowledge Graphs" (since 2022).
