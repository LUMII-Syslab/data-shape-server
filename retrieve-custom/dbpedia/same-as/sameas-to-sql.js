const fs = require('fs')

const data = require('./sameAs-results.json')

let sql = 'insert into dbpedia.cc_rels (class_1_id, class_2_id, type_id) \n values \n' +
data.map(x => `(${x.class_1_id}, ${x.class_2_id}, 2)`).join(',\n') + ';'

fs.writeFileSync('sameas.sql', sql)

