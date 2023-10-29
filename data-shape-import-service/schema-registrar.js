const debug = require('debug')('registry')
const col = require('ansi-colors')

const { v4: uuidv4 } = require('uuid');

const { DB_CONFIG, db } = require('./config');

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

    const displayNameExists = await checkDisplayNameExists(display_name_default);
    if (displayNameExists) {
        console.error(`Registry entry with display name ${col.green(display_name_default)} already exists`);
        display_name_default = await findUnusedDisplayNameFor(display_name_default);
        console.log(`Display name ${display_name_default} will be used instead`);
    }
 
    try {
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
        
            await db.none(SCHEMA_SQL, [
            display_name_default,
            db_schema_name,
            schema_description,
            endpoint_id,
            true,
            true,
        ]);

    } catch (err) {
        console.error(err);
    }

    console.log(`The new schema "${col.yellow(display_name_default)} (${col.green(db_schema_name)})" has been added to the schema registry`);
}

module.exports = {
    registerImportedSchema,
}