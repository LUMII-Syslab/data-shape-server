const debug = require('debug')('dss:classops')
const db = require('./db')

// TODO: get this info from the db
const KNOWN_DATA = [ 
	{name: 'DBpedia', schema:'dbpedia', sparql_url: 'https://dbpedia.org/sparql', tree_profile: 'DBpedia', use_pp_rels: true, simple_prompt: false, hide_individuals: false, direct_role:'rdf:type', indirect_role:'' },
	{name: 'DBpedia_simple_prompt', schema:'dbpedia', sparql_url: 'https://dbpedia.org/sparql', tree_profile: 'DBpedia', use_pp_rels: true, simple_prompt: true, hide_individuals: false, direct_role:'rdf:type', indirect_role:'' },
	{name: 'Tweets_cov', schema:'tweets_cov', sparql_url: 'https://data.gesis.org/tweetscov19/sparql', tree_profile: 'DBpediaL', use_pp_rels: true, simple_prompt: false, hide_individuals: false, direct_role:'rdf:type', indirect_role:'' },
	{name: 'Europeana', schema:'europeana', sparql_url: 'http://sparql.europeana.eu/', tree_profile: 'Basic', use_pp_rels: false, simple_prompt: false, hide_individuals: false, direct_role:'rdf:type', indirect_role:'' },
	{name: 'Covid_On_The_Web', schema:'covid_on_the_web', sparql_url: 'https://covidontheweb.inria.fr/sparql', tree_profile: 'DBpediaL', use_pp_rels: false, simple_prompt: false, hide_individuals: false, direct_role:'rdf:type', indirect_role:'' },
	{name: 'Mini_university', schema:'mini_university', sparql_url: 'http://85.254.199.72:8890/sparql', named_graph: 'MiniUniv', tree_profile: 'BasicL', use_pp_rels: true, simple_prompt: false, hide_individuals: true, direct_role:'rdf:type', indirect_role:'' },
	{name: 'Mini_hospital', schema:'mini_hospital', sparql_url: 'http://185.23.162.167:8833/sparql', named_graph: 'MiniBkusEN_1', tree_profile: 'BasicL', use_pp_rels: true, simple_prompt: false, hide_individuals: true, direct_role:'rdf:type', indirect_role:'' },
	{name: 'Wikidata', schema:'wikidata', sparql_url: 'https://query.wikidata.org/sparql', tree_profile: 'BasicL', use_pp_rels: false, simple_prompt: false, hide_individuals: true, direct_role:'wdt:P31', indirect_role:'wdt:P279' },
]

const get_KNOWN_DATA = () => {
	return KNOWN_DATA;
}

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

