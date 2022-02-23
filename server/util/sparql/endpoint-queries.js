const util = require('../../routes/api/utilities')
const SparqlClient = require('sparql-http-client/ParsingClient')
// const client = new SparqlClient({ endpointUrl: ENDPOINT_URL })

// collection in sparql clients for different endpoints
const clientMap = new Map();

const findClient = endpointUrl => {
    let client = clientMap.get(endpointUrl);
    if (client) return client;

    client = new SparqlClient({ endpointUrl });
    clientMap.set(endpointUrl, client);

    return client;
}

const getTypeString = async (params) => {
	const roles = util.getTypeStrings(params);
	return  roles[0];
    //return 'rdf:type';
}

const sparqlGetIndividualClasses = async (params, uriIndividual) => {
	
	const endpointUrl = util.getEndpointUrl(params); 
	const typeString = await getTypeString(params);
	const sparql = `select distinct ?c where {${uriIndividual} ${typeString} ?c} order by ?c`;
	
	const reply = await executeSPARQL(endpointUrl, sparql);
    return reply.map(v => v.c.value);
}

const sparqlGetPropertiesFromRemoteIndividual = async (params, schema, only_out) => {
	let r = {};
	let sparql;
	let reply;
	const endpointUrl = util.getEndpointUrl(params); 
	const pListI = util.getPListI(params);
	const prop = await util.getPropertyByName(pListI.name, schema, params);
	const ind = await util.getUriIndividual(schema, params, 2);
	const typeString = await getTypeString(params);
	const classFrom = await util.getClassByName(util.getClassName(params, 0), schema);
	let classInfo = '';
	if ( classFrom.length > 0 )
		classInfo = `?x1 ${typeString} <${classFrom[0].iri}>.`;
	
	if ( prop.length > 0) {
		const prop_iri = prop[0].iri;
		if ( pListI.type === 'in') {
			sparql = `select distinct ?p where {${classInfo} ${ind} <${prop_iri}> ?x1. ?x1 ?p [].} order by ?p`;
			reply = await executeSPARQL(endpointUrl, sparql);
			r.A = reply.map(v => v.p.value);
			if (!only_out) {
				sparql = `select distinct ?p where {${classInfo} ${ind} <${prop_iri}> ?x1. [] ?p ?x1.} order by ?p`;
				reply = await executeSPARQL(endpointUrl, sparql);
				r.B = reply.map(v => v.p.value);
			}
			else
				r.B = [];
		}
		else {
			sparql = `select distinct ?p where {${classInfo} ?x1 <${prop_iri}> ${ind}. ?x1 ?p [].} order by ?p`;
			reply = await executeSPARQL(endpointUrl, sparql);
			r.A = reply.map(v => v.p.value);
			if (!only_out) {
				sparql = `select distinct ?p where {${classInfo} ?x1 <${prop_iri}> ${ind}. [] ?p ?x1.} order by ?p`;
				reply = await executeSPARQL(endpointUrl, sparql);
				r.B = reply.map(v => v.p.value);
			}
			else
				r.B = [];
		}
	}		
	return r;
}

