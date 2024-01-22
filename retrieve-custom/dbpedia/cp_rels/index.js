// const fs = require('fs');
const ProgressBar = require('progress');

const { executeSparql } = require('../util');

const CLASSES_CHUNK = 10;

const { db, pgp } = require('../dbconn');
const dbschema = process.env.DB_SCHEMA;

const columnSet = new pgp.helpers.ColumnSet(['class_id', 'property_id', 'type_id', 'cnt', 'object_cnt'], {table: 'cp_rels'});

let cp_rel_buffer = []
const add_cp_rel = (class_id, property_id, type_id, cnt, object_cnt) => {
    cp_rel_buffer.push({class_id, property_id, type_id, cnt, object_cnt})
}
const flush_cp_rel_buffer = async () => {
    if (cp_rel_buffer.length === 0) return;
    const sql = pgp.helpers.insert(cp_rel_buffer, columnSet);

    try {
        await db.none(sql);
    } catch (err) {
        console.error('error, executing sql', sql);
        console.error(err);
    }
    cp_rel_buffer = [];
}

const prop2id = new Map();

const work = async () => {
    const cc_count = await db.one(`select count(*) from ${dbschema}.classes 
    where (ns_id is null or ns_id <> 1115) 
    and not props_in_schema`)
    console.log(cc_count.count)

    const cc = await db.any(`select * from ${dbschema}.classes 
        where (ns_id is null or ns_id <> 1115)
        and not props_in_schema 
        and iri !~ '"'
        order by id desc 
        limit ${CLASSES_CHUNK}`)
    // console.table(cc)
    console.log(`apstrādāšanai atlasītas ${cc.length} klases`);

    let pp = await db.any(`select * from ${dbschema}.properties order by id`)
    for (let p of pp) {
        prop2id.set(p.iri, p.id)
    }
    pp = null;

    let progress = new ProgressBar('[:bar] ( :current klases no :total, :percent (:elapsed s/:eta s) )', { total: cc.length, width: 100, incomplete: '.' });

    // loop over cc
    // katrai c paprasa
    for (let c of cc) {
        // TODO: what to do with double quotes in local name part of iri?
        if (c.iri.includes('"')) {
            progress.tick();
            continue;
        } 

        try {
            // console.log(c.iri)
            const class_id = c.id;

            // 1
            const sparql1 = `select ?p (count(distinct ?x) as ?cx) where {?x a <${c.iri}>. ?x ?p ?y} order by desc(?cx)`;
            const results1 = await executeSparql(sparql1);

            const cntMap = new Map();
            const objectCntMap = new Map();
            for (let row of results1) {
                // insert into cp_rels
                // (class_id, property_id, type_id (1 -  incoming, 2 - outgoing), cnt, object_cnt [, data_cnt], )
                // unique constraint: cp_rels_class_id_property_id_type_id_key

                let property_id;
                try {
                    property_id = prop2id.get(row.p.value)
                } catch (err) {
                    console.log('🍏 jauna propertija', row.p.value);
                    continue;
                }
                if (!property_id) {
                    console.log('neatradu prop:', row.p.value);
                    continue;
                };
                cntMap.set(property_id, row.cx.value);
            }

            // 1a; keys will be a subset of keys in 1
            const sparql1a = `select ?p (count(distinct ?x) as ?cx) where {?x a <${c.iri}>. ?x ?p ?y. filter isURI(?y)} order by desc(?cx)`;
            const results1a = await executeSparql(sparql1a);

            for (let row of results1a) {
                let property_id;
                try {
                    property_id = prop2id.get(row.p.value)
                } catch (err) {
                    console.log('new property', row.p.value);
                    continue;
                }
                if (!property_id) {
                    console.log('prop not found:', row.p.value);
                    continue;
                };
                objectCntMap.set(property_id, row.cx.value);
            }
            
            for (const [property_id, cnt] of cntMap) {
                const object_cnt = objectCntMap.get(property_id) || 0;

                add_cp_rel(c.id, property_id, 2, cnt, object_cnt)
            }
            // await flush_cp_rel_buffer();

            const sparql2 = `select ?p (count(distinct ?x) as ?cx) where {?x a <${c.iri}>. [] ?p ?x} order by desc(?cx)`;
            const results2 = await executeSparql(sparql2);

            for (let row of results2) {
                let property_id;
                try {
                    property_id = (await db.one(`select id from ${dbschema}.properties where iri = $1`, [row.p.value])).id;
                } catch (err) {
                    console.log('new property', row.p.value);
                    continue;
                }
                if (!property_id) {
                    console.log('prop not found:', row.p.value);
                    continue;
                };

                add_cp_rel(c.id, property_id, 1, row.cx.value, row.cx.value);
            }
            await flush_cp_rel_buffer();

            // all done; set c.props_in_schema to true
            await db.none(`update ${dbschema}.classes set props_in_schema = true where iri = $1`, [c.iri]);

        } catch (err) {
            console.error(err)
        }

        progress.tick();
    }

}

work().then(console.log).catch(console.error);
