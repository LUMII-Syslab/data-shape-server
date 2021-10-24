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

const getTypeString = async endpointUrl => {
	// TODO get from DB
    return 'rdf:type';
}

const sparqlGetIndividualClasses = async (params, uriIndividual) => {
	
	const endpointUrl = util.getEndpointUrl(params); 
	const typeString = await getTypeString(endpointUrl)
	const sparql = `select distinct ?c where {${uriIndividual} ${typeString} ?c} order by ?c`;
	
	const reply = await executeSPARQL(endpointUrl, sparql);
    return reply.map(v => v.c.value);
}

const sparqlGetPropertiesFromIndividuals = async (params, pos, uriIndividual) => {
	let r = {};
	let sparql;
	let reply;
	const endpointUrl = util.getEndpointUrl(params); 
	
	if ( pos === 'To') {
		sparql = `select distinct ?p where {[] ?p ${uriIndividual} .} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.A = reply.map(v => v.p.value)
		sparql = `select distinct ?p where {${uriIndividual} ?p [] .} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.B = reply.map(v => v.p.value)
	}
	else {
		sparql = `select distinct ?p where {${uriIndividual} ?p [] .} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.A = reply.map(v => v.p.value)
		sparql = `select distinct ?p where {[] ?p ${uriIndividual} .} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.B = reply.map(v => v.p.value)
	}
	return r;
}

const sparqlGetPropertiesFromClass = async (params, pos, uriClass) => {
	let r = {};
	let sparql;
	let reply;
	const endpointUrl = util.getEndpointUrl(params);
	const typeString = await getTypeString(endpointUrl);	
	
	if ( pos === 'To') {
		sparql = `select distinct ?p where {?x1 ${typeString} <${uriClass}>. [] ?p ?x1.} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.A = reply.map(v => v.p.value)
		sparql = `select distinct ?p where {?x1 ${typeString} <${uriClass}>. ?x1 ?p [].} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.B = reply.map(v => v.p.value)
	}
	else {
		sparql = `select distinct ?p where {?x1 ${typeString} <${uriClass}>. ?x1 ?p [].} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.A = reply.map(v => v.p.value)
		sparql = `select distinct ?p where {?x1 ${typeString} <${uriClass}>. [] ?p ?x1.} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.B = reply.map(v => v.p.value)
	}
	return r;
}


const executeSPARQL = async (endpointUrl, querySparql) => {
    let client = findClient(endpointUrl);
	console.log('--------executeSPARQL-----------------')
	console.log(querySparql)
    const reply = await client.query.select(querySparql);
	console.log(reply.length)
    return reply;
}

const validateFilter = name => /^[a-žA-Ž0-9_()'-]+$/.test(name)

const sparqlGetIndividuals =  async (schema, params) => {
	function getShortName(list, name) {
		list.forEach(e => { if ( name.indexOf(e.value) == 0) name = name.replace(e.value,e.prefix) });
		//name = name.replace('http://dbpedia.org/resource/Category:','dbc:');
		//name = name.replace('http://dbpedia.org/resource/','dbr:');
		//name = name.replace('http://www.w3.org/1999/02/22-rdf-syntax-ns#','rdf:');
		//name = name.replace('http://www.w3.org/2001/XMLSchema#','xsd:');
		//name = name.replace('http://www.w3.org/2002/07/owl#','owl:');
		//name = name.replace('http://en.wikipedia.org/wiki/','en_wiki:');
		return name;
	}

	const endpointUrl = util.getEndpointUrl(params); 
	const typeString = await getTypeString(endpointUrl);
	const list = await util.getIndividualsNS(schema);
	let sparql;
	let sql;
	let reply;
	let rr = [];
	let newPList = {in:[], out:[]};
	let whereList = [];
	newPList = await util.getUrifromPList(schema, util.getPList(params, 0));
	//console.log(newPList)
	
	if (util.isClassName(params, 0) && util.getClassName(params, 0).includes('All classes') && util.isFilter(params)) {
		let filter = util.getFilter(params);
		if ( !validateFilter(filter)) {
			const filter_list = filter.split('');
			let filter_list2 = [];
			filter_list.forEach(f => { 
				if (validateFilter(f))
					filter_list2.push(f);
			});
			filter = filter_list2.join('');
			params.main.filter = filter;
		}
		
		if (util.getClassName(params, 0) == 'All classes LN' || util.getClassName(params, 0) == 'All classes') {  //TODO
			sql = `SELECT local_name, name FROM (SELECT local_name, ns_id FROM ${schema}.instances where local_name = $2 limit $1) AA , ${schema}.ns where ns_id = ns.id`;
			reply = await util.getSchemaData(sql, params);
			reply.data.forEach(v => { rr.push(`${v.name}:${v.local_name}`);});
			filter = filter.replace("'","''");
			sql = `SELECT local_name, name FROM (SELECT * FROM ${schema}.instances where local_name like '${filter}%' limit $1) AA , ${schema}.ns where ns_id = ns.id order by length(local_name)`;
			reply = await util.getSchemaData(sql, params);
			reply.data.forEach(v => { rr.push(`${v.name}:${v.local_name}`);});
		}
		if (util.getClassName(params, 0) == 'All classes T') {  //TODO
			//sql = `SELECT local_name, name FROM (SELECT local_name, ns_id FROM ${schema}.instances where local_name = $2 limit $1) AA , ${schema}.ns where ns_id = ns.id`;
			//reply = await util.getSchemaData(sql, params);
			//reply.data.forEach(v => { rr.push(`${v.name}:${v.local_name}`);});
			params.main.filter = params.main.filter.replace("(","").replace(")","");
			sql = `SELECT local_name, name FROM (SELECT local_name, ns_id FROM ${schema}.instances where test @@ to_tsquery($2) order by length(test) limit $1) AA , ${schema}.ns where ns_id = ns.id  order by length(local_name)`;
			reply = await util.getSchemaData(sql, params);
			console.log(reply.data)
			reply.data.forEach(v => { rr.push(`${v.name}:${v.local_name}`);});
		}

		}
	else {
		if (util.isClassName(params, 0) && !util.getClassName(params, 0).includes('All classes') ) {
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
			reply.forEach(v => { rr.push(getShortName(list, v.x.value));});
			// *******************************
			//sparql = `select distinct ?x where { ${whereList.join('. ')} FILTER ( REGEX(lcase(str(?x)),'${util.getFilter(params).toLowerCase()}') ) } LIMIT ${util.getLimit(params)}`;
			sparql = `select distinct ?x where { ${whereList.join('. ')} FILTER ( REGEX(?x,'${util.getFilter(params)}','i') ) } LIMIT ${util.getLimit(params)}`;
		}
		else
			sparql = `select distinct ?x where { ${whereList.join('. ')} } LIMIT ${util.getLimit(params)}`;
			
		reply = await executeSPARQL(endpointUrl, sparql);
		reply.forEach(v => { rr.push(getShortName(list, v.x.value));});
		if ( rr.length === 2 && rr[0] === rr[1])
			rr.pop();
	}
	
	return rr;
    //return reply.map(v => getShortName(list, v.x.value));
}

module.exports = {
    executeSPARQL,
	sparqlGetIndividualClasses,
	sparqlGetPropertiesFromIndividuals,
	sparqlGetPropertiesFromClass,
	sparqlGetIndividuals,
}