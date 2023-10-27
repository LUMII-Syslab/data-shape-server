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
        let defaultTreeProfileId = 1;
        if (process.env.ENDPOINT_TYPE) {
            try {
                defaultTreeProfileId = (await db.one(`SELECT id FROM ${registrySchema}.tree_profiles WHERE is_default`, [])).id;
            } catch {
                defaultTreeProfileId = 1;
            }
        }

        const ENDPOINT_SQL = `INSERT INTO ${registrySchema}.endpoints 
            (sparql_url, public_url, named_graph, endpoint_type) 
            VALUES ($1, $2, $3, $4) 
            ON CONFLICT ON CONSTRAINT endpoints_sparql_graph_unique
            DO UPDATE 
            SET public_url = $2, named_graph = $3, endpoint_type = $4
            RETURNING id`;
        const endpoint_id = (await db.one(ENDPOINT_SQL, [
            endpoint_url,
            endpoint_public_url,
            named_graph,
            endpoint_type,
        ])).id;

        const SCHEMA_SQL = `INSERT INTO ${registrySchema}.schemata 
            (db_schema_name, description) 
            VALUES ($1, $2)
            ON CONFLICT ON CONSTRAINT schemata_name_unique
            DO UPDATE
            SET description = $2 
            RETURNING id`;
        const schema_id = (await db.one(SCHEMA_SQL, [
            schema_name,
            description,
        ])).id;

        const E2S_SQL = `INSERT INTO ${registrySchema}.schemata_to_endpoints 
            (schema_id, endpoint_id, display_name, is_active, tree_profile_id, is_default_for_endpoint) 
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT ON CONSTRAINT schemata_to_endpoints_display_name_unique
            DO UPDATE
            SET schema_id = $1, endpoint_id = $2, is_active = $4, tree_profile_id = $5, is_default_for_endpoint = $6`;
        await db.none(E2S_SQL, [
            schema_id,
            endpoint_id,
            display_name_default,
            true,
            defaultTreeProfileId,
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