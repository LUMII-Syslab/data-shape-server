// const fs = require('fs');
const ProgressBar = require('progress');

const { executeSparql, executeAsk } = require('../util');

const { db, pgp } = require('../dbconn');
const dbschema = process.env.DB_SCHEMA;

// const columnSet = new pgp.helpers.ColumnSet(['class_id', 'property_id', 'type_id', 'cnt', 'object_cnt'], {table: 'cp_rels'});

let domainSql = `select aa.*, aa.iri as prop, c.iri as domain from (
    select p.id, p.iri, p.cnt,
    (select class_id from dbpedia.v_cp_rels v, dbpedia.classes c
     where property_id = p.id and v.type_id = 2 and v.class_id = c.id and c.id < 2500
     and v.cnt >= p.cnt
     and not exists
     (select * from cc_rels cc where cc.class_1_id = c.id and cc.type_id = 2)
     order by c.cnt limit 1) as classid
    from dbpedia.properties  p
    where p.cnt > 0 ) aa, dbpedia.classes c
    where classid = c.id
    order by aa.id `;


let rangeSql = `select aa.*, aa.iri as prop, c.iri as range from (
    select p.id, p.iri, p.cnt,
    (select class_id from dbpedia.v_cp_rels v, dbpedia.classes c
     where property_id = p.id and v.type_id = 1 and v.class_id = c.id
     and v.cnt >= p.cnt
     and not exists
    (select * from cc_rels cc where cc.class_1_id = c.id and cc.type_id = 2)
     order by c.cnt limit 1) as classid
    from dbpedia.properties p
    where p.cnt > 0 ) aa, dbpedia.classes c
    where classid = c.id
    order by aa.id
    `;

const testDomain = async (prop, domain) => {
    // const sparql0 = `select ?x where { graph <http://dbpedia.org> {?x <${prop}> []. OPTIONAL {?x a ?c. FILTER (?c = <${domain}>)} FILTER (!BOUND(?c))} } LIMIT 1`;
    // console.log(sparql0)
    // const result0 = await executeSparql(sparql0);
    // console.log(result0)
    // return result0.length > 0;

    const sparql2 = `ask { graph <http://dbpedia.org> {?x <${prop}> []. OPTIONAL {?x a ?c. FILTER (?c = <${domain}>)} FILTER (!BOUND(?c))} }`;
    // console.log(sparql2)
    const result = await executeAsk(sparql2);
    // console.log(result)
    return result;
}

const testRange = async (prop, range) => {
    // const sparql = `select ?x where { graph <http://dbpedia.org> {[] <${prop}> ?x. OPTIONAL {?x a ?c. FILTER (?c = <${range}>)} FILTER (!BOUND(?c))} } limit 1`;
    // const result = await executeSparql(sparql);
    // return result.length > 0;

    const sparql = `ask { graph <http://dbpedia.org> {[] <${prop}> ?x. OPTIONAL {?x a ?c. FILTER (?c = <${range}>)} FILTER (!BOUND(?c))} }`;
    const result = await executeAsk(sparql);
    return result;
}
    
const classIri2Id = new Map();
const propIri2Id = new Map();

const init = async () => {
    const cl = await db.many(`select id, iri from ${dbschema}.classes`);
    for (let x of cl) {
        classIri2Id.set(x.iri, x.id)
    }
    console.log(`${classIri2Id.size} classes mapped`);

    const pr = await db.many(`select id, iri from ${dbschema}.properties`);
    for (let x of pr) {
        propIri2Id.set(x.iri, x.id)
    }
    console.log(`${propIri2Id.size} props mapped`);
}

const workDomain = async () => {
    console.time('cand');
    const dbResult = await db.many(domainSql);
    console.timeEnd('cand');
    console.log(`${dbResult.length} candidates`);
    const positivePairs = [];
    let progress = new ProgressBar('[:bar] ( :current props of :total, :percent (:elapsed s/:eta s) )', { total: dbResult.length, width: 100, incomplete: '.' });
    for (let r of dbResult) {
        let { prop, domain } = r;
        let negative = await testDomain(prop, domain);
        progress.tick();

        if (negative) continue;

        positivePairs.push({ prop, domain});
    }
    console.log(`${positivePairs.length} positive pairs`);

    console.log('saving domains');
    let updateProgress = new ProgressBar('[:bar] ( :current props of :total, :percent (:elapsed s/:eta s) )', { total: positivePairs.length, width: 100, incomplete: '.' });
    for (let r of positivePairs) {
        let prop_id = propIri2Id.get(r.prop);
        let class_id = classIri2Id.get(r.domain);
        let sql = `update ${dbschema}.properties set domain_class_id = $1 where id = $2`;
        await db.none(sql, [class_id, prop_id]);
        updateProgress.tick();
    }
}

const workRange = async () => {
    console.time('cand');
    const dbResult = await db.many(rangeSql);
    console.timeEnd('cand');
    console.log(`${dbResult.length} candidates`);
    const positivePairs = [];
    let checkProgress = new ProgressBar('[:bar] ( :current props of :total, :percent (:elapsed s/:eta s) )', { total: dbResult.length, width: 100, incomplete: '.' });
    for (let r of dbResult) {
        let { prop, range } = r;
        let negative = await testRange(prop, range);
        checkProgress.tick();

        if (negative) continue;

        positivePairs.push({ prop, range});
    }
    console.log(`${positivePairs.length} positive pairs`);

    console.log('saving ranges');
    let updateProgress = new ProgressBar('[:bar] ( :current props of :total, :percent (:elapsed s/:eta s) )', { total: positivePairs.length, width: 100, incomplete: '.' });
    for (let r of positivePairs) {
        let prop_id = propIri2Id.get(r.prop);
        let class_id = classIri2Id.get(r.range);
        let sql = `update ${dbschema}.properties set range_class_id = $1 where id = $2`;
        await db.none(sql, [class_id, prop_id]);
        updateProgress.tick();
    }
}

const work = async () => {
    await init();
    // return 'test'
    await workRange();
    await workDomain();

    return 'Done';
}

work().then(console.log).catch(console.error)