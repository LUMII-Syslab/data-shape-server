const debug = require('debug')('registry')
const col = require('ansi-colors')

const { DB_CONFIG, db } = require('./config');

const registrySchema = process.env.REGISTRY_SCHEMA || 'public';
const overrideExistingRegistry = (process.env.OVERRIDE_REGISTRY || '').toLowerCase() === 'true' 
        || (process.env.OVERRIDE_EXISTING || '').toLowerCase() === 'true';

const checkRegistryEntriesExist = async schemaName => {
    let exists = false;
    const checkRegistry = await db.any(`select * from ${registrySchema}.schemata where db_schema_name = $1`, [schemaName]);
    if (checkRegistry.length > 0) {
        console.log(`Registry entry for schema ${col.green(schemaName)} already exists`)
        exists = true;
    }
    const checkRegistry2 = await db.any(`select * from ${registrySchema}.schemata_to_endpoints where display_name = $1`, [schemaName]);
    if (checkRegistry2.length > 0) {
        console.log(`Registry entry with display name ${col.green(schemaName)} already exists`)
        exists = true;
    }
    return exists;
}

const dropRegistryEntries = async schemaName => {
    try {
        await db.none(`delete from ${registrySchema}.schemata where db_schema_name = $1;`, [ schemaName ]);
        await db.none(`delete from ${registrySchema}.schemata_to_endpoints where display_name = $1;`, [ schemaName ]);
        return true;
    } catch (err) {
        console.error(err);
        return false;
    }
}

const registerImportedSchema = async (params) => {

    const { 
        schema_name, 
        display_name_default, 
        description,
        endpoint_url,
        named_graph,
        endpoint_public_url,
        endpoint_type, 
    } = params;

    const registryEntriesExist = await checkRegistryEntriesExist(schema_name);

    if (registryEntriesExist && !overrideExistingRegistry) {
        console.error(`registry entries for the schema ${schema_name} already exist, overriding is not permitted, exiting`);
        process.exit(1);
    }
 
    try {
        let defaultTreeProfileName;
        try {
            defaultTreeProfileName = (await db.one(`SELECT id FROM ${registrySchema}.tree_profiles WHERE is_default`, [])).profile_name;
        } catch {
            console.error(`could not read the default tree profile name; using default`);
            defaultTreeProfileName = 'default';
        }

        const ENDPOINT_SQL = `INSERT INTO ${registrySchema}.endpoints 
            (sparql_url, public_url, named_graph, endpoint_type) 
            VALUES ($1, $2, $3, $4) 
            ON CONFLICT ON CONSTRAINT endpoints_sparql_graph_unique
            DO UPDATE 
            SET public_url = $2, endpoint_type = $4
            RETURNING id`;

        const endpoint_id = (await db.one(ENDPOINT_SQL, [
            endpoint_url,
            endpoint_public_url,
            named_graph,
            endpoint_type,
        ])).id;

        const SCHEMA_SQL = `INSERT INTO ${registrySchema}.schemata 
            (display_name, db_schema_name, description, endpoint_id, is_active, is_default_for_endpoint) 
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT ON CONSTRAINT schemata_display_name_unique
            DO UPDATE
            SET db_schema_name = $2, description = $3, endpoint_id = $4, is_active = $5, is_default_for_endpoint = $6`;
        
            await db.one(SCHEMA_SQL, [
            display_name_default,
            schema_name,
            description,
            endpoint_id,
            true,
            true,
        ]);

    } catch (err) {
        console.error(err);
    }

    console.log(`The new schema "${col.yellow(schema_name)}" has been added to the schema registry`);
}

module.exports = {
    registerImportedSchema,
}