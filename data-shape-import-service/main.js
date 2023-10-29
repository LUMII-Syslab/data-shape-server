const debug = require('debug')('main')
const col = require('ansi-colors')

const { importFromJSON } = require('./json-importer');
const { registerImportedSchema } = require('./schema-registrar');

const { DB_CONFIG, db } = require('./config');

const schemaName = process.env.DB_SCHEMA;
const INPUT_FILE = process.env.INPUT_FILE;

const registrySchema = process.env.REGISTRY_SCHEMA || 'public';

const overrideExistingSchema = (process.env.OVERRIDE_DB_SCHEMA || '').toLowerCase() === 'true' 
        || (process.env.OVERRIDE_EXISTING || '').toLowerCase() === 'true';

const EMPTY_SCHEMA = 'empty'

const zxMode = !!$
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

const dropSchema = async schemaName => {
    console.log(`Data schema ${schemaName} will be deleted and replaced with a new version`);
    const confirm = await question('Are you sure (y/N)?');
    if (!['y', 'yes'].includes(confirm.toLowerCase())) return false;

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
    await $`pg_dump -h ${DB_CONFIG.host} -p ${DB_CONFIG.port} -U ${DB_CONFIG.user} -n empty ${DB_CONFIG.database} > ${EMPTY_SCHEMA}.sql`;

    // rename empty to schemaName
    await $`psql -h ${DB_CONFIG.host} -p ${DB_CONFIG.port} -U ${DB_CONFIG.user} ${DB_CONFIG.database} -c "alter schema ${EMPTY_SCHEMA} rename to ${schemaName}"`

    // reload empty from file
    await $`psql -h ${DB_CONFIG.host} -p ${DB_CONFIG.port} -U ${DB_CONFIG.user} ${DB_CONFIG.database} < ${EMPTY_SCHEMA}.sql`;
}

const doImport = async () => {
    const connectionOK = await testDbConnection();
    if (!connectionOK) {
        console.error('DB connection not OK. Fix it, then retry');
        process.exit(1);
    } else {
        console.log('DB connection OK');
    }

    if (zxMode) {
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
                let dropped = await dropSchema(schemaName);
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
        } catch(err) {
            console.error(`Schema ${schemaName} could not be created; exiting`)
            process.exit(1)
        }
    } else {
        // manual mode; assuming that an empty target schema already has been set up
        if (!dbSchemaExists) {
            console.error('In the manual mode, an empty schema has to be set up before import');
            process.exit(1);
        }
    }

    // now an empty schema should exist
    console.log(`Everything OK, proceeding to the import from JSON to DB schema ${schemaName}`);

    let data, effectiveParams;
    try {
        data = require(INPUT_FILE);
    } catch(err) {
        console.error(`Could not read data from '${INPUT_FILE}'; exiting`);
        process.exit(1);
    }
    try {
        effectiveParams = await importFromJSON(data);
    } catch(err) {
        console.error('Error while importing data from JSON to DB schema');
        console.error(err);
        process.exit(1);
    }
    
    await registerImportedSchema(effectiveParams);

    return 'done';
}

doImport().then(console.log).catch(console.error);
