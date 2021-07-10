const db = require('./db')
const debug = require('debug')('dss:classops')

const { 
    executeSPARQL,
    getClassProperties,
} = require('../../util/sparql/endpoint-queries')

const { 
    parameterExists,
} = require('./utilities')


const MAX_ANSWERS = 100;


/* list of properties */
const getSchemaProperties = async (sName) => {
	const sk = await db.any(`SELECT count(*) FROM ${sName}.properties`);
    const r = await db.any(`SELECT  * FROM ${sName}.v_properties_ns order by cnt desc LIMIT $1`, [MAX_ANSWERS]);
	return {data: r, complete: sk[0].count <= MAX_ANSWERS};
}

/* list of class properties */
const getSchemaClassProperties = async (sName, uriClass) => {
	const clInfo = await db.any(`SELECT * FROM ${sName}.classes WHERE iri = $1`, [uriClass]);
	let propList = ""; 
	let sk = 0;
	console.log(clInfo)
	//console.log(clInfo.length)
	if ( clInfo[0].props_in_schema === true){
		//sk = await db.any(`select count(*) FROM ${sName}.v_cp_rels WHERE class_iri = $1`, [uriClass])[0].count;
		const xx = await db.any(`select count(*) FROM ${sName}.v_cp_rels WHERE class_iri = $1`, [uriClass])
		console.log(xx)
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
	
	//const sql = "SELECT * FROM " + sName + ".v_properties_ns  WHERE iri in " + propList +" order by cnt desc"
	const sql = "SELECT * FROM " + sName + ".properties  WHERE iri in " + propList +" order by cnt desc"
	const r = await db.any(sql);
	//const r = await db.any(`SELECT * FROM ${sName}.v_properties_ns  WHERE iri in $1 order by cnt desc`, [propList]);	
			
	//const sk = await db.any(`SELECT count(*) FROM ${sName}.v_properties_ns WHERE namestring ~ $1`, [filter]);
    //const r = await db.any(`SELECT * FROM ${sName}.v_classes_ns  WHERE namestring ~ $2 order by cnt desc LIMIT $1`, [MAX_ANSWERS, filter]);
	//return {data: r, complete: sk[0].count <= MAX_ANSWERS};
	return {data:r, complete: sk <= MAX_ANSWERS}
}

const getProperties = async (schema, params) => {
	let r = {}
	if ( parameterExists(params, "uriClass") )
		r = await getSchemaClassProperties(schema, params.uriClass)
	else  
		r = await getSchemaProperties(schema)
	return r
}

module.exports = {
getProperties,
}