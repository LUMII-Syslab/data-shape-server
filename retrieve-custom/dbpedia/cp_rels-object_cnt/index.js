const SparqlClient = require('sparql-http-client/ParsingClient');
const pgp = require('pg-promise')()
const ProgressBar = require('progress')

const config = require('../config-pg')
const db = pgp(config.DB_CONFIG)

// const ENDPOINT_URL = 'http://85.254.199.72:8899/sparql';
const ENDPOINT_URL = 'http://dbpedia.org/sparql';

const client = new SparqlClient({ endpointUrl: ENDPOINT_URL });

const propsMap = new Map()

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const getSparqlResults = async baseSparql => {
    let result = null
    let LIMIT = 10_000
    let OFFSET = 0

    let propRows;
    do {
        let sparql = `${baseSparql} limit ${LIMIT} offset ${OFFSET}`
        propRows = await client.query.select(sparql)

        result = result ? result.concat(propRows) : propRows

        if (propRows && propRows.length < LIMIT) {
            if (result.length > LIMIT) {
                console.log(`Vaicājumam ${baseSparql} atbildes garums ir ${result.length}`)
            }
            return result
        }

        await sleep(1000)
        console.log(baseSparql, OFFSET, result.length)
        OFFSET += LIMIT

    } while (true)

}

const workForOne = async CLASS_ID => {

    const props = await db.many(`select * from ${config.DB_SCHEMA}.properties`)
    console.log(`${props.length} props loaded`)
    for (let p of props) {
        propsMap.set(p.iri, p.id)
    }

    const classes = await db.many(`select * from ${config.DB_SCHEMA}.classes where props_in_schema order by cnt asc`)
    console.log(`${classes.length} classes loaded`)

    const cl = classes.find(x => x.id === CLASS_ID)
    console.log(cl)

    const c_id = cl.id

    try {
        // const sparql = `select count(?x) as ?cnt, ?p where { ?x ?p ?y . ?x a <${cl.iri}> . filter(isIRI(?y)) } group by ?p order by desc(?p)`
        const sparql = `select count(?x) as ?cnt, ?p where { ?x ?p ?y . ?x a <${cl.iri}> . filter(isIRI(?y)) } group by ?p`

        // const propRows = await client.query.select(sparql)
        const propRows = await getSparqlResults(sparql)
        console.log(`${propRows.length} gara atbilde uz ${sparql}`)

        let propsBar = new ProgressBar(`[:bar] ( :current props no :total, :percent)`, { total: propRows.length, width: 100, incomplete: '.' });

        for (let row of propRows) {
            const o_cnt = row.cnt.value

            const p_iri = row.p.value
            const p_id = propsMap.get(p_iri)

            try {
                await db.none(`update ${config.DB_SCHEMA}.cp_rels set object_cnt = ${o_cnt} where class_id = $1 and property_id = $2 and type_id = $3`, [c_id, p_id, 2])

            } catch (err) {
                console.error('SQL error:', err)
                continue
            }
            propsBar.tick()
        }

    } catch (err) {
        console.error('SPARQL error:', err)
    }

}

const workForAll = async () => {
    const props = await db.many(`select * from ${config.DB_SCHEMA}.properties`)
    console.log(`${props.length} props loaded`)
    for (let p of props) {
        propsMap.set(p.iri, p.id)
    }

    const classes = await db.many(`select * from ${config.DB_SCHEMA}.classes where props_in_schema order by cnt asc`)
    console.log(`${classes.length} classes loaded`)

    // console.log(classes.length)
    // console.log(classes[0])

    let n_class = 1;
    // let classBar = new ProgressBar('[:bar] ( :current klases no :total, :percent )', { total: classes.length, width: 100, incomplete: '.' });
    for (const cl of classes) {
        // if (n_class <= 12) {
        //     n_class += 1
        //     continue
        // }

        const c_id = cl.id

        try {
            // const sparql = `select count(?x) as ?cnt, ?p where { ?x ?p ?y . ?x a <${cl.iri}> . filter(isIRI(?y)) } group by ?p order by desc(?p)`
            const sparql = `select count(?x) as ?cnt, ?p where { ?x ?p ?y . ?x a <${cl.iri}> . filter(isIRI(?y)) } group by ?p`
            const propRows = await client.query.select(sparql)
            await sleep(3000)

            let propsBar = new ProgressBar(`[:bar] ( :current props no :total, :percent {${n_class}})`, { total: propRows.length, width: 100, incomplete: '.' });

            // console.log(rows.length, rows[0].cnt.value, cl.cnt, rows[0].p.value)
            for (let row of propRows) {
                const o_cnt = row.cnt.value

                const p_iri = row.p.value
                const p_id = propsMap.get(p_iri)

                try {
                    await db.none(`update ${config.DB_SCHEMA}.cp_rels set object_cnt = ${o_cnt} where class_id = $1 and property_id = $2 and type_id = $3`, [c_id, p_id, 2])

                } catch (err) {
                    console.error('SQL error:', err)
                    continue
                }
                propsBar.tick()
            }

            // classBar.tick()

        } catch (err) {
            console.error('SPARQL error:', err)
            continue
        }

        n_class += 1
    }
}

// const work = workForAll;
// const work = workForOne;
const work = async () => {
    // await workForAll()
    await workForOne(3)

    // const r = await getSparqlResults('select count(?x) as ?cnt, ?p where { ?x ?p ?y . ?x a <http://www.w3.org/2002/07/owl#Thing> . filter(isIRI(?y)) } group by ?p')
    // console.log(r.length)
}

work().then(console.log).catch(console.error).finally(() => console.log('Done'))