const sparqlGetPropertiesFromIndividuals = async (params, pos, only_out, uriIndividual, uriIndividualTo = '') => {
	let r = {};
	let sparql;
	let reply;
	const endpointUrl = util.getEndpointUrl(params); 

	if ( pos === 'All') {
		sparql = `select distinct ?p where {${uriIndividual} ?p ${uriIndividualTo} .} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.A = reply.map(v => v.p.value);
		if (!only_out) {
			sparql = `select distinct ?p where {${uriIndividualTo} ?p ${uriIndividual} .} order by ?p`;
			reply = await executeSPARQL(endpointUrl, sparql);
			r.B = reply.map(v => v.p.value);
		}
		else
			r.B = [];
	}	
	if ( pos === 'To') {
		sparql = `select distinct ?p where {[] ?p ${uriIndividual} .} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.A = reply.map(v => v.p.value);
		if (!only_out) {
			sparql = `select distinct ?p where {${uriIndividual} ?p [] .} order by ?p`;
			reply = await executeSPARQL(endpointUrl, sparql);
			r.B = reply.map(v => v.p.value);
		}
		else
			r.B = [];
	}
	if ( pos === 'From') {
		sparql = `select distinct ?p where {${uriIndividual} ?p [] .} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.A = reply.map(v => v.p.value);
		if (!only_out && r.A.length < 500 ) {  // TODO Padomāt par šo, vajadzēs vispār savādāk
			sparql = `select distinct ?p where {[] ?p ${uriIndividual} .} order by ?p`;
			reply = await executeSPARQL(endpointUrl, sparql);
			r.B = reply.map(v => v.p.value);
		}
		else
			r.B = [];
	}
	return r;
}

const sparqlGetPropertiesFromClass = async (params, pos, uriClass, only_out) => {
	let r = {};
	let sparql;
	let reply;
	const endpointUrl = util.getEndpointUrl(params);
	const typeString = await getTypeString(params);	
	
	if ( pos === 'To') {
		sparql = `select distinct ?p where {?x1 ${typeString} <${uriClass}>. [] ?p ?x1.} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.A = reply.map(v => v.p.value);
		if (!only_out) {
			sparql = `select distinct ?p where {?x1 ${typeString} <${uriClass}>. ?x1 ?p [].} order by ?p`;
			reply = await executeSPARQL(endpointUrl, sparql);
			r.B = reply.map(v => v.p.value);
		}
		else
			r.B = [];
	}
	else {
		sparql = `select distinct ?p where {?x1 ${typeString} <${uriClass}>. ?x1 ?p [].} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.A = reply.map(v => v.p.value);
		if (!only_out) {
			sparql = `select distinct ?p where {?x1 ${typeString} <${uriClass}>. [] ?p ?x1.} order by ?p`;
			reply = await executeSPARQL(endpointUrl, sparql);
			r.B = reply.map(v => v.p.value);
		}
		else
			r.B = [];
	}
	return r;
}


const executeSPARQL = async (endpointUrl, querySparql) => {
    let client = findClient(endpointUrl);
	console.log('--------executeSPARQL-----------------')
	console.log(querySparql)
    if (querySparql.toLowerCase().startsWith('ask')) {
        const reply = await client.query.ask(querySparql);
        console.log(reply)
        return reply;
    } else {
        const reply = await client.query.select(querySparql);
        console.log(reply.length)
        return reply;
    }
}

const validateFilter = name => /^[a-žA-Ž0-9_()'-]+$/.test(name)

const sparqlGetTreeIndividuals =  async (schema, params) => {
	function getShortName(list, name) {
		list.forEach(e => { if ( name.indexOf(e.value) == 0) name = name.replace(e.value,e.prefix) });
		return name;
	}

	const individualMode = util.getIndividualMode(params);
	const endpointUrl = util.getEndpointUrl(params); 
	const typeString = await getTypeString(params);
	const list = await util.getIndividualsNS(schema);
	let sparql;
	let sql;
	let reply;
	let rrT = {};
	let rr = [];
	let newPList = {in:[], out:[]};
	let whereList = [];
	newPList = await util.getUrifromPList(schema, util.getPList(params, 0), params);
	//console.log(newPList)
	
	if (util.isClassName(params, 0) && util.getClassName(params, 0).includes('All classes') && util.getSchemaType(params) == 'dbpedia') {
		if ( util.isFilter(params)) {
			let filter = util.getFilter(params);
			if ( !validateFilter(filter)) {
				const filter_list = filter.split('');
				let filter_list2 = [];
				filter_list.forEach(f => { 
					if (validateFilter(f))
						filter_list2.push(f);
				});
				filter = filter_list2.join('');
				params = util.setFilter(params, filter);
			}
			filter = filter.replace("'","''");		
			
			if (individualMode === 'Direct') {
				sql = `SELECT local_name, name FROM (SELECT local_name, ns_id FROM ${schema}.instances where local_name = $2 limit $1) AA , ${schema}.ns where ns_id = ns.id`;
				reply = await util.getSchemaData(sql, params);
				reply.data.forEach(v => { rr.push(`${v.name}:${v.local_name}`);});
			}
			else {
				sql = `SELECT local_name, name FROM (SELECT local_name, ns_id FROM ${schema}.instances where local_name = $2 limit $1) AA , ${schema}.ns where ns_id = ns.id`;
				reply = await util.getSchemaData(sql, params);
				reply.data.forEach(v => { rrT[`${v.name}:${v.local_name}`] = `${v.name}:${v.local_name}`;});
				//reply.data.forEach(v => { rr.push(`${v.name}:${v.local_name}`);});
				params.main.filter = params.main.filter.replace("(","").replace(")","");
				sql = `SELECT local_name, name FROM (SELECT local_name, ns_id FROM ${schema}.instances where test @@ to_tsquery($2) limit $1) AA , ${schema}.ns where ns_id = ns.id order by length(local_name)`;
				reply = await util.getSchemaData(sql, params);
				reply.data.forEach(v => { rrT[`${v.name}:${v.local_name}`] = `${v.name}:${v.local_name}`;});
				for (var key in rrT) 
					rr.push(key);				
				//reply.data.forEach(v => { rr.push(`${v.name}:${v.local_name}`);});
			}
		}
		else {  // Nekad neiestāsies, jo viemēr tiks padots filtrs
			sql = `SELECT local_name, name, AA.id FROM (SELECT local_name, ns_id, id FROM ${schema}.instances where local_name is not null limit $1) AA , ${schema}.ns where ns_id = ns.id order by length(local_name)`;
			reply = await util.getSchemaData(sql, params);
			reply.data.forEach(v => { rr.push(`${v.name}:${v.local_name}`);});
		}

		/*
		if (util.getClassName(params, 0) == 'All classes LN' ) {  //TODO
			sql = `SELECT local_name, name FROM (SELECT local_name, ns_id FROM ${schema}.instances where local_name = $2 limit $1) AA , ${schema}.ns where ns_id = ns.id`;
			reply = await util.getSchemaData(sql, params);
			reply.data.forEach(v => { rr.push(`${v.name}:${v.local_name}`);});
			sql = `SELECT local_name, name FROM (SELECT * FROM ${schema}.instances where local_name like '${filter}%' limit $1) AA , ${schema}.ns where ns_id = ns.id order by length(local_name)`;
			reply = await util.getSchemaData(sql, params);
			reply.data.forEach(v => { rr.push(`${v.name}:${v.local_name}`);});
		}
		if (util.getClassName(params, 0) == 'All classes T' || util.getClassName(params, 0) == 'All classes') {  //TODO
			sql = `SELECT local_name, name FROM (SELECT local_name, ns_id FROM ${schema}.instances where local_name = $2 limit $1) AA , ${schema}.ns where ns_id = ns.id`;
			reply = await util.getSchemaData(sql, params);
			reply.data.forEach(v => { rr.push(`${v.name}:${v.local_name}`);});
			params.main.filter = params.main.filter.replace("(","").replace(")","");
			sql = `SELECT local_name, name FROM (SELECT local_name, ns_id FROM ${schema}.instances where test @@ to_tsquery($2) limit $1) AA , ${schema}.ns where ns_id = ns.id  order by length(local_name)`;
			//*** sql = `SELECT local_name, name FROM (SELECT local_name, ns_id FROM ${schema}.instances where test @@ to_tsquery($2) order by length(test) limit $1) AA , ${schema}.ns where ns_id = ns.id  order by length(local_name)`;
			//*** sql = `SELECT local_name, name FROM (SELECT local_name, ns_id FROM ${schema}.instances where test @@ to_tsquery($2) and local_name ilike '%${filter}%' order by length(test) limit $1) AA , ${schema}.ns where ns_id = ns.id  order by length(local_name)`;
			reply = await util.getSchemaData(sql, params);
			reply.data.forEach(v => { rr.push(`${v.name}:${v.local_name}`);});
		} */

	}
	else if (util.isClassName(params, 0) && util.getClassName(params, 0).includes('All classes') && util.getSchemaType(params) == 'wikidata') {
		const label = util.getFilter(params);
		sparql = `SELECT ?x ?description_1 WHERE { ?x rdfs:label "${label}"@en.
				OPTIONAL{?x schema:description ?description_1. FILTER(LANG(?description_1) = 'en')}}`; 
		reply = await executeSPARQL(endpointUrl, sparql);

		reply.forEach(v => { 
			let t = {uri:v.x.value, label:label, description:''};
			const nn = getShortName(list, v.x.value).replace(':',`:[${label} (`);
			t.localName = `${nn})]`;
			if (v.description_1 !== undefined ) 
				t.description = v.description_1.value;
			rr.push(t);
			});
	}
	else {
		if (util.isClassName(params, 0) && !util.getClassName(params, 0).includes('All classes') ) {
			const clInfo = await util.getClassByName(util.getClassName(params, 0), schema);
			if (clInfo.length > 0)
				whereList.push(`?x ${typeString} <${clInfo[0].iri}>`);
		}

		if (util.isFilter(params)) {
			if (util.getSchemaType(params) == 'wikidata') {
				if (individualMode === 'Direct') {
					whereList.push(`?x rdfs:label '${util.getFilter(params)}'@en`);
					whereList.push(`?x rdfs:label ?label_1. FILTER(LANG(?label_1) = 'en' )`);
					whereList.push(`OPTIONAL{?x schema:description ?description_1. FILTER(LANG(?description_1) = 'en')} `);
					sparql = `select distinct ?x ?label_1 ?description_1 where { ${whereList.join('. ')} } LIMIT ${util.getLimit(params)}`;
				}
				else {
					whereList.push(`?x rdfs:label ?label_1. FILTER(LANG(?label_1) = 'en' && REGEX(?label_1,'${util.getFilter(params)}','i'))`);
					whereList.push(`OPTIONAL{?x schema:description ?description_1. FILTER(LANG(?description_1) = 'en')} `);
					sparql = `select distinct ?x ?label_1 ?description_1 where { ${whereList.join('. ')} } LIMIT ${util.getLimit(params)}`;
					
				}

				reply = await executeSPARQL(endpointUrl, sparql);
				reply.forEach(v => { 
					let t = {uri:v.x.value,description:''};
					if (v.label_1 !== undefined ) { 
						const nn = getShortName(list, v.x.value).replace(':',`:[${v.label_1.value} (`);
						t.localName = `${nn})]`;
					}
					else
						t.localName = getShortName(list, v.x.value);
					if (v.description_1 !== undefined ) 
						t.description = v.description_1.value;
					rr.push(t);
					}
				);
			}
			else {
				let ii = [];
				list.forEach(e => { ii.push(`?x =<${e.value}${util.getFilter(params)}>`);});
				const sparql0 = `select distinct ?x where { ${whereList.join('. ')} FILTER ( ${ii.join(' or ')}) } LIMIT ${list.length}`;
				if (individualMode === 'Direct') {
					reply = await executeSPARQL(endpointUrl, sparql0);
					reply.forEach(v => { rr.push(getShortName(list, v.x.value));});	
				}
				else {
					reply = await executeSPARQL(endpointUrl, sparql0);
					reply.forEach(v => { rrT[getShortName(list, v.x.value)] = getShortName(list, v.x.value);});	
					sparql = `select distinct ?x where { ${whereList.join('. ')} FILTER ( REGEX(?x,'${util.getFilter(params)}','i') ) } LIMIT ${util.getLimit(params)}`;
					reply = await executeSPARQL(endpointUrl, sparql);
					reply.forEach(v => { rrT[getShortName(list, v.x.value)] = getShortName(list, v.x.value);});	
					for (var key in rrT) 
						rr.push(key);
				}
			}
		}
		else {
			if (util.getSchemaType(params) == 'wikidata') {
				whereList.push(`OPTIONAL{?x rdfs:label ?label_1. FILTER(LANG(?label_1) = 'en')}`);
				whereList.push(`OPTIONAL{?x schema:description ?description_1. FILTER(LANG(?description_1) = 'en')}`);
				sparql = `select distinct ?x ?label_1 ?description_1 where { ${whereList.join('. ')} } LIMIT ${util.getLimit(params)}`;
				reply = await executeSPARQL(endpointUrl, sparql);
				reply.forEach(v => { 
						let t = {uri:v.x.value,description:''};
						if (v.label_1 !== undefined ) { 
							const nn = getShortName(list, v.x.value).replace(':',`:[${v.label_1.value} (`);
							t.localName = `${nn})]`;
						}
						else
							t.localName = getShortName(list, v.x.value);
						if (v.description_1 !== undefined ) 
							t.description = v.description_1.value;
						rr.push(t);
					}
				);
			}
			else  {
				sparql = `select distinct ?x where { ${whereList.join('. ')} } LIMIT ${util.getLimit(params)}`;
				reply = await executeSPARQL(endpointUrl, sparql);
				reply.forEach(v => { rr.push(getShortName(list, v.x.value));});			
			}			
		}
	}
	return rr;
    //return reply.map(v => getShortName(list, v.x.value));
}

const sparqlGetIndividuals =  async (schema, params) => {
	function getShortName(list, v) {
		let name = v.x.value;
		list.forEach(e => { if ( name.indexOf(e.value) == 0) name = name.replace(e.value,e.prefix) }); 

		if (v.label_1 !== undefined ) { 
			const nn = name.replace(':',`:[${v.label_1.value} (`);
			name = `${nn})]`;
		}
		
		//list.forEach(e => { if ( name.indexOf(e.value) == 0) name = name.replace(e.value,e.prefix) });	
		//name = name.replace('http://dbpedia.org/resource/Category:','dbc:');
		//name = name.replace('http://dbpedia.org/resource/','dbr:');
		//name = name.replace('http://www.w3.org/1999/02/22-rdf-syntax-ns#','rdf:');
		//name = name.replace('http://www.w3.org/2001/XMLSchema#','xsd:');
		//name = name.replace('http://www.w3.org/2002/07/owl#','owl:');
		//name = name.replace('http://en.wikipedia.org/wiki/','en_wiki:');
		return name;
	}

	const endpointUrl = util.getEndpointUrl(params); 
	const typeString = await getTypeString(params);
	const list = await util.getIndividualsNS(schema);
	let sparql;
	let reply;
	let rr = [];
	let rrT = {};
	let newPList = {in:[], out:[]};
	let whereList = [];
	const vv = ( util.getSchemaType(params) == 'wikidata' ? ' ?label_1 ' : '');
	const wherePlus = ( util.getSchemaType(params) == 'wikidata' ? ". OPTIONAL{ ?x rdfs:label ?label_1. FILTER(LANG(?label_1) = 'en' )} " : '');
	
	if ( util.isPListI(params)) {
		const pListI = util.getPListI(params);
		const prop = await util.getPropertyByName(pListI.name, schema, params);
		const ind = await util.getUriIndividual(schema, params, 2);
		const classFrom = await util.getClassByName(util.getClassName(params, 0), schema);
		let classInfo = '';
		if ( prop.length > 0) {
			const prop_iri = prop[0].iri;
			if ( classFrom.length > 0 )
				classInfo = `?x ${typeString} <${classFrom[0].iri}>.`;
			if ( pListI.type === 'in')
				sparql = `select distinct ?x ${vv} where { ${classInfo} ${ind} <${prop_iri}> ?x ${wherePlus} } LIMIT ${util.getLimit(params)}`;
			if ( pListI.type === 'out') 
				sparql = `select distinct ?x ${vv} where { ${classInfo} ?x  <${prop_iri}> ${ind} ${wherePlus} } LIMIT ${util.getLimit(params)}`;
				
			reply = await executeSPARQL(endpointUrl, sparql);
			reply.forEach(v => { rr.push(getShortName(list, v));});
		}
	}
	else {
		newPList = await util.getUrifromPList(schema, util.getPList(params, 0), params);
		//console.log(newPList)
		
		if (util.isClassName(params, 0) ) {
			const clInfo = await util.getClassByName(util.getClassName(params, 0), schema);
			if (clInfo.length > 0)
				whereList.push(`?x ${typeString} <${clInfo[0].iri}>`);
		}
		if (newPList.in.length > 0 )
			newPList.in.forEach(element => whereList.push(`[] <${element}> ?x`));
		if (newPList.out.length > 0 )
			newPList.out.forEach(element => whereList.push(`?x <${element}> []`));

		//console.log(whereList)

		if (util.isFilter(params)) {
			// *******************************
			let ii = [];
			list.forEach(e => { ii.push(`?x =<${e.value}${util.getFilter(params)}>`);});
			const sparql0 = `select distinct ?x where { ${whereList.join('. ')} FILTER ( ${ii.join(' or ')}) } LIMIT ${list.length}`;
			reply = await executeSPARQL(endpointUrl, sparql0);
			reply.forEach(v => { rrT[getShortName(list, v)] = getShortName(list, v);});	
			//reply.forEach(v => { rr.push(getShortName(list, v.x.value));});
			// *******************************
			//sparql = `select distinct ?x where { ${whereList.join('. ')} FILTER ( REGEX(lcase(str(?x)),'${util.getFilter(params).toLowerCase()}') ) } LIMIT ${util.getLimit(params)}`;
			sparql = `select distinct ?x where { ${whereList.join('. ')} FILTER ( REGEX(?x,'${util.getFilter(params)}','i') ) } LIMIT ${util.getLimit(params)}`;
		}
		else
			sparql = `select distinct ?x ${vv} where { ${whereList.join('. ')} ${wherePlus}} LIMIT ${util.getLimit(params)}`;
		
		reply = await executeSPARQL(endpointUrl, sparql);

		reply.forEach(v => { rrT[getShortName(list, v)] = getShortName(list, v);});
		for (var key in rrT) 
			rr.push(key);
		//reply.forEach(v => { rr.push(getShortName(list, v.x.value));});
		//if ( rr.length === 2 && rr[0] === rr[1])
		//	rr.pop();	
	}
	
	return rr;
    //return reply.map(v => getShortName(list, v.x.value));
}

// TODO pilnais tikai wikidata. Ja ir nezināms ns tad nebūs labi, nestrādā korekti arī neesošiem indivīdiem
const sparqlGetIndividualByName =  async (info, params, schema) => {
	const endpointUrl = util.getEndpointUrl(params); 
	const list = await util.getIndividualsNS(schema);

	let name = '';
	let iri = '';
	let rr = {};
	if (info.indexOf('//') != -1) {
		iri = info;
		list.forEach(e => { if ( info.indexOf(e.value) == 0) name = info.replace(e.value,e.prefix);});
	}
	else {
		name = info;
		list.forEach(e => { if ( info.indexOf(e.prefix) == 0) iri = info.replace(e.prefix,e.value);});
	}
	
	rr.iri = iri;
	rr.name = name;
	rr.localName = name;
	
	let sparql = `ASK WHERE { {<${iri}> ?p ?o . } UNION {?s ?p <${iri}> . } }`; 
	let reply = await executeSPARQL(endpointUrl, sparql);
	
	if (reply) {
		if ( util.getSchemaType(params) == 'wikidata') {
			sparql = `SELECT ?label_1 WHERE{ <${iri}> rdfs:label ?label_1. FILTER(LANG(?label_1) = 'en').}`;
			reply = await executeSPARQL(endpointUrl, sparql);	
			if ( reply.length > 0 ) {
				if (reply[0].label_1 !== undefined ) { 
					rr.label = reply[0].label_1.value;
					rr.localName = `${name.replace(':',`:[${rr.label} (`)})]`;
				}
				else
					rr.localName = name;
			}	
		}
		return [rr];
	}
	else
	 return [];
}

module.exports = {
    executeSPARQL,
	sparqlGetIndividualClasses,
	sparqlGetPropertiesFromIndividuals,
	sparqlGetPropertiesFromClass,
	sparqlGetIndividuals,
	sparqlGetTreeIndividuals,
	sparqlGetPropertiesFromRemoteIndividual,
	sparqlGetIndividualByName,
}