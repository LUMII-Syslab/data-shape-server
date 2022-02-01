const fs = require('fs');
const ProgressBar = require('progress');

const { executeSparql, executeAsk } = require('../util');

const { db, pgp } = require('../dbconn');
const dbschema = process.env.DB_SCHEMA;

const classCache = new Map();
const unusedClasses = new Set();

const columnSet = new pgp.helpers.ColumnSet(['class_1_id', 'class_2_id', 'type_id'], {table: { schema: dbschema, table: 'cc_rels'}});

let pairBuffer = []
const CHUNK_SIZE = 500

const flushBuffer = async () => {
    if (pairBuffer.length === 0) return;
    const sql = pgp.helpers.insert(pairBuffer, columnSet);

    try {
        await db.none(sql);
    } catch (err) {
        console.error('error, executing sql', sql);
        console.error(err);
    }
    pairBuffer = [];
}

const addPair = async (pair) => {
    if (pair) {
        pairBuffer.push(pair)
    }
    if (pairBuffer.length >= CHUNK_SIZE || !pair) {
        await flushBuffer();
    }
}

const getSubclasses = async () => {
    console.log('get_subclasses')
    // const Q = 'select ?a ?b where {?a rdfs:subClassOf ?b} ';
    // const Q = 'select distinct ?b where {?a rdfs:subClassOf ?b. filter (?b != owl:Thing)} ';
    const Q = 'select distinct ?b where {?a rdfs:subClassOf ?b. } ';
    const r = await executeSparql(Q);
    console.log(r.length)
    console.log(r[0])

    let classBar = new ProgressBar('[:bar] ( :current virsklases no :total, :percent )', { total: r.length, width: 100, incomplete: '.' });
    const pairs = [];

    for (let supObj of r) {
        const supIri = supObj.b.value;
        const Q2 = `select distinct ?a where { ?a rdfs:subClassOf <${supIri}> }`;
        const r2 = await executeSparql(Q2);
        for (let subObj of r2) {
            let subIri = subObj.a.value;
            pairs.push([subIri, supIri]);
        }

        classBar.tick();
    }

    return pairs;
}

const work = async () => {
    try {

        // const pairs = require('./pairs.json')
        let pairs = await getSubclasses();

        console.log(pairs.length);
        fs.writeFileSync('pairs.json', JSON.stringify(pairs, null, 2));

        let cl = await db.many(`select * from ${dbschema}.classes`);
        console.log(cl.length);
        console.log(cl[0]);

        for (let row of cl) {
            classCache.set(row.iri, row.id)
        }
        cl = null;
        console.log(classCache.size);

        let pairsBar = new ProgressBar('[:bar] ( :current sub-super pāri no :total, :percent )', { total: pairs.length, width: 100, incomplete: '.' });

        for (let p of pairs) {
            const class_1_id = classCache.get(p[0]);
            const class_2_id = classCache.get(p[1]);
            if (!class_1_id) {
                // console.log('bad class 1', p[0])
                unusedClasses.add(p[0]);
                continue;
            }
            if (!class_2_id) {
                // console.log('bad class 2', p[1])
                unusedClasses.add(p[1]);
                continue;
            }

            pairsBar.tick();

            await addPair({ class_1_id, class_2_id, type_id: 1 });
        }
        await addPair();

        fs.writeFileSync('unusedClasses.json', JSON.stringify(Array.from(unusedClasses), null, 2))

    } catch (err) {
        console.error(err)
    }
}

work().then(console.log).catch(console.error)
