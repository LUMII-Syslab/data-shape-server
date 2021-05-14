const path = require('path');
const pg_url_parse = require('pg-connection-string').parse;

const argv = require('minimist')(process.argv.slice(2));

const ENV_NAME=process.env.ENV_NAME || argv['config'] || '';
const config = require('dotenv').config({path: path.join(__dirname, ENV_NAME + '.env')});

const NODE_ENV = process.env.NODE_ENV || 'production';
const NODE_ENV_DEVELOPMENT = process.env.NODE_ENV === 'development';

const PORT = Number.parseInt(process.env.PORT || '3333');
process.env.PORT = PORT;

const DB_URL = process.env.DB_URL;
const DB_CONFIG = pg_url_parse(DB_URL);

module.exports = {
  NODE_ENV,
  NODE_ENV_DEVELOPMENT,
  PORT,
  DB_URL,
  DB_CONFIG,
};
