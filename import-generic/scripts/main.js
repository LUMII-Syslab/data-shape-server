const debug = require('debug')('main')
const col = require('ansi-colors')
const path = require('node:path')
const fs = require('node:fs').promises

const { importFromJSON } = require('./json-importer');
const { registerImportedSchema } = require('./schema-registrar');
const { calculateDisplayNames } = require('./display-name-calculator');

const { DB_CONFIG, db } = require('../config');

const DB_SCHEMA = process.env.DB_SCHEMA;

const registrySchema = process.env.REGISTRY_SCHEMA || 'public';

const overrideExistingSchema = (process.env.OVERRIDE_DB_SCHEMA || '').toLowerCase() === 'true'
  || (process.env.OVERRIDE_EXISTING || '').toLowerCase() === 'true';

const withoutConfirmation = (process.env.WITHOUT_CONFIRMATION || '').toLowerCase() === 'true'

const EMPTY_SCHEMA = 'empty'

// const zxMode = !!$
let zxMode = false
if (typeof $ !== 'undefined') zxMode = true
console.log(`zx mode is ${zxMode}`)

const testDbConnection = async () => {
  try {
    let ns = await db.any(`select * from empty.ns limit 1`);
    return true;
  } catch (err) {
    return false;
  }
}

const checkSchemaExists = async schemaName => {
  const checkSchema = await db.any('select * from information_schema.schemata where schema_name = $1', [schemaName]);
  if (checkSchema.length === 1) {
    return true;
  }
}

