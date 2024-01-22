const fs = require('fs');
const ProgressBar = require('progress');

const { executeSparql } = require('../util');

const db = require('../dbconn');
const dbSchema = process.env.DB_SCHEMA;

const getProperties = async () => {

  try {

    console.time('1st');
    const SPARQL_GET_ALL_PROPS = `select ?p (count(?x) as ?cp) where { ?x ?p []} order by desc(?cp)`;
    const results = await executeSparql(SPARQL_GET_ALL_PROPS);

    const outputData = results.map(_ => ({ p: _.p.value, cp: _.cp.value }));

    console.timeEnd('1st');
    
    return outputData;

  } catch (err) {
    console.error(err);
    return [];
  }

};

const getPropertyValueTypes = async (allProps) => {

  try {
    console.time('1st');

    let progress = new ProgressBar('[:bar] ( :current property types of :total, :percent )', { total: allProps.length, width: 100, incomplete: '.' });

    let outputData = [];

    for (let propObj of allProps) {
      const prop = propObj.p;

      const QUERIES = {
        // total: `select (count(?x) as ?cx) where { ?x <${prop}> []}`,
        // total_d: `select (count(distinct ?x) as ?cx) where { ?x <${prop}> []}`,
        // Q1b: `select (count(distinct ?x) as ?cx) where { ?x <${prop}> []}`,

        // isIRI: `select (count(distinct ?x) as ?cx) where { ?x <${prop}> ?y . filter isIRI(?y)}`,
        // isIRI: `select (count(?x) as ?cx) where { ?x <${prop}> ?y . filter isIRI(?y)}`,
        // Q2b: `select (count(?x) as ?cx) where { ?x <${prop}> ?y . filter isIRI(?y)}`,

        isURI: `select (count(?x) as ?cx) where { ?x <${prop}> ?y . filter isURI(?y)}`,
        // isURI_d: `select (count(distinct ?x) as ?cx) where { ?x <${prop}> ?y . filter isURI(?y)}`,

        // isNumeric: `select (count(?x) as ?cx) where { ?x <${prop}> ?y . filter isNumeric(?y)}`,
        // isNumeric_d: `select (count(distinct ?x) as ?cx) where { ?x <${prop}> ?y . filter isNumeric(?y)}`,

        isLiteral: `select (count(?x) as ?cx) where { ?x <${prop}> ?y . filter isLiteral(?y)}`,
        // isLiteral_d: `select (count(distinct ?x) as ?cx) where { ?x <${prop}> ?y . filter isLiteral(?y)}`,

        // isBlank: `select (count(?x) as ?cx) where { ?x <${prop}> ?y . filter isBlank(?y)}`,
        // bound: `select (count(?x) as ?cx) where { ?x <${prop}> ?y . filter bound(?y)}`,
      }

      let R = { prop };
      try {
        for (let k in QUERIES) {
          const result = await executeSparql(QUERIES[k]);
          R[k] = result[0].cx.value;
        }
        outputData.push(R);
      }
      catch(err) {
        R.error = err.message;
        outputData.push(R);
      }

      progress.tick();
    }

    console.timeEnd('1st');
    return outputData;

  } catch (err) {
    console.error(err);
    return [];
  }

};

const work = async () => {
  const allProps = await getProperties();
  console.log('Result length:', allProps.length);
  // fs.writeFileSync('allProps.json', JSON.stringify(allProps, null, 2));

  const propValueTypes3 = await getPropertyValueTypes(allProps);
  const propValueTypes = {}

  for (let pvt of propValueTypes3) {
    propValueTypes[pvt.prop] = pvt;
  }

  let saveProgress = new ProgressBar('[:bar] ( :current properties saved of :total, :percent )', { total: allProps.length, width: 100, incomplete: '.' });
  console.time('save');
  for (let p of allProps) {
    await db.none(`insert into ${dbSchema}.properties (iri, cnt, object_cnt) values ($1, $2, $3)`, [p.p, p.cp, propValueTypes[p.p].isURI]);

    saveProgress.tick();
  }
  console.timeEnd('save');

}

work()
    .then(d => {
        console.log('Done');
    })
    .catch(err => console.error(err));
