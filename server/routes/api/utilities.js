const debug = require('debug')('dss:classops')
const db = require('./db')

const parameterExists = (parTree, par) => {
	let r = true;
	if ( parTree[par] === undefined || parTree[par] === "" || parTree[par].length == 0 )
		r = false;
	return r;
}

const checkEndpoint = async params => {
   // TODO find value in DB
	if ( params.endpointUrl === undefined )
		params.endpointUrl = 'https://dbpedia.org/sparql';
	return params;
}

const getLocalNamespace = async schema => {
	
	let r = await db.any(`SELECT * FROM ${schema}.ns WHERE is_local = true limit 1`);
	if ( r.length > 0)
		return r[0];
	
	r = await db.any(`SELECT * FROM ${schema}.ns order by priority desc limit 1`);
	if ( r[0].priorty > 0 )
		return r[0];
	
	r = await db.any(`SELECT *,( SELECT count(*) FROM ${schema}.classes where ns_id = ns.id ) ccnt FROM ${schema}.ns order by ccnt desc limit 1`);
	return r[0];
		
}

const getPorpertyByName = async (pName, schema) => {
	let r;
	if ( pName.includes(':')){
		const nList = pName.split(':');
		r = await db.any(`SELECT * FROM ${schema}.v_properties_ns WHERE display_name = $2 and prefix = $1 order by cnt desc limit 1`, [nList[0], nList[1]]);
	}
	else {
		const ns = await getLocalNamespace(schema);
		r = await db.any(`SELECT * FROM ${schema}.v_properties_ns WHERE display_name = $2 and prefix = $1 order by cnt desc limit 1`, [ns.name, pName]);
		if ( r.length === 0)
			r = await db.any(`SELECT * FROM ${schema}.v_properties_ns WHERE display_name = $1 order by cnt desc limit 1`, [pName]);
	}

	//console.log(r)
	return r;
}

const formWherePart = (col, inT, list, listType) => {
	
	let sep = "";
	if ( listType === 1)
			sep = "'";
	
	//list.join(`${sep},${sep}`)
	return  ` ${col} ${inT} (${sep}${list.join(`${sep},${sep}`)}${sep})`;
}

module.exports = {
	parameterExists,
	checkEndpoint,
	formWherePart,
	getPorpertyByName,
}