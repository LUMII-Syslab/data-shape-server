const fs = require('fs');
const col = require('ansi-colors');
const ProgressBar = require('progress');
const debug = require('debug')('ns');

const { db, pgp } = require('../dbconn');
const dbSchema = process.env.DB_SCHEMA;

const work = async () => {

    try {
        const ns = await db.many(`select * from ${dbSchema}.ns order by length(value) desc`);


        // properties
        let propProgress = new ProgressBar('[:bar] ( :current property namespaces of :total, :percent )', { total: ns.length, width: 100, incomplete: '.' });

        for (let nsObj of ns) {
            await db.none(`update properties 
            set ns_id = $1, local_name = substr(iri, 1 + length($2))
            where ns_id is null and iri like $3`,
                [
                    nsObj.id,
                    nsObj.value,
                    `${nsObj.value}%`
                ]);

            propProgress.tick();
        }

        // classes
        let classProgress = new ProgressBar('[:bar] ( :current class namespaces of :total, :percent )', { total: ns.length, width: 100, incomplete: '.' });

        for (let nsObj of ns) {
            await db.none(`update classes 
            set ns_id = $1, local_name = substr(iri, 1 + length($2))
            where ns_id is null and iri like $3`,
                [
                    nsObj.id,
                    nsObj.value,
                    `${nsObj.value}%`
                ]);

            classProgress.tick();
        }

        // annot types
        let atProgress = new ProgressBar('[:bar] ( :current annotation types namespaces of :total, :percent )', { total: ns.length, width: 100, incomplete: '.' });

        for (let nsObj of ns) {
            await db.none(`update annot_types 
            set ns_id = $1, local_name = substr(iri, 1 + length($2))
            where ns_id is null and iri like $3`,
                [
                    nsObj.id,
                    nsObj.value,
                    `${nsObj.value}%`
                ]);

            atProgress.tick();
        }


        return true;

    } catch (err) {
        console.error(err);
        return false;
    }
};

work()
    .then(d => {
        if (d) {
            console.log('Done')
        } else {
            console.log('not Done')
        }
    })
    .catch(console.error);
