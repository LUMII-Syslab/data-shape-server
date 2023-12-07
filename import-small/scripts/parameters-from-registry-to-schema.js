const debug = require('debug')('registry')
const col = require('ansi-colors')

const { DB_CONFIG, db } = require('../config');

const registrySchema = process.env.REGISTRY_SCHEMA || 'public';

const MAGIC = 'magic123';

const isForbiddenSchema = schemaName => {
    if (schemaName.startsWith('pg_')) return true;
    if (schemaName.startsWith('public')) return true;
    if (schemaName.startsWith('empty')) return true;
    if (schemaName === 'information_schema') return true;
}

const createParametersTable = async schemaName => {
    console.log(`createParametersTabls in ${col.yellow(schemaName)}`);
    // return;
    const createTableSql = `CREATE TABLE IF NOT EXISTS ${schemaName}.parameters
    (
        order_inx numeric NOT NULL DEFAULT 999,
        name text COLLATE pg_catalog."default" NOT NULL,
        textvalue text COLLATE pg_catalog."default",
        jsonvalue jsonb,
        comment text COLLATE pg_catalog."default",
        id integer NOT NULL GENERATED ALWAYS AS IDENTITY ( INCREMENT 1 START 1 MINVALUE 1 MAXVALUE 2147483647 CACHE 1 ),
        CONSTRAINT parameters_pkey PRIMARY KEY (id),
        CONSTRAINT parameters_name_key UNIQUE (name)
    )
    `;
    await db.none(createTableSql);
    await db.none(`insert into ${schemaName}.parameters 
        (order_inx, name, textvalue, jsonvalue, comment)
        select order_inx, name, textvalue, jsonvalue, comment from empty.parameters 
        order by order_inx`);
}

const modernizeParametersTable = async schemaName => {
    console.log(`modernizeParametersTable in ${col.yellow(schemaName)}`);
    // return;
    await db.none(`delete from ${schemaName}.parameters where order_inx < 900;`);
    await db.none(`insert into ${schemaName}.parameters 
        (order_inx, name, textvalue, jsonvalue, comment)
        select order_inx, name, textvalue, jsonvalue, comment from empty.parameters 
        order by order_inx`);
}

const checkParametersTableExists = async schemaName => {
    let result = await db.any(`select * from information_schema.tables where table_schema = $1 and table_name = 'parameters';`, schemaName);
    return result.length > 0;
}

const migratePublicV1ToParams = async (schemaName, data) => {
    console.log(`migrating parameters for schema ${col.yellow(schemaName)}`);

    for (let pkey in data) {
        if (!data[pkey]) continue;

        if (typeof data[pkey] !== 'string') {
            await db.none(`update ${schemaName}.parameters
                set textvalue = null, jsonvalue = $1 
                where name = $2`, [
                    JSON.stringify(data[pkey]),
                    pkey,
            ]);

        } else {
            await db.none(`update ${schemaName}.parameters
                set textvalue = $1, jsonvalue = null 
                where name = $2`, [
                    data[pkey],
                    pkey,
            ]);

        }
        console.log(`setting ${pkey} to ${data[pkey]} (${typeof data[pkey]}) for schema ${schemaName}`);
    }
    console.log();
}

const work = async () => {
    const schemataSql = 'select schema_name from information_schema.schemata';
    const names = await db.any(schemataSql);
    let allowedSchemaNames = names.map(x => x.schema_name).filter(x => !isForbiddenSchema(x))

    console.log(allowedSchemaNames);

/*    
    const c2 = await db.any(`select table_schema, table_name from information_schema.tables where table_name = 'parameters'`);
    for (let row of c2) {
        let schemaName = row.table_schema;
        if (isForbiddenSchema(schemaName)) continue;
        console.log(`renaming ${schemaName}.parameters to parameters_bak`);

        await db.none(`alter sequence ${schemaName}.parameters_id_seq rename to parameters_bak_id_seq`);
        await db.none(`alter table ${schemaName}.parameters rename constraint parameters_pkey to parameters_bak_pkey`);
        await db.none(`alter table ${schemaName}.parameters rename constraint parameters_name_key to parameters_name_bak_pkey`);
        await db.none(`alter table ${schemaName}.parameters rename to parameters_bak`);
    }
*/

/*
    for (let schemaName of allowedSchemaNames) {
        await db.none(`drop table if exists ${schemaName}.parameters cascade`);
        await db.none(`alter schema ${schemaName} rename to ${MAGIC}`);

        // let command = `alter schema ${EMPTY_SCHEMA} rename to ${schemaName}`;
        console.log(`importing parameter table into ${MAGIC}.parameters for ${schemaName}`);
        await $`psql -h ${DB_CONFIG.host} -p ${DB_CONFIG.port} -U ${DB_CONFIG.user} ${DB_CONFIG.database} < sql/magic123_params.sql`

        await db.none(`alter schema ${MAGIC} rename to ${schemaName}`);
    }
*/

    for (let schemaName of allowedSchemaNames) {
        let exists = await checkParametersTableExists(schemaName);
        if (exists) {
            await modernizeParametersTable(schemaName);
            // break;
        } else {
            await createParametersTable(schemaName);
            // break;
        }
    }    

    const migrationBaseSql = `SELECT m.display_name AS display_name_default,
        s.description AS schema_description,
        e.sparql_url AS endpoint_url,
        e.named_graph,
        e.public_url AS endpoint_public_url,
        et.name AS endpoint_type,
        s.db_schema_name,
        s.schema_kind,
        ''::text AS instance_name_pattern,
        t.profile_name AS tree_profile_name,
        NOT m.hide_instances AS show_instance_tab,
            CASE
                WHEN s.has_instance_table THEN 'table'::text
                ELSE 'default'::text
            END AS instance_lookup_mode,
        s.has_pp_rels AND m.use_pp_rels AS use_pp_rels,
        e.direct_class_role,
        e.indirect_class_role
    FROM schemata_to_endpoints m
        JOIN schemata s ON m.schema_id = s.id
        JOIN endpoints e ON m.endpoint_id = e.id
        JOIN tree_profiles t ON m.tree_profile_id = t.id
        JOIN endpoint_types et ON e.endpoint_type_id = et.id;`;

    const migrationData = await db.many(migrationBaseSql);
    for (let row of migrationData) {
        if (allowedSchemaNames.includes(row.db_schema_name)) {
            await migratePublicV1ToParams(row.db_schema_name, row);
        }
    }

}

work().then(console.log).catch(console.error)