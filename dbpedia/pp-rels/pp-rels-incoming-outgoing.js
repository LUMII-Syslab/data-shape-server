const fs = require('fs');
const col = require('ansi-colors');
const SparqlClient = require('sparql-http-client/ParsingClient');
const ProgressBar = require('progress');
const debug = require('debug')('pp');

const { executeSparql } = require('../util');

const SKIP_LARGER_THAN = 5_000_000;
const BATCH_SIZE = 100;

const BIG_VALUE = 2_147_483_647;

const { db, pgp } = require('../dbconn');
const dbSchema = process.env.DB_SCHEMA;

const store = { incoming: {}, outgoing: {}, transitive: {}}

const NESANACA = 'nesanaca.json';
const nesanaca = [];

const NESANACA_S = 'nesanaca-simple.json';
const nesanaca_s = [];

const PROTOCOL = 'details.log';

const LOGFILES = [ NESANACA, NESANACA_S ];
const traceFile = fs.createWriteStream(PROTOCOL, { encoding: 'utf8', flags: 'w' });
const trace = txt => {
  debug(txt);
  traceFile.write(new Date().toISOString());
  traceFile.write(' ');
  traceFile.write(txt);
  traceFile.write('\n');
  
}

const addToStore = (p1, p2, cnt, key) => {
  if (!store[key][p1]) store[key][p1] = {};
  store[key][p1][p2] = cnt;
}

const addToStoreX = (p1, p2, cnt, key) => {
  addToStore(p1, p2, cnt, key);
  if (key !== 'transitive') {
    // if (p1.id > p2.id) return; // nav vērts likt 2x; tas gan maz ko ietaupa
    addToStore(p2, p1, cnt, key);
  }
}

const saveStoreToDb = async () => {
  for (const [p1_id, p2_l] of Object.entries(store.transitive)) {
    for (const [p2_id, cnt] of Object.entries(p2_l)) {
      await addPPrel(p1_id, p2_id, 1, cnt);
    }
  }

  for (const [p1_id, p2_l] of Object.entries(store.outgoing)) {
    for (const [p2_id, cnt] of Object.entries(p2_l)) {
      await addPPrel(p1_id, p2_id, 2, cnt);
    }
  }

  for (const [p1_id, p2_l] of Object.entries(store.incoming)) {
    for (const [p2_id, cnt] of Object.entries(p2_l)) {
      await addPPrel(p1_id, p2_id, 3, cnt);
    }
  }

  await addPPrel(0);
}

const measureStore = () => {
  let n = 0;
  for (let [k1, v1] of Object.entries(store)) {
    for (let [k2, v2] of Object.entries(v1)) {
      n += Object.keys(v2).length;
    }
  }
  return n;
}

const columnSet = new pgp.helpers.ColumnSet(['property_1_id', 'property_2_id', 'type_id', 'cnt'], { table: 'pp_rels' });
let ppBuffer = [];
const addPPrel = async (property_1_id, property_2_id, type_id, cnt) => {
  // TODO:
  if (property_1_id > 0) {
    ppBuffer.push({ property_1_id, property_2_id, type_id, cnt});
  }

  if (ppBuffer.length >= BATCH_SIZE || property_1_id === 0) {
    const sql = pgp.helpers.insert(ppBuffer, columnSet);
    // console.log('@@', sql);
    try {
      await db.none(sql)
    } catch (err) {
      console.error(err)
    } finally {
      ppBuffer = [];
    }
  }
}

const reportMemory = tag => {
  trace(col.bgBlack(col.green(`\nMemory at ${tag}:`)));
  for (const [key, value] of Object.entries(process.memoryUsage())) {
    trace(`${key} : ${value / 1024 / 1024} MB`);
  }
  trace(`Store size: ${measureStore()}`);
}

const atStart = async () => {
  for (const fn of LOGFILES) {
    try {
      fs.unlinkSync(fn);
    } catch(err) {}
  }
  trace('started at:', new Date());
}

const isDataProperty = propObj => propObj.object_cnt === 0;
const isObjectProperty = propObj => propObj.data_cnt === 0;

const propIri2id = new Map();

