const debug = require('debug')('dss:classops')
const db = require('./db')

const parameterExists = (parTree, par) => {
	let r = true;
	if ( parTree[par] === undefined || parTree[par] === '' || parTree[par].length == 0 )
		r = false;
	return r;
}

const isValue = val => {
	let r = true
	if ( val === undefined || val === null || val === '' || val.length == 0 )
		r = false;
	return r;
}

const getValue = val => {
	let r
	if ( val === undefined || val === null || val === '' || val.length == 0 )
		r = '';
	else
		r = val;
	return r;
}

const isEndpointUrl = params => { return isValue(params.main.endpointUrl);}
const getEndpointUrl = params => { return getValue(params.main.endpointUrl);}
const setEndpointUrl = (params, val) => {
	params.main.endpointUrl = val;
	return params;
}
const isFilter = params => { return isValue(params.main.filter); }
const getFilter = params => { return getValue(params.main.filter); }
const getFilterColumn = params => { 
	r = 'namestring';
	if (isValue(params.main.filterColumn))
		r = getValue(params.main.filterColumn)
	return r;
}
const getLimit = params => { return getValue(params.main.limit); }
const getName = params => { return getValue(params.main.name); }
const getTreeMode = params => { return getValue(params.main.treeMode); }
const isNamespaces = params => { return isValue(params.main.namespaces);}
const isInNamespaces = params => { return isValue(params.main.namespaces.in);}
const isNotInNamespaces = params => { return isValue(params.main.namespaces.notIn);}
const getInNamespaces = params => { return getValue(params.main.namespaces.in);}
const getNotInNamespaces = params => { return getValue(params.main.namespaces.notIn);}
const isOnlyPropsInSchema = params => { return isValue(params.main.onlyPropsInSchema);}
const isUriIndividual = ( params, poz = 0) => {
	if ( poz === 0 && isValue(params.element) && isValue(params.element.uriIndividual)) 
		return true;
	if ( poz === 1 && isValue(params.elementOE) && isValue(params.elementOE.uriIndividual)) 
		return true;
	return false;
}
const getUriIndividual = ( params, poz = 0) => {
	let r;
	if ( poz === 0 && isValue(params.element) ) 
		r = getValue(params.element.uriIndividual);
	if ( poz === 1 && isValue(params.elementOE) ) 
		r = getValue(params.elementOE.uriIndividual);
		
	r = r.replace('dbr:','http://dbpedia.org/resource/');
	r = r.replace('dbc:','http://dbpedia.org/resource/Category:');
	r = r.replace('rdf:','http://www.w3.org/1999/02/22-rdf-syntax-ns#');
	r = r.replace('xsd:','http://www.w3.org/2001/XMLSchema#');
	r = r.replace('owl:','http://www.w3.org/2002/07/owl#');
	r = r.replace('en_wiki:','http://en.wikipedia.org/wiki/');	
	
	
	if (r.substring(0,7) === 'http://')
		r = `<${r}>`;
	return r;
}
const clearUriIndividual = ( params, poz = 0) => {
	if ( poz === 0 ) 
		params.element.uriIndividual = '';
	if ( poz === 1 ) 
		params.elementOE.uriIndividual = '';
	return params;
}
const getClassId = (params) => {
	if ( isValue(params.element) ) 
		return getValue(params.element.classId);
	return '';
}
const isClassName = ( params, poz = 0) => {
	if ( poz === 0 && isValue(params.element) && isValue(params.element.className)) 
		return true;
	if ( poz === 1 && isValue(params.elementOE) && isValue(params.elementOE.className)) 
		return true;
	return false;
}
const getClassName = ( params, poz = 0) => {
	if ( poz === 0 && isValue(params.element) ) 
		return getValue(params.element.className);
	if ( poz === 1 && isValue(params.elementOE) ) 
		return getValue(params.elementOE.className);
	return '';
}
const isPList = ( params, poz = 0) => {
	if ( poz === 0 && isValue(params.element) && isValue(params.element.pList)) 
		return true;
	if ( poz === 1 && isValue(params.elementOE) && isValue(params.elementOE.pList)) 
		return true;
	return false;
}
const getPList = ( params, poz = 0) => {
	if ( poz === 0 && isValue(params.element) ) 
		return getValue(params.element.pList);
	if ( poz === 1 && isValue(params.elementOE)) 
		return getValue(params.elementOE.pList);
	return false;
}
const isPropertyKind = params => { return isValue(params.main.propertyKind); }
const getPropertyKind = params => { return getValue(params.main.propertyKind); }
const setPropertyKind = ( params, val) => { 
	params.main.propertyKind = val;
	return params; 
}
const isOrderByPrefix = params => { return isValue(params.main.orderByPrefix);}
const getOrderByPrefix = params => { return getValue(params.main.orderByPrefix);}

const checkEndpoint = async params => {
   // TODO find value in DB
	if ( !isEndpointUrl(params))
		params = setEndpointUrl(params, 'https://dbpedia.org/sparql');
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
	if ( isFilter(params))	
		r = await db.any(sql, [getLimit(params)+1, getFilter(params)]);
	else
		r = await db.any(sql,[getLimit(params)+1]);

	if ( r.length == getLimit(params)+1 ){
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
	if ( isFilter(params))	
		r = await db.any(sql, [getLimit(params)+1, getFilter(params)]);
	else
		r = await db.any(sql,[getLimit(params)+1]);
	
	if ( r.length == getLimit(params)+1 ){
		complete = false;
		r.pop();
	}
	else {
		if ( !isOnlyPropsInSchema(params)) {
			console.log('--------executeSQL Plus-----------------');
			console.log(sql2);
			if ( isFilter(params))	
				r2 = await db.any(sql2, [getLimit(params)-r.length+1, getFilter(params)]);
			else
				r2 = await db.any(sql2,[getLimit(params)-r.length+1]);
			
			if ( r2.length == getLimit(params)-r.length+1 ){
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
		list = list.map( x => x.toString().replace("'","''"))
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

const getUrifromPList = async (schema, pList) => {
	let r = {in:[], out:[]}
	if ( parameterExists(pList, "in") ) {
		for (const element of pList.in) {
			const pr = await getPropertyByName(element.name, schema)
			if ( pr.length > 0 && pr[0].object_cnt > 0)
				r.in.push(pr[0].iri);
		}	
	}
	
	if ( parameterExists(pList, "out") ) {
		for (const element of pList.out) {
			const pr = await getPropertyByName(element.name, schema)
			if ( pr.length > 0)
				r.out.push(pr[0].iri);
		}	
	}
			
	return await r;
}

const getNsWhere = params => {
	let whereList = [];
	if (isInNamespaces(params))
		whereList.push(formWherePart('v.prefix', 'in', getInNamespaces(params), 1));
	if (isNotInNamespaces(params))
		whereList.push(formWherePart('v.prefix', 'not in', getNotInNamespaces(params), 1));
	return whereList.join(' and ');
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
	getUrifromPList,
	isFilter,
	getFilter,
	getLimit,
	getName,
	isNamespaces,
	isInNamespaces,
	getEndpointUrl,
	isUriIndividual,
	getUriIndividual,
	clearUriIndividual,
	getClassId,
	isClassName,
	getClassName,
	getNsWhere,
	getTreeMode,
	isPropertyKind, 
	getPropertyKind, 
	setPropertyKind, 
	isOrderByPrefix,
	getOrderByPrefix,
	isPList,
	getPList,
}