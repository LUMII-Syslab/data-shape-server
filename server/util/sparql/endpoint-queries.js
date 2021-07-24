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

const sparqlGetIndividuals = async (schema, params) => {
	
	const endpointUrl = util.getEndpointUrl(params); 
	const typeString = await getTypeString(endpointUrl);
	let newPList = {in:[], out:[]};
	let whereList = [];
	newPList = await util.getUrifromPList(schema, util.getPList(params, 0));
	console.log(newPList)
	
	if (util.isClassName(params, 0)) {
		const clInfo = await util.getClassByName(util.getClassName(params, 0), schema);
		if (clInfo.length > 0)
			whereList.push(`?x ${typeString} <${clInfo[0].iri}>`);
	}
	if (newPList.in.length > 0 )
		newPList.in.forEach(element => whereList.push(`[] <${element}> ?x`));
	if (newPList.out.length > 0 )
		newPList.out.forEach(element => whereList.push(`?x <${element}> []`));

	console.log(whereList)
	let sparql;
	if (util.isFilter(params))
		sparql = `select distinct ?x where { ${whereList.join('. ')} FILTER ( REGEX(?x,'${util.getFilter(params)}')  ) } LIMIT ${util.getLimit(params)}`;
	else
		sparql = `select distinct ?x where { ${whereList.join('. ')} } LIMIT ${util.getLimit(params)}`;
		
	const reply = await executeSPARQL(endpointUrl, sparql);
    return reply.map(v => v.x.value);
}

/**
 * Jautājumi:
 * - kā padot parametrus? options: { endpoint, incoming, limit, ....}
 * 
 */

module.exports = {
    executeSPARQL,
	sparqlGetIndividualClasses,
	sparqlGetPropertiesFromIndividuals,
	sparqlGetPropertiesFromClass,
	sparqlGetIndividuals,
}