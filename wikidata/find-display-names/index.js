const ProgressBar = require('progress')
const fs = require('fs')

const { db, pgp } = require('../dbconn')
const dbSchema = process.env.DB_SCHEMA

const { executeSparql, sleep } = require('../util');

const getLabels = async () => {
    // const r1 = await db.any(`select distinct local_name from properties where display_name = '' and local_name like 'P%' ;`)
    const missing = await db.any(`select 
        p.local_name as local_name, 
        p.iri as iri, 
        p.dn2,
        ns.name as pref_name 
        from ${dbSchema}.properties p 
        join ns on p.ns_id = ns.id 
        where dn2 is null 
        and iri like 'http://www.wikidata.org%'`)

    console.log(missing[0])
    console.log(missing.length)
    // process.exit(0)

    const CHUNK_SIZE = 1000;
    let OFFSET = 0;

    const answers = []

    while (OFFSET < missing.length) {
        console.log('OFFSET=', OFFSET)
        let valuePart = missing.slice(OFFSET, OFFSET + CHUNK_SIZE).map(x => `${x.pref_name}:${x.local_name}`).join(' ')

        let query = `
        PREFIX p: <http://www.wikidata.org/prop/>
        PREFIX wdt: <http://www.wikidata.org/prop/direct/>
        PREFIX wdno: <http://www.wikidata.org/prop/novalue/>
        PREFIX pq: <http://www.wikidata.org/prop/qualifier/>
        PREFIX pqv: <http://www.wikidata.org/prop/qualifier/value/>
        PREFIX pr: <http://www.wikidata.org/prop/reference/>
        PREFIX prv: <http://www.wikidata.org/prop/reference/value/>
        PREFIX ps: <http://www.wikidata.org/prop/statement/>
        PREFIX psv: <http://www.wikidata.org/prop/statement/value/>
        PREFIX psn: <http://www.wikidata.org/prop/statement/value-normalized/>
        PREFIX pqn: <http://www.wikidata.org/prop/qualifier/value-normalized/>
        PREFIX prn: <http://www.wikidata.org/prop/reference/value-normalized/>
        PREFIX wdtn: <http://www.wikidata.org/prop/direct-normalized/>
 
        SELECT DISTINCT ?property ?x ?xLabel WHERE {
            VALUES ?property { ${valuePart} }
            SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
            ?x ( wikibase:directClaim | wikibase:claim | wikibase:novalue | wikibase:qualifier | wikibase:qualifierValue | wikibase:qualifierValueNormalized | wikibase:reference | wikibase:referenceValue | wikibase:referenceValueNormalized | wikibase:statementProperty | wikibase:statementValue | wikibase:statementValueNormalized | wikibase:directClaimNormalized ) ?property.
           }`
        // console.log(query)

        let r2 = await executeSparql(query, { operation: 'postDirect'})
        answers.push(r2)

        // break;
        await sleep(10_000)

        OFFSET += CHUNK_SIZE;
    }

    const answersFlat = answers.flat()
    fs.writeFileSync('answers-flat4.json', JSON.stringify(answersFlat, null, 2))

    return answersFlat;
}

const work = async () => {
    // const answersFlat = await getLabels()
    // process.exit(0)

    const answers = require('./answers-flat4.json')

    let progress = new ProgressBar('[:bar] ( :current display_name no :total, :percent (:elapsed s/:eta s) )', { total: answers.length, width: 100, incomplete: '.' });

    for (let one of answers) {
        let propIri = one.property.value; // http://www.wikidata.org/prop/P826
        let label = one.xLabel.value;

        let sql = `update ${dbSchema}.properties set dn2 = $2 where iri = $1`; 
        await db.none(sql, [propIri, label])

        progress.tick()
    }
}

work().then(console.log).catch(console.error)