const fs = require('fs');
const ProgressBar = require('progress');

const db = require('../dbconn');

const { executeSparql } = require('../util');

const rowToObject = row => {
    let d = {};
    Object.entries(row).forEach(([key, value]) => {
        // console.log(`${key}: ${value.value} (${value.termType})`)
        d[key] = value.value;
    });
    return d;
}

const getAllClasses = async () => {
    console.time('1st');
    let classes = [];

    try {
        const CHUNK_SIZE = 100_000;
        let currentOffset = 0;
        let lastCount;
        do {
            console.time('2nd');
            console.log('offset:', currentOffset);
    
            const classesQuery = `
            select ?c ?cx where {
                select ?c (count(?x) as ?cx) where {?x a ?c} order by desc(?cx)
            }
            LIMIT ${CHUNK_SIZE}
            OFFSET ${currentOffset}
            `;
            const stream = await executeSparql(classesQuery);

            let interim = [];
            for await (let row of stream) {
                interim.push(rowToObject(row));
            }
            lastCount = interim.length;
            currentOffset += CHUNK_SIZE;
            classes = classes.concat(interim);
            interim = [];
            console.log('🔫', lastCount);
            console.timeEnd('2nd');
        }
        while (lastCount === CHUNK_SIZE);
    
    } catch (err) {
        console.error(err);
        return null;
    }

    console.timeEnd('1st');
    return classes;
}

const work = async () => {
    const classList = await getAllClasses();
    console.log(classList.length);
    // fs.writeFileSync('allClasses.json', JSON.stringify(allClasses, null, 2));

    let progress = new ProgressBar('[:bar] ( :current klases no :total, :percent )', { total: classList.length, width: 100, incomplete: '.' });

    console.time('save');
    for (let p of classList) {
      await db.none(`insert into ${dbSchema}.classes (iri, cnt) values ($1, $2)`, [p.c, p.cx]);
  
      progress.tick();
    }
    console.timeEnd('save');
  
};

work()
    .then(() => {
        console.log('Done');
    })
    .catch(err => console.error(err));