const dropSchema = async (schemaName, withoutConfirmation = false) => {
  if (!withoutConfirmation) {
    console.log(`Data schema ${schemaName} will be deleted and replaced with a new version`);
    const confirm = await question('Are you sure (y/N)?');
    if (!['y', 'yes'].includes(confirm.toLowerCase())) return false;
  }

  console.log(`Dropping old schema ${schemaName}...`);
  try {
    await db.none(`drop schema if exists ${schemaName} cascade;`);
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

const createSchema = async schemaName => {
  // dump empty to file
  await $`pg_dump -E UTF8 -h ${DB_CONFIG.host} -p ${DB_CONFIG.port} -U ${DB_CONFIG.user} -n empty -f ${EMPTY_SCHEMA}.sql -d ${DB_CONFIG.database} `;

  // rename empty to schemaName
  await $`psql -h ${DB_CONFIG.host} -p ${DB_CONFIG.port} -U ${DB_CONFIG.user} -d ${DB_CONFIG.database} -c "alter schema ${EMPTY_SCHEMA} rename to ${schemaName}"`

  // reload empty from file
  await $`psql -h ${DB_CONFIG.host} -p ${DB_CONFIG.port} -U ${DB_CONFIG.user} -f ${EMPTY_SCHEMA}.sql -d ${DB_CONFIG.database}`;
}

const testSetup = async () => {
  const connectionOK = await testDbConnection();
  if (!connectionOK) {
    console.error('DB connection not OK. Fix it, then retry');
    process.exit(1);
  } else {
    console.log('DB connection OK');
  }

  if (zxMode) {

    if (os.type() === 'Windows_NT') {
      $.prefix = '';
      $.shell = 'Powershell';
    }

    try {
      echo('checking psql ...')
      await $`psql -V`
      echo('psql OK')
    } catch (err) {
      console.error(err);
      console.error('psql could not be found; exiting');
      process.exit(1);
    }
    try {
      echo('checking pg_dump ...')
      await $`pg_dump -V`
      echo('pg_dump OK')
    } catch (err) {
      console.error(err);
      console.error('pg_dump could not be found; exiting');
      process.exit(1);
    }
  }

  return true;
}

async function* enumerateFiles(folderPath, extension = 'json') {
  try {
    const files = await fs.readdir(folderPath)
    const myFiles = files.filter(file => path.extname(file).toLowerCase() === extension)
  } catch (err) {
    console.error(`Cannot read the folder ${folderPath}`)
    process.exit(1)
  }

  for (const file of myFiles) {
    try {
      const filePath = path.join(folderPath, file)
      const data = await fs.readFile(filePath, { encoding: 'utf-8' })
      const jsonData = JSON.parse(data)

      yield { fileName: file, content: jsonData }

    } catch(err) {
      console.error(`Cannot read the file ${file} from ${folderPath}`)
      process.exit(1)
    }
  }
}

const doImportOneFile = async (jsonFilePath, schemaNameParam) => {
  let fileName = path.parse(jsonFilePath).name
  let schemaName = schemaNameParam ?? fileName

  if (!schemaName) {
    console.error('Schema name not provided, exiting');
    process.exit(1);
  }
  if (schemaName === 'empty') {
    console.error('You cannot import into schema "empty"');
    process.exit(1);
  }
  if (schemaName === 'public' || schemaName === registrySchema) {
    console.error('You cannot import into the registry schema');
    process.exit(1);
  }

  const dbSchemaExists = await checkSchemaExists(schemaName);
  if (zxMode) {
    if (dbSchemaExists) {
      if (overrideExistingSchema) {
        let dropped = await dropSchema(schemaName, withoutConfirmation);
        if (!dropped) {
          console.error(`Existing schema ${col.red(schemaName)} could not be dropped; exiting`);
          process.exit(1);
        }
      } else {
        console.error(`DB schema ${schemaName} already exists, overriding is not permitted, exiting`);
        process.exit(1);
      }
    }
    try {
      await createSchema(schemaName);
    } catch (err) {
      console.error(`Schema ${schemaName} could not be created; exiting`)
      process.exit(1)
    }
  } else {
    // manual mode; assuming that an empty target schema already has been set up
    if (!dbSchemaExists) {
      console.error('In the manual mode, an empty schema has to be set up before import');
      process.exit(1);
    }
    try {
      const dbSchemaIsEmpty = await db.any(`select * from ${schemaName}.classes limit 1`);
      if (dbSchemaIsEmpty.length > 0) {
        console.error(`Looks like the schema ${schemaName} is not empty; exiting`);
        process.exit(1);
      }
    } catch (err) {
        console.error(`Cannot access the schema ${schemaName}; exiting`);
        process.exit(1);
    }
  }

  // now an empty schema should exist
  console.log(`Everything OK, proceeding to the import from JSON to DB schema ${schemaName}`);

  let data, effectiveParams;
  try {
    data = require(jsonFilePath);
  } catch (err) {
    console.error(`Could not read data from '${jsonFilePath}'; exiting`);
    process.exit(1);
  }
  try {
    effectiveParams = await importFromJSON(data);
  } catch (err) {
    console.error('Error while importing data from JSON to DB schema');
    console.error(err);
    process.exit(1);
  }

  if ((process.env.CALCULATE_DISPLAY_NAMES ?? '').toLocaleLowerCase() === 'true') {
    await calculateDisplayNames();
  }

  await registerImportedSchema(effectiveParams);

}

const doImport = async () => {
  const setupIsOK = await testSetup()

  if (!setupIsOK) {
    console.error('Setup is not OK, exiting')
    process.exit(1)
  }

  if (process.env.INPUT_FOLDER) {
    // TODO: iterēt pa visiem *.json norādītajā mapē;
    // katram taisīt doImportOneFIle(filePath)
    console.log(col.red('folder import is not implemented yet...'))

  } else if (process.env.INPUT_FILE) {
    const filePath = path.join(__dirname, process.env.INPUT_FILE)
    let dbSchema = DB_SCHEMA.includes('%FILE%')
      ? DB_SCHEMA.replace('%FILE%', path.parse(filePath).name)
      : DB_SCHEMA
    await doImportOneFile(filePath, dbSchema)
  } else {
    console.error(`Either INPUT_FILE or INPUT_FOLDER must be provided.`);
    process.exit(1);
  }


  return 'done';
}

doImport().then(console.log).catch(console.error);
