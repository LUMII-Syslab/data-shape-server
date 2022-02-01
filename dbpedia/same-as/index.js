const fs = require('fs')
const ProgressBar = require('progress');

const { executeSparql, executeAsk } = require('../util');

const { db, pgp } = require('../dbconn');
const dbschema = process.env.DB_SCHEMA;

const check = async (iri1, iri2) => {
    // console.log('checking:', iri1, iri2)
    const C1_C2 = `ask {?x a <${iri1}>. OPTIONAL { ?x ?a ?value. FILTER (?value = <${iri2}>) } FILTER (!BOUND(?value)) }`;
    const C2_C1 = `ask {?x a <${iri2}>. OPTIONAL { ?x ?a ?value. FILTER (?value = <${iri1}>) } FILTER (!BOUND(?value)) }`;
    const r1 = await executeAsk(C1_C2);
    if (r1) return false;
    const r2 = await executeAsk(C2_C1);
    return !r2;
}

let NS = {};

// sameAs relation goes from the "weaker" namespace to the "stronger" one
// Strength in descending order: dbo yago foaf schema dul purl umbel wikidata (most important: wikidata is the last one)
const sortCandidates = cand => {
    const getNSPriority = ns_id => NS[ns_id]?.priority;
    cand.sort((a, b) => ((getNSPriority(a.ns_id) - getNSPriority(b.ns_id)) || (a.id - b.id)))
}

const test = async () => {
    let test1 = await check('http://dbpedia.org/ontology/Agent', 'http://www.ontologydesignpatterns.org/ont/dul/DUL.owl#Agent')
    console.log(test1)
    let test2 = await check('http://www.ontologydesignpatterns.org/ont/dul/DUL.owl#Agent', 'http://www.wikidata.org/entity/Q24229398')
    console.log(test2)
    let test3 = await check('http://www.wikidata.org/entity/Q24229398', 'http://dbpedia.org/ontology/Gymnast')
    console.log(test3)
    let test4 = await check('http://dbpedia.org/ontology/Gymnast', 'http://dbpedia.org/ontology/GolfPlayer')
    console.log(test4)

    return 'done';
}

const work = async () => {
    try {
        const ns = await db.many(`select * from ${dbschema}.ns`);
        for (let row of ns) {
            NS[row.id] = row;
        }

        const classes = await db.many(`select * from ${dbschema}.classes order by cnt desc`);
        console.log(`${classes.length} classes loaded`);
        
        let by_cnt = {}
        for (let c of classes) {
            if (!by_cnt[c.cnt]) {
                by_cnt[c.cnt] = { }
            }
            if (by_cnt[c.cnt][c.ns_id]) {
                by_cnt[c.cnt][c.ns_id].push(c)
            } else {
                by_cnt[c.cnt][c.ns_id] = [c]
            }
        }

        for (let n in by_cnt) {
            let n_number = Number.parseInt(n, 10)
            let obj = by_cnt[n];
            if (n_number < 10_000) {
                for (let ns in obj) {
                    if (obj[ns].length > 1) {
                        delete obj[ns]
                    }
                }
            }
            if (Object.keys(obj).length < 2) {
                delete by_cnt[n]
            }
        }

        fs.writeFileSync('dump3.json', JSON.stringify(by_cnt, null, 2))
        // const by_cnt = require('./dump3.json')

        let insertables = []
        let iri_pairs = []
        // let classBar = new ProgressBar('[:bar] ( :current skaiti no :total, :percent )', { total: Object.keys(by_cnt).length, width: 100, incomplete: '.' });
        for (let n in by_cnt) {
            let n_number = Number.parseInt(n, 10);
            let obj = by_cnt[n];
            // let candidates = Object.keys(obj).map(k => ({ id: obj[k][0].id, iri: obj[k][0].iri, ns_id: obj[k][0].ns_id })) // FIXME: pie 10K+ var buut [].length > 1
            let candidates = [];
            for (let ns in obj) {
                for (let c of obj[ns]) {
                    candidates.push(c);
                }
            }

            console.log(candidates)
            sortCandidates(candidates)

            for (let i1 = 0; i1 < candidates.length - 1; i1 += 1) {
                for (let i2 = i1+1; i2 < candidates.length; i2 += 1) {
                    if (n_number < 10_000) {
                        // additional conditions must hold:
                        // a) The classes C and D are from different namespaces CN and DN
                        // b) There is no other class in the namespaces CN and DN wit the same instance count
                        // both satisfied because deal breakers have been deleted in the cleanup step

                    }
                    let sameAs = await check(candidates[i1].iri, candidates[i2].iri)
                    if (sameAs) {
                        let insertable = {
                            class_1_id: candidates[i1].id,
                            class_2_id: candidates[i2].id,
                            type_id: 2,
                        }
                        // console.log(insertable);
                        // console.log('sameAs:', candidates[i1].iri, candidates[i2].iri);

                        insertables.push(insertable)
                        iri_pairs.push([candidates[i1].iri, candidates[i2].iri])
                    }
                }
            }
            // classBar.tick();
        }
        fs.writeFileSync('sameAs-results2.json', JSON.stringify(insertables, null, 2));
        fs.writeFileSync('sameAs-pairs2.json', JSON.stringify(iri_pairs, null, 2));

    } catch(err) {
        console.error(err)
    }
}

work().then(console.log).catch(console.error)