const work = async () => {

  try {
    reportMemory('start');
    const allProps = await db.many(`select * from ${dbSchema}.properties order by id desc`);
    // const allProps = await db.many(`select * from ${dbSchema}.properties order by cnt desc`);
    // const allProps = await db.many(`select * from ${dbSchema}.properties order by cnt asc`);

    trace(`${allProps.length} properties loaded`);

    for (let pObj of allProps) {
      propIri2id.set(pObj.iri, pObj.id);
    }

    let progress = new ProgressBar('[:bar] ( :current properties of :total, :percent )', { total: allProps.length, width: 100, incomplete: '.' });

    await atStart();

    reportMemory('start 2');
    let n = 0;
    for (let p1Obj of allProps) {
      const propStart = Date.now();
      // if (n > 5) break; // for test

      let p1 = p1Obj.iri;
      let p1_id = p1Obj.id;
      // let n_prop = p1Obj.cnt;
      n += 1;

      // if (n <= 10) continue;
/*
      // console.log(n_prop);
      if (n_prop <= SKIP_LARGER_THAN) {
        // progress.tick();
        continue;
      }
*/
      const QUERIES = {
        // transitive: `select ?p2 (count(?x) as ?cx) where { { select distinct ?x where { [] <${p1}> ?x } } ?x ?p2 [] } group by ?p2 order by desc(?cx)`,
//        transitive: `select ?p2 (count(?x) as ?cx) where { { select ?x where { [] <${p1}> ?x . filter(isURI(?x)) } } ?x ?p2 [] } group by ?p2 order by desc(?cx)`,
        // incoming:  `select ?p2 (count(?x) as ?cx) where { { select distinct ?x where { [] <${p1}> ?x . filter(isURI(?x))} } [] ?p2 ?x } group by ?p2 order by desc(?cx)`,
        incoming:  `select ?p2 (count(?x) as ?cx) where { { select ?x where { [] <${p1}> ?x . filter(isURI(?x)) } } [] ?p2 ?x } group by ?p2 order by desc(?cx)`,
        // outgoing: `select ?p2 (count(?x) as ?cx) where { { select ?x where { ?x <${p1}> [] } } ?x ?p2 [] } group by ?p2 order by desc(?cx)`,
        outgoing: `select ?p2 (count(?x) as ?cx) where { { select ?x where { ?x <${p1}> [] } } ?x ?p2 [] } group by ?p2 order by desc(?cx)`,
      }

      let keyStart;
      for (let k in QUERIES) {
        if (isDataProperty(p1Obj) && k !== 'outgoing') continue;

        keyStart = Date.now();
        try {
          // throw new Error('test')
          // const result = await client.query.select(QUERIES[k]);
          const result = await executeSparql(QUERIES[k]);
          trace(`prop ${p1} ${k} success, ${Date.now() - keyStart}ms`);
          // console.log(k, result.length);
          for (let row of result) {
            let p2 = row.p2.value;
            if (p1 === p2 && k !== 'transitive') continue;
            let p2_id = propIri2id.get(p2);

            addToStoreX(p1_id, p2_id, row.cx.value, k);
          }
  
        } catch (err) {
          // console.error(k);
          // console.error(err);
          trace(`prop ${p1} ${k} fail, ${Date.now() - keyStart}ms; falling back to p1-p2`);
          nesanaca.push({ prop: p1, k, msg: err.message });

          fs.writeFileSync(NESANACA, JSON.stringify(nesanaca, null, 2));

          // fallback uz prasīšanu pa vienai p2; pie tam var neprasīt otrreiz tām (Inc, Outg), kas ir jau bijušas no otra gala
          for (let p2Obj of allProps) {
            if (isDataProperty(p2Obj) && k === 'incoming') continue;

            let p2 = p2Obj.iri;
            let p2_id = p2Obj.id;

            if (k === 'incoming' || k === 'outgoing') {
              if (p1 === p2) continue;
              if (p2Obj.id > p1Obj.id) continue;
            }

            let QUERY2;
            switch (k) {
              case 'incoming':
                // QUERY2 = `select (count(distinct ?x) as ?cx) where { [] <${p1}> ?x . [] <${p2}> ?x .}`;
                QUERY2 = `select (count(?x) as ?cx) where { [] <${p1}> ?x . [] <${p2}> ?x .}`;
                break;
              case 'outgoing':
                // QUERY2 = `select (count(distinct ?x) as ?cx) where { ?x <${p1}> [] . ?x <${p2}> [] .}`;
                QUERY2 = `select (count(?x) as ?cx) where { ?x <${p1}> [] . ?x <${p2}> [] .}`;
                break;
              case 'transitive':
                // QUERY2 = `select (count(distinct ?x) as ?cx) where { [] <${p1}> ?x . ?x <${p2}> [] .}`;
                QUERY2 = `select (count(?x) as ?cx) where { [] <${p1}> ?x . ?x <${p2}> [] .}`;
                break;
            }
            // console.log(QUERY2);
            let pairStart;
            try {
              // const result2 = await client.query.select(QUERY2);
              pairStart = Date.now();
              const result2 = await executeSparql(QUERY2);
              trace(`pair ${p1} ${k} ${p2} success, ${Date.now() - pairStart}ms`);
              // console.log(result2)

              if (!result2 || result2.length === 0) continue;

              const ppCount = result2[0].cx.value;
              // console.log(ppCount, typeof ppCount)
              if (ppCount === '0') continue;
              addToStoreX(p1_id, p2_id, ppCount, k);
            } catch(err) {
              trace(`pair ${p1} ${k} ${p2} fail, ${Date.now() - pairStart}ms`);
              console.error(err)
              console.log('simple SPARQL also failed');
              nesanaca_s.push({ p1, p2, k, msg: err.message});
              fs.writeFileSync(NESANACA_S, JSON.stringify(nesanaca_s, null, 2));
              addToStoreX(p1_id, p2_id, BIG_VALUE, k);
            }
            // ...

          }
        }

      }

      progress.tick();
      if (n % 1000 === 0) {
        reportMemory(`${n} steps`);
      }
    }

    await saveStoreToDb();

    return [store, nesanaca, nesanaca_s];

  } catch (err) {
    console.error(err);
    return [];
  }

};

work()
    .then(d => {
        const [store, nesanaca, nesanaca_s] = d;
        console.log('problem count:', nesanaca.length, nesanaca_s.length);
        // console.log(nesanaca);

        fs.writeFileSync(NESANACA, JSON.stringify(nesanaca, null, 2));
        fs.writeFileSync(NESANACA_S, JSON.stringify(nesanaca_s, null, 2));

        console.log(Object.keys(store.incoming).length, Object.keys(store.outgoing).length, Object.keys(store.transitive).length);

        traceFile.end();
        console.log('Done');
    })
    .catch(console.error);
