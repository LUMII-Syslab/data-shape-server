const debug = require('debug')('dss:classops')
const db = require('./db')

const parameterExists = (parTree, par) => {
	let r = true;
	if ( parTree[par] === undefined || parTree[par] === '' || parTree[par].length == 0 )
		r = false;
	return r;
}

const getFilterColumn = params => {
	return ( parameterExists(params, 'filterColumn') ? params.filterColumn : 'namestring' );
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

const getClassByName = async (cName, schema) => {
	let r;
	if ( cName.includes(':')){
		const nList = cName.split(':');
		r = await db.any(`SELECT * FROM ${schema}.v_classes_ns WHERE display_name = $2 and prefix = $1 order by cnt desc limit 1`, [nList[0], nList[1]]);
	}
	else {
		const ns = await getLocalNamespace(schema);
		r = await db.any(`SELECT * FROM ${schema}.v_classes_ns WHERE display_name = $2 and prefix = $1 order by cnt desc limit 1`, [ns.name, cName]);
		if ( r.length === 0)
			r = await db.any(`SELECT * FROM ${schema}.v_classes_ns WHERE display_name = $1 order by cnt desc limit 1`, [cName]);
	}
	return r;
}

const getPropertyByName = async (pName, schema) => {
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
	
	return r;
}

const getSchemaObject = obj => {
	let r;

	if ( obj.length === 0 ) 
		r = {data: [], complete: false };
	else
		r = {data: obj, complete:true}
		
	return r;
}

const getSchemaData = async (sql, params) => {
	let complete = true;
	let r;
	console.log('--------executeSQL-----------------');
	console.log(sql);
	if ( parameterExists(params, 'filter'))	
		r = await db.any(sql, [params.limit+1, params.filter]);
	else
		r = await db.any(sql,[params.limit+1]);

	if ( r.length == params.limit+1 ){
		complete = false;
		r.pop();
	}
		
	return {data: r, complete: complete, params: params};
}

const getSchemaDataPlus = async (sql, sql2, params) => {
	let complete = true;
	let r;
	let r2;
	console.log('--------executeSQL-----------------');
	console.log(sql);
	if ( parameterExists(params, 'filter'))	
		r = await db.any(sql, [params.limit+1, params.filter]);
	else
		r = await db.any(sql,[params.limit+1]);
	
	if ( r.length == params.limit+1 ){
		complete = false;
		r.pop();
	}
	else {
		if (parameterExists(params, "onlyPropsInSchema") === false || params.onlyPropsInSchema === false) {
			console.log('--------executeSQL Plus-----------------');
			console.log(sql2);
			if ( parameterExists(params, 'filter'))	
				r2 = await db.any(sql2, [params.limit-r.length+1, params.filter]);
			else
				r2 = await db.any(sql2,[params.limit-r.length+1]);
			
			if ( r2.length == params.limit-r.length+1 ){
				complete = false;
				r2.pop();
			}
			r2.forEach(element => r.push(element));				
		}
	}
	return {data: r, complete: complete, params: params};
}

const formWherePart = (col, inT, list, listType) => {
	//console.log('------------------------------------------------------')
	let sep = "";
	if ( listType === 1) {
		list = list.map( x => x.toString().replace("'",""))  // TODO 
		sep = "'";
	}
	
	//console.log(listN.join(`${sep},${sep}`))
	return  ` ${col} ${inT} (${sep}${list.join(`${sep},${sep}`)}${sep})`;
}

const getIdsfromPList = async (schema, pList) => {
	let r = {in:[], out:[]}
	if ( parameterExists(pList, "in") ) {
		for (const element of pList.in) {
			const pr = await getPropertyByName(element.name, schema)
			if ( pr.length > 0 && pr[0].object_cnt > 0)
				r.in.push(pr[0].id);
		}	
	}
	
	if ( parameterExists(pList, "out") ) {
		for (const element of pList.out) {
			const pr = await getPropertyByName(element.name, schema)
			if ( pr.length > 0)
				r.out.push(pr[0].id);
		}	
	}
			
	return await r;
}

module.exports = {
	parameterExists,
	getFilterColumn,
	checkEndpoint,
	formWherePart,
	getClassByName,
	getPropertyByName,
	getSchemaData,
	getSchemaDataPlus,
	getSchemaObject,
	getIdsfromPList,
}