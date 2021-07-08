const db = require('./db')
const debug = require('debug')('dss:classops')

const { 
    executeSPARQL,
    getClassProperties,
} = require('../../util/sparql/endpoint-queries')

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

/* list of classes */
const getSchemaClasses = async (sName) => {
	const sk = await db.any(`SELECT count(*) FROM ${sName}.classes`);
    const r = await db.any(`SELECT  * FROM ${sName}.v_classes_ns_main order by cnt desc LIMIT $1`, [MAX_ANSWERS]);
	return {data: r, complete: sk[0].count <= MAX_ANSWERS};
}

/* filtered list of classes */
const getSchemaClassesFiltered = async (sName, filter) => {
	const sk = await db.any(`SELECT count(*) FROM ${sName}.v_classes_ns WHERE namestring ~ $1`, [filter]);
    const r = await db.any(`SELECT * FROM ${sName}.v_classes_ns  WHERE namestring ~ $2 order by cnt desc LIMIT $1`, [MAX_ANSWERS, filter]);
	return {data: r, complete: sk[0].count <= MAX_ANSWERS};
}

/* list of properties */
const getSchemaProperties = async (sName) => {
	const sk = await db.any(`SELECT count(*) FROM ${sName}.properties`);
    const r = await db.any(`SELECT  * FROM ${sName}.v_properties_ns order by cnt desc LIMIT $1`, [MAX_ANSWERS]);
	return {data: r, complete: sk[0].count <= MAX_ANSWERS};
}

/* list of class properties */
const getSchemaClassProperties = async (sName, uriClass) => {
	const clInfo = await db.any(`SELECT * FROM ${sName}.classes WHERE iri = $1`, [uriClass]);
	let propList = "('http://xmlns.com/foaf/0.1/primaryTopic', 'http://dbpedia.org/property/address', 'http://dbpedia.org/property/sponsors')"; 
	let sk = 0;
	//console.log(clInfo)
	//console.log(clInfo.length)
	if ( clInfo[0].props_in_schema === true){
		sk = await db.any(`select count(*) FROM ${sName}.v_cp_rels WHERE class_iri = $1`, [uriClass])[0].count;
		const pList =  await db.any(`select property_iri FROM ${sName}.v_cp_rels WHERE class_iri = $2 order by cnt desc LIMIT $1`, [MAX_ANSWERS, uriClass]);
		const pString = pList.map(x => x.property_iri).join("','")
		propList = "('" + pString + "')";
	}
	else {
		const p = await getClassProperties("https://dbpedia.org/sparql", uriClass, false, MAX_ANSWERS);
		sk = p.map(x => x.value).length;
		const pString = p.map(x => x.value).join("','")
		propList = "('" + pString + "')";
		//const sparql = "select distinct ?x where {?x a " + uriClass +". [] ?p ?x} limit 100"
	}
	
	const sql = "SELECT * FROM " + sName + ".v_properties_ns  WHERE iri in " + propList +" order by cnt desc"
	const r = await db.any(sql);
	//const r = await db.any(`SELECT * FROM ${sName}.v_properties_ns  WHERE iri in $1 order by cnt desc`, [propList]);	
			
	//const sk = await db.any(`SELECT count(*) FROM ${sName}.v_properties_ns WHERE namestring ~ $1`, [filter]);
    //const r = await db.any(`SELECT * FROM ${sName}.v_classes_ns  WHERE namestring ~ $2 order by cnt desc LIMIT $1`, [MAX_ANSWERS, filter]);
	//return {data: r, complete: sk[0].count <= MAX_ANSWERS};
	return {data:r, complete: sk <= MAX_ANSWERS}
}

const getOntologyNameSpaces = async ontName => {
	const r = await db.any(`select  id, name, priority, (select count(*) from ${ontName}.classes where ns_id = ns.id  ) cl_count from ${ontName}.ns where priority > 0`);
    return r;
}

module.exports = {
	getOntologyNameSpaces,
    getOntologyClasses,
    getOntologyClassesFiltered,
	getSchemaClasses,
	getSchemaClassesFiltered,
	getSchemaProperties,
	getSchemaClassProperties,
}