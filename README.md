# Data Shape Server (DSS)

## Requirements

- `node.js` installation
- access to the `PostgreSQL` database containing the meta information

## Getting started

Steps to start the data shape server locally:

- `cd ./server`
- run `npm ci` once to install the DSS dependencies
- create `.env` file from `sample.env` and enter there the DB connection string and the port number for the DSS
- run `npm run dev` to start DSS in development mode or `npm start` to start DSS in production mode

