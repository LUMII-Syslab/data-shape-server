const fs = require('fs');
const col = require('ansi-colors');
const SparqlClient = require('sparql-http-client/ParsingClient');
const ProgressBar = require('progress');
const debug = require('debug')('pp');

const { executeSparql } = require('../util');

const SKIP_LARGER_THAN = 500_000;
const BATCH_SIZE = 100;

const BIG_VALUE = 2_147_483_647;

const { db, pgp } = require('../dbconn');
const dbSchema = process.env.DB_SCHEMA;

const NESANACA = 'nesanaca.json';
const nesanaca = [];

const NESANACA_S = 'nesanaca-simple.json';
const nesanaca_s = [];

const PROTOCOL = 'details.log';

const LOGFILES = [ NESANACA, NESANACA_S ];
const traceFile = fs.createWriteStream(PROTOCOL, { encoding: 'utf8', flags: 'a' });
const trace = txt => {
  debug(txt);
  traceFile.write(new Date().toISOString());
  traceFile.write(' ');
  traceFile.write(txt);
  traceFile.write('\n');
}

const columnSet = new pgp.helpers.ColumnSet(['property_1_id', 'property_2_id', 'type_id', 'cnt'], { table: 'pp_rels' });
let ppBuffer = [];
const addPPrel = async (property_1_id, property_2_id, type_id, cnt) => {
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

const atStart = async () => {
  for (const fn of LOGFILES) {
    try {
      fs.unlinkSync(fn);
    } catch(err) {}
  }
  trace('started at:', new Date());
}

const isDataProperty = propObj => propObj.object_cnt === 0;
// const isDataProperty = propObj => propObj.object_cnt / propObj.cnt < 0.05 ;

// const isObjectProperty = propObj => propObj.data_cnt === 0;

const propIri2id = new Map();

const FIRST_ID = 1;
const LAST_ID = 200;

const work = async () => {

  try {
    const allProps = await db.many(`select * from ${dbSchema}.properties order by id desc`);
    trace(`Ielasiju ${allProps.length} propertijas`);

    for (let pObj of allProps) {
      propIri2id.set(pObj.iri, pObj.id);
    }

    let progress = new ProgressBar('[:bar] ( :current properties of :total, :percent )', { total: allProps.length, width: 100, incomplete: '.' });

    await atStart();

    console.log('Processing range', FIRST_ID, LAST_ID);

    let n = 0;
    for (let p1Obj of allProps) {
      let p1 = p1Obj.iri;
      let p1_id = p1Obj.id;

      if (p1Obj.id < FIRST_ID || p1Obj.id >= LAST_ID) {
        // await sleep(1);
        progress.tick();
        continue;
      }

      // if (p1Obj.object_cnt > SKIP_LARGER_THAN) continue;
      if (p1Obj.object_cnt <= SKIP_LARGER_THAN) continue;

      n += 1;
      if (isDataProperty(p1Obj)) continue;

      // a)
      // const QUERY1 = `select ?p2 (count(?x) as ?cx) where { { select ?x where { [] <${p1}> ?x . filter(isURI(?x)) } } ?x ?p2 [] } group by ?p2 order by desc(?cx)`;

      // b)
      // let countLimit = (p1Obj.object_cnt < 100 || p1Obj.object_cnt < 0.4 * p1Obj.cnt) ? `limit ${p1Obj.object_cnt} ` : '';
      // const QUERY1 = `select ?p2 (count(?x) as ?cx) where { { select ?x where { [] <${p1}> ?x . filter(isURI(?x)) } ${countLimit} } ?x ?p2 [] } group by ?p2 order by desc(?cx)`;

      // c)
      const QUERY1 = `select ?p2 (count(?x) as ?cx) where { [] <${p1}> ?x . ?x ?p2 [] } group by ?p2 order by desc(?cx)`;

      let keyStart = Date.now();
      try {
        const result = await executeSparql(QUERY1);
        trace(`prop ${p1} (${p1Obj.id}) transitive success, ${Date.now() - keyStart}ms`);

        for (let row of result) {
          let p2 = row.p2.value;
          let p2_id = propIri2id.get(p2);
          if (!p2_id) {
            console.log(`Neatpazīta propertija ${p2}`);
            continue;
          }

          await addPPrel(p1_id, p2_id, 1, row.cx.value);
        }

      } catch (err) {
        trace(`prop ${p1} (${p1Obj.id}) transitive fail, ${Date.now() - keyStart}ms; falling back to p1-p2`);
        nesanaca.push({ prop: p1, k: 'transitive', msg: err.message });

        fs.writeFileSync(NESANACA, JSON.stringify(nesanaca, null, 2));

        // fallback uz prasīšanu pa vienai p2; pie tam var neprasīt otrreiz tām (Inc, Outg), kas ir jau bijušas no otra gala
        for (let p2Obj of allProps) {
          let p2 = p2Obj.iri;
          let p2_id = p2Obj.id;

          let QUERY2 = `select (count(?x) as ?cx) where { [] <${p1}> ?x . ?x <${p2}> [] .}`;
          let pairStart;
          try {
            pairStart = Date.now();
            const result2 = await executeSparql(QUERY2);
            trace(`pair ${p1} (${p1Obj.id}) transitive ${p2} (${p2Obj.id}) success, ${Date.now() - pairStart}ms`);

            if (!result2 || result2.length === 0) continue;

            const ppCount = result2[0].cx.value;
            if (ppCount === '0') continue;

            await addPPrel(p1_id, p2_id, 1, ppCount);
          } catch(err) {
            trace(`pair ${p1} transitive ${p2} (${p2Obj.id}) fail, ${Date.now() - pairStart}ms`);
            console.error(err)
            console.log('simple SPARQL also failed');
            nesanaca_s.push({ p1, p2, k: 'transitive', msg: err.message});
            fs.writeFileSync(NESANACA_S, JSON.stringify(nesanaca_s, null, 2));
            await addPPrel(p1_id, p2_id, 1, BIG_VALUE);
          }
          // ...

        }
      }

      progress.tick();
    }

    await addPPrel(0);

    fs.writeFileSync(NESANACA, JSON.stringify(nesanaca, null, 2));
    fs.writeFileSync(NESANACA_S, JSON.stringify(nesanaca_s, null, 2));
    return [nesanaca, nesanaca_s];

  } catch (err) {
    console.error(err);
    return [[], []];
  }

};

work()
    .then(d => {
        const [nesanaca, nesanaca_s] = d;
        console.log('problem count:', nesanaca.length, nesanaca_s.length);
        // console.log(nesanaca);

        if (nesanaca.length > 0) {
          fs.writeFileSync('nesanaca1.txt', JSON.stringify(nesanaca, null, 2), { flags: 'a' })
        }

        // console.log(Object.keys(store.incoming).length, Object.keys(store.outgoing).length, Object.keys(store.transitive).length);

        traceFile.end();
        console.log('Done');
    })
    .catch(console.error);