const isPListI = params => { return isValue(params.element.pListI);}
const getPListI = params => { return params.element.pListI;}
const getIndividualMode = params => { return getValue(params.main.individualMode);}
const getSchemaName = params => { return getValue(params.main.schemaName);}
const getMakeLog = params => { return getValue(params.main.makeLog);}
const getDeferredProperties = params => { return getValue(params.main.deferred_properties);}
const getIsBasicOrder = params => { return getValue(params.main.basicOrder);}
const getSimplePrompt = params => { return getValue(params.main.simple_prompt);}
const getUsePP = params => { return getValue(params.main.use_pp_rels);}
const isEndpointUrl = params => { return isValue(params.main.endpointUrl);}
const getEndpointUrl = params => { return getValue(params.main.endpointUrl);}
const setEndpointUrl = (params, s) => {
	if ( s.named_graph != undefined && s.named_graph !== null && s.named_graph !== '' )
		params.main.endpointUrl = `${s.sparql_url}?default-graph-uri=${s.named_graph}`;
	else
		params.main.endpointUrl = s.sparql_url;
	return params;
}
const getTypeStrings = (params) => { return [ getValue(params.main.direct_role), getValue(params.main.indirect_role)];}
const setTypeStrings = (params, direct_role, indirect_role) => {
	params.main.direct_role = direct_role;
	params.main.indirect_role = indirect_role;
	return params;
}
const isFilter = params => { return isValue(params.main.filter); }
const getFilter = params => { return getValue(params.main.filter); }
const setFilter = (params, filter) => { 
	params.main.filter = filter;
	return params;
}
const getFilterColumn = params => { 
	r = 'namestring';
	if (isValue(params.main.filterColumn))
		r = getValue(params.main.filterColumn)
	return r;
}
const getLimit = params => { return getValue(params.main.limit); }
const getName = params => { return getValue(params.main.name); }
const getPropertyName = params => { return getValue(params.main.propertyName); }
const getTreeMode = params => { return getValue(params.main.treeMode); }
const isNamespaces = params => { return isValue(params.main.namespaces);}
const isInNamespaces = params => { return isValue(params.main.namespaces.in);}
const isNotInNamespaces = params => { return isValue(params.main.namespaces.notIn);}
const getInNamespaces = params => { return getValue(params.main.namespaces.in);}
const getNotInNamespaces = params => { return getValue(params.main.namespaces.notIn);}
const isOnlyPropsInSchema = params => { return isValue(params.main.onlyPropsInSchema);}
const isLinksWithTargets = params => { return isValue(params.main.linksWithTargets);}
const isUriIndividual = ( params, poz = 0) => {
	if ( poz === 0 && isValue(params.element) && isValue(params.element.uriIndividual)) 
		return true;
	if ( poz === 1 && isValue(params.elementOE) && isValue(params.elementOE.uriIndividual)) 
		return true;
	return false;
}
const getIndividualsNS =  async schema => {
	//const sql = `SELECT CONCAT(name,':') as prefix, value from ${schema}.ns WHERE name in ('dbc','dbr','rdf','xsd','owl', 'en_wiki') order by value desc`; // TODO 
	//const sql = `SELECT CONCAT(name,':') as prefix, value from ${schema}.ns WHERE name != '' and value != '' order by value desc`;  
	const sql = `SELECT CONCAT(name,':') as prefix, value from ${schema}.ns WHERE value != '' order by value desc`; 
	const r = await db.any(sql);
	return r;
}
const getUriIndividual = async ( schema, params, poz = 0) => {
	let r;
	if ( poz === 0 && isValue(params.element) ) 
		r = getValue(params.element.uriIndividual);
	if ( poz === 1 && isValue(params.elementOE) ) 
		r = getValue(params.elementOE.uriIndividual);
	if ( poz === 2 ) 
		r = getValue(params.element.pListI.uriIndividual);
	
	const list = await getIndividualsNS(schema);
	list.forEach(e => { if ( r.indexOf(e.prefix) == 0)  r = r.replace(e.prefix, e.value) });	
	//r = r.replace('dbr:','http://dbpedia.org/resource/');
	//r = r.replace('dbc:','http://dbpedia.org/resource/Category:');
	//r = r.replace('rdf:','http://www.w3.org/1999/02/22-rdf-syntax-ns#');
	//r = r.replace('xsd:','http://www.w3.org/2001/XMLSchema#');
	//r = r.replace('owl:','http://www.w3.org/2002/07/owl#');
	//r = r.replace('en_wiki:','http://en.wikipedia.org/wiki/');	
	
	if (r.substring(0,7) === 'http://' || r.substring(0,8) === 'https://')
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
	return getValue(params.main.classId);
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

const checkEndpoint = async (params, schema, KNOWN_DATA) => {
   // TODO find value in DB
    const s = KNOWN_DATA.find(x => x.name == getSchemaName(params));
	if ( !isEndpointUrl(params)) {
		if (s !== undefined) 
			params = setEndpointUrl(params, s);
	}
	if (s !== undefined)
		params = setTypeStrings(params, s.direct_role, s.indirect_role);
	else 
		params = setTypeStrings(params, 'rdf:type', '');

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
	if ( cName.includes('://')){
		r = await db.any(`SELECT * FROM ${schema}.v_classes_ns WHERE iri = $1 order by cnt desc limit 1`, [cName]);
	}
	else if ( cName.includes(':')){
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
	const col = 'v.*, dc.prefix as dc_prefix, dc.display_name as dc_display_name, dc.is_local as dc_is_local, rc.prefix as rc_prefix, rc.display_name as rc_display_name, rc.is_local as rc_is_local';
	const join = `LEFT JOIN ${schema}.v_classes_ns dc ON v.domain_class_id = dc.id LEFT JOIN ${schema}.v_classes_ns rc ON v.range_class_id = rc.id`;

	if ( pName.includes('://')){
		r = await db.any(`SELECT * FROM ${schema}.v_properties_ns WHERE iri = $1 order by cnt desc limit 1`, [pName]);
	}
	else if ( pName.includes(':')){
		const nList = pName.split(':');
		r = await db.any(`SELECT ${col} FROM ${schema}.v_properties_ns v ${join} WHERE v.display_name = $2 and v.prefix = $1 order by v.cnt desc limit 1`, [nList[0], nList[1]]);
	}
	else {
		const ns = await getLocalNamespace(schema);
		r = await db.any(`SELECT ${col} FROM ${schema}.v_properties_ns v ${join} WHERE v.display_name = $2 and v.prefix = $1 order by v.cnt desc limit 1`, [ns.name, pName]);
		if ( r.length === 0)
			r = await db.any(`SELECT ${col} FROM ${schema}.v_properties_ns v ${join} WHERE v.display_name = $1 order by v.cnt desc limit 1`, [pName]);
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
	console.log(r.length)
	let rr = {data: r, complete: complete, params: params};
	if ( getMakeLog(params))
		rr.sql = sql.replace(/(\r\n|\n|\r|\t)/gm,' ');
		
	return rr;
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
	
	console.log(r.length)	
	if ( r.length == getLimit(params)+1 ){
		complete = false;
		r.pop();
	}
	else {
		if ( !isOnlyPropsInSchema(params)) {  // TODO - check this
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
			console.log(r2.length)			
		}
	}
	let rr = {data: r, complete: complete, params: params};
	if ( getMakeLog(params)) {
		rr.sql = sql.replace(/(\r\n|\n|\r|\t)/gm,' ');
		rr.sql2 = sql2.replace(/(\r\n|\n|\r|\t)/gm,' ');
	}
	
	return rr;
}

const formWherePart = (col, inT, list, listType) => {
	//console.log('------------------------------------------------------')
	let sep = "";
	if ( listType === 1) {
		list = list.map( x => x.toString().replace("'","''"));
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

const checkIndividualsParams = async (schema, params) => {
	let find = false; 
	const cnt_limit = 300000;

	if ( isClassName(params,0)) {
		const classObj = await getClassByName( getClassName(params,0), schema);
		if (classObj[0].cnt < cnt_limit)
			find = true;
	}
	
	if ( isPList(params,0)) {
		const pList = getPList(params,0);
		let prop;
		if ( pList.in.length === 1 && pList.out.length === 0) 
			prop = pList.in[0];
		if ( pList.in.length === 0 && pList.out.length === 1) 
			prop = pList.out[0];
		
		if ( prop !== undefined && prop !== null) {
			const propObj = await getPropertyByName(prop.name, schema);
			if (propObj[0].cnt < cnt_limit)
			find = true;
		}
		if ( pList.in.length + pList.out.length > 1 )
			find = true;
	}			

	return find;
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
	setFilter,
	getLimit,
	getName,
	getPropertyName,
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
	isLinksWithTargets,
	isPList,
	getPList,
	checkIndividualsParams,
	getIndividualsNS,
	get_KNOWN_DATA,
	getTypeStrings,
	getUsePP,
	getSimplePrompt,
	getIsBasicOrder,
	getDeferredProperties,
	getMakeLog,
	getIndividualMode,
	isPListI,
	getPListI,
}