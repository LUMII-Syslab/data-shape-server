const debug = require('debug')('registry')
const col = require('ansi-colors')

const { v4: uuidv4 } = require('uuid');

const { DB_CONFIG, db } = require('../config');

const registrySchema = process.env.REGISTRY_SCHEMA || 'public';
const overrideExistingRegistry = (process.env.OVERRIDE_REGISTRY || '').toLowerCase() === 'true' 
        || (process.env.OVERRIDE_EXISTING || '').toLowerCase() === 'true';

const checkDisplayNameExists = async schemaDisplayName => {
    let exists = false;
    const checkRegistry = await db.any(`select * from ${registrySchema}.schemata where display_name = $1`, [schemaDisplayName]);
    if (checkRegistry.length > 0) {
        console.log(`Registry entry with display name ${col.green(schemaDisplayName)} already exists`)
        exists = true;
    }
    return exists;
}

const findUnusedDisplayNameFor = async baseDisplayName => {
    for (let suffix of ['_1', '_2', '_3']) {
        let candidate = `${baseDisplayName}${suffix}`;
        let exists = await checkDisplayNameExists(candidate);
        if (!exists) return candidate;
    }
    return uuidv4();
}

const registerImportedSchema = async (params) => {
    let { 
        db_schema_name, 
        display_name_default, 
        schema_description,

        endpoint_url,
        named_graph,
        endpoint_public_url,
        endpoint_type, 
    } = params;

    try {
        const ENDPOINT_SQL = `INSERT INTO ${registrySchema}.endpoints 
            (sparql_url, public_url, named_graph, endpoint_type) 
            VALUES ($1, $2, $3, $4) 
            -- ON CONFLICT ON CONSTRAINT endpoints_sparql_graph_unique
            ON CONFLICT (coalesce(sparql_url, '@@'), coalesce(named_graph, '@@'))
            DO UPDATE 
            SET public_url = $2, endpoint_type = $4
            RETURNING id`;

        const endpoint_id = (await db.one(ENDPOINT_SQL, [
            endpoint_url,
            endpoint_public_url,
            named_graph,
            endpoint_type,
        ])).id;

        // check if a suitable schemata entry already exists
        const CHECK_SCHEMA_SQL = `SELECT * FROM ${registrySchema}.schemata WHERE display_name = $1 AND db_schema_name = $2 AND endpoint_id = $3`;
        const probe = await db.any(CHECK_SCHEMA_SQL, [
            display_name_default,
            db_schema_name,
            endpoint_id,            
        ]);
        if (probe.length > 0) {
            console.log(`A reusable entry for (${display_name_default}, ${db_schema_name}, endpoint_id) exists; skip creating a new one`);
            return;
        }

        const displayNameExists = await checkDisplayNameExists(display_name_default);
        if (displayNameExists) {
            console.error(`Registry entry with display name ${col.green(display_name_default)} already exists`);
            display_name_default = await findUnusedDisplayNameFor(display_name_default);
            console.log(`Display name ${display_name_default} will be used instead`);
        }
    
        const SCHEMA_SQL = `INSERT INTO ${registrySchema}.schemata 
            (display_name, db_schema_name, description, endpoint_id, is_active, is_default_for_endpoint) 
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT ON CONSTRAINT schemata_display_name_unique
            DO UPDATE
            SET db_schema_name = $2, description = $3, endpoint_id = $4, is_active = $5, is_default_for_endpoint = $6`;
        
            await db.none(SCHEMA_SQL, [
            display_name_default,
            db_schema_name,
            schema_description,
            endpoint_id,
            true,
            true,
        ]);

    } catch (err) {
        console.error('error while registering the new schema in the registry');
        console.error(err);
    }

    console.log(`\nThe new schema "${col.yellow(display_name_default)} (${col.green(db_schema_name)})" has been added to the schema registry`);
}

module.exports = {
    registerImportedSchema,
}