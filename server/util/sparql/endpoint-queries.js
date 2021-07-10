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


const getClassProperties = async (endpointUrl, classIRI, incoming = false, limit = 500) => {

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

const getIndividualClasses = async (params) => {
	
	const endpointUrl = params.endpointUrl; 
	const typeString = await getTypeString(endpointUrl)
	const sparql = `select distinct ?c where {<${params.uriIndividual}> ${typeString} ?c} order by ?c`;
	
	const reply = await executeSPARQL(endpointUrl, sparql);
    return reply.map(v => v.c.value);
}

const executeSPARQL = async (endpointUrl, querySparql) => {
    let client = findClient(endpointUrl);
    const reply = await client.query.select(querySparql);
    return reply;
}

/**
 * Jautājumi:
 * - kā padot parametrus? options: { endpoint, incoming, limit, ....}
 * 
 */

module.exports = {
    executeSPARQL,
    getClassProperties,
	getIndividualClasses,
}