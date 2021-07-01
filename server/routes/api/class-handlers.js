const db = require('./db')
const debug = require('debug')('dss:classops')

const MAX_ANSWERS = 100;

/* list of classes */
const getOntologyClasses = async ontName => {
    // seems there is no way to provide the schema name as a query parameter  
    // const r = await db.any('select iri, local_name from $1.classes limit 10', [ontName]);

    const r = await db.any(`select iri, display_name, cnt from ${ontName}.classes order by cnt desc limit $1`, [MAX_ANSWERS]);
	// debug('esmu te', r)
    return r;
}

/* filtered list of classes */
const getOntologyClassesFiltered = async (ontName, filter) => {
    // const r = await db.any(`SELECT iri, local_name FROM ${ontName}.classes WHERE iri ~ $2 LIMIT $1`, [MAX_ANSWERS, filter]);
	const sk = await db.any(`SELECT count(*) FROM ${ontName}.classes WHERE display_name ~ $1`, [filter]);
    const r = await db.any(`SELECT iri, display_name, local_name, cnt, (select name from ${ontName}.ns n where c.ns_id = n.id ) ns FROM ${ontName}.classes c WHERE display_name ~ $2 order by cnt desc LIMIT $1`, [MAX_ANSWERS, filter]);
	return {data: r, complete: sk[0].count <= MAX_ANSWERS};
    //return r.map(x => x.local_name);
}

const getOntologyNameSpaces = async ontName => {
	const r = await db.any(`select  id, name, priority, (select count(*) from ${ontName}.classes where ns_id = ns.id  ) cl_count from ${ontName}.ns where priority > 0`);
    return r;
}

module.exports = {
	getOntologyNameSpaces,
    getOntologyClasses,
    getOntologyClassesFiltered,
}