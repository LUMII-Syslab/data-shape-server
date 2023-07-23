# Data Shape Server (DSS)

## Requirements

- `node.js` installation [Link](https://nodejs.org/en/), version >= 18
- access to the `PostgreSQL` database containing the meta information about the endpoint

## Getting started

Steps to start the data shape server locally:

- `cd server`
- run `npm ci` once to install the DSS dependencies
- create `.env` file from `sample.env` and enter there the DB connection string and the port number the DSS app will be listening to
- run `npm run dev` to start DSS in development mode or `npm start` to start DSS in production mode 

