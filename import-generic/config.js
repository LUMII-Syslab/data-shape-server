const path = require('path');

const pgpOptions = {}
const pgp = require('pg-promise')(pgpOptions);
const pg_url_parse = require('pg-connection-string').parse;
const monitor = require('pg-monitor');

const argv = require('minimist')(process.argv.slice(2));

const ENV_NAME=process.env.ENV_NAME || argv['config'] || '';
const config = require('dotenv').config({path: path.join(__dirname, ENV_NAME ? 'env' : '', ENV_NAME + '.env')});

if (config.error) {
    console.error('no or bad env file provided; exiting...');
    process.exit(1);
}

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

const db = pgp(DB_CONFIG);

if (NODE_ENV_DEVELOPMENT) {
  const debug = require('debug')('db');
  monitor.attach(pgpOptions);
  monitor.setLog((msg, info) => {
    info.display = false;
    debug(`${info.time && info.time.toISOString().substring(11, 23)} ${info.event} ${info.text}`);
  });
}

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
