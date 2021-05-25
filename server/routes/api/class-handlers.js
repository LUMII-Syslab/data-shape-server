const db = require('./db')
const debug = require('debug')('dss:classops')

const MAX_ANSWERS = 20;

/* list of classes */
const getOntologyClasses = async ontName => {
    // seems there is no way to provide the schema name as a query parameter
    // const r = await db.any('select iri, local_name from $1.classes limit 10', [ontName]);     aaabbb

    const r = await db.any(`select iri, local_name from ${ontName}.classes limit $1`, [MAX_ANSWERS]);
    // debug('esmu te', r)
    return r.map(x => x.iri);
}

/* filtered list of classes */
const getOntologyClassesFiltered = async (ontName, filter) => {
    // const r = await db.any(`SELECT iri, local_name FROM ${ontName}.classes WHERE iri ~ $2 LIMIT $1`, [MAX_ANSWERS, filter]);
    const r = await db.any(`SELECT iri, local_name FROM ${ontName}.classes WHERE local_name ~ $2 LIMIT $1`, [MAX_ANSWERS, filter]);
    return r.map(x => x.local_name);
}

module.exports = {
    getOntologyClasses,
    getOntologyClassesFiltered,
}