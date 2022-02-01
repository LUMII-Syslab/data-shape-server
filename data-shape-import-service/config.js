const path = require('path');

const pgpOptions = {}
const pgp = require('pg-promise')(pgpOptions)
const pg_url_parse = require('pg-connection-string').parse;

const argv = require('minimist')(process.argv.slice(2));

const ENV_NAME=process.env.ENV_NAME || argv['config'] || '';
const config = require('dotenv').config({path: path.join(__dirname, ENV_NAME + '.env')});

console.log('config loaded:', config);

if (argv['dry-run']) {
  process.env['DRY_RUN'] = 'true';
}

const NODE_ENV = process.env.NODE_ENV || 'production';
const NODE_ENV_DEVELOPMENT = process.env.NODE_ENV === 'development';

const DB_URL = process.env.DB_URL;
const DB_CONFIG = pg_url_parse(DB_URL);
const DB_SCHEMA = process.env.DB_SCHEMA || 'dbpedia';

const SHOW_DEBUG = process.env.SHOW_DEBUG === 'true';
const DRY_RUN = process.env.DRY_RUN || false;

const db = pgp(DB_CONFIG)

module.exports = {
  NODE_ENV,
  NODE_ENV_DEVELOPMENT,
  SHOW_DEBUG,
  DB_URL,
  DB_CONFIG,
  DB_SCHEMA,
  DRY_RUN,
  db
};
