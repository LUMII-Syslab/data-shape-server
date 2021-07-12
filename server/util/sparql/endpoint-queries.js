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


const sparqlGetClassProperties = async (endpointUrl, classIRI, incoming = false, limit = 500) => {

    let sparql;
    if (incoming) {
        sparql = `select distinct ?p where {?x a <${classIRI}>. [] ?p ?x}`;
    } else {
        sparql = `select distinct ?p where {?x a <${classIRI}>. ?x ?p []}`;
    }
    if (limit) sparql += ` limit ${limit}`

    // let client = findClient(endpointUrl);
    // const reply = await client.query.select(sparql);

    const reply = await executeSPARQL(endpointUrl, sparql);

    return reply.map(v => v.p);
}

const sparqlGetIndividualClasses = async (params) => {
	
	const endpointUrl = params.endpointUrl; 
	const typeString = await getTypeString(endpointUrl)
	const sparql = `select distinct ?c where {<${params.uriIndividual}> ${typeString} ?c} order by ?c`;
	
	const reply = await executeSPARQL(endpointUrl, sparql);
    return reply.map(v => v.c.value);
}

const sparqlGetPropertiesFromIndividuals = async (params, pos, uriIndividual) => {
	let r = {};
	let sparql;
	let reply;
	const endpointUrl = params.endpointUrl; 
	
	if ( pos === 'To') {
		sparql = `select distinct ?p where {[] ?p <${uriIndividual}> .} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.A = reply.map(v => v.p.value)
		sparql = `select distinct ?p where {<${uriIndividual}> ?p [] .} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.B = reply.map(v => v.p.value)
	}
	else {
		sparql = `select distinct ?p where {<${uriIndividual}> ?p [] .} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.A = reply.map(v => v.p.value)
		sparql = `select distinct ?p where {[] ?p <${uriIndividual}> .} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.B = reply.map(v => v.p.value)
	}
	return r;
}

const sparqlGetPropertiesFromClass = async (params, pos, uriClass) => {
	let r = {};
	let sparql;
	let reply;
	const endpointUrl = params.endpointUrl;
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

/**
 * Jautājumi:
 * - kā padot parametrus? options: { endpoint, incoming, limit, ....}
 * 
 */

module.exports = {
    executeSPARQL,
    sparqlGetClassProperties,
	sparqlGetIndividualClasses,
	sparqlGetPropertiesFromIndividuals,
	sparqlGetPropertiesFromClass,
}