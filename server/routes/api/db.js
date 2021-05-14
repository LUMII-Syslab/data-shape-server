const { DB_CONFIG } = require('../../config')

const pgp = require('pg-promise')();
const db = pgp(DB_CONFIG);

module.exports = db;