const fs = require('fs')
const col = require('ansi-colors')

const LOG_FILE = `./json-importer-${new Date().toISOString().slice(0, 10)}.log`
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf-8' })


async function log(params, breakBefore = false) {
  let message
  if (typeof params === 'string') {
    message = params
  } else if (typeof params === 'object') {
    if (params instanceof Error) {
      message = `Error Message: ${params.message}\nQuery: "${params.query}"`
    } else {
      message = JSON.stringify(params, null, 2)
    }
  } else {
    message = 'unk'
  }

  if (breakBefore) logStream.write('\n')
  logStream.write(`[${new Date().toISOString().slice(11, 19)}] ${col.unstyle(message)}\n`)
}

function logError(params, breakBefore = false) {
  console.error(params)
  log(params, breakBefore)
}

function logInfo(params, breakBefore = false) {
  console.log(params)
  log(params, breakBefore)
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
