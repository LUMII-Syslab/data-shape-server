const fs = require('fs')

const LOG_FILE = `./json-importer-${new Date().toISOString().slice(0, 10)}.log`
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf-8' })


async function log(params) {
  let message
  if (typeof params === 'string') {
    message = params
  } else if (typeof params === 'object') {
    message = JSON.stringify(params, null, 2)
  } else {
    message = 'unk'
  }

  logStream.write(`[${new Date().toISOString().slice(11, 19)}] ${message}\n`)
}

function logError(params) {
  console.error(params)
  log(params)
}

function logInfo(params) {
  console.log(params)
  log(params)
}

function closeStream() {
  // .end() signals no more data will be written and flushes the buffer
  logStream.end(() => {
    console.log('Done; Log stream closed safely.');
  });
}

function init() {
  // 1. Handles normal completion (event loop is empty)
  process.on('beforeExit', () => {
    closeStream();
  });

  // 2. Handles unexpected crashes
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // On crash, we use synchronous cleanup if possible
    logStream.end();
    process.exit(1);
  });

  // 3. Handles manual stops (Ctrl+C)
  process.on('SIGINT', () => {
    closeStream();
    process.exit(0);
  });
}

module.exports = {
  logInfo,
  logError,
}
