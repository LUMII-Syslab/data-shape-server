const path = require('path')
const config = require('dotenv').config({ path: path.join(__dirname, '.env') }).parsed
const pgp = require('pg-promise')({ capSQL: true });
const { parse } = require('pg-connection-string')

const DB_CONFIG = parse(config.DB_URL)
console.log(DB_CONFIG)

const db = pgp(DB_CONFIG)

module.exports = { db, pgp };
