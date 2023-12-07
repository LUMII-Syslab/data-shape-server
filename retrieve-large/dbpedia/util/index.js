const SparqlClient = require('sparql-http-client/ParsingClient');

const ENDPOINT_URL = 'http://dbpedia.org/sparql';
const DEFAULT_GRAPH = 'http://dbpedia.org';

const client = new SparqlClient({ endpointUrl: ENDPOINT_URL });

console.log(`SPARQL Endpoint: ${ENDPOINT_URL}`);

const executeSparql = async (sparql, options) => {
    let result;

    // 1st try
    try {
    result = await client.query.select(sparql, options);
    return result;
    } catch (err) { }

    await sleep(2000);

    // 2nd try
    result = await client.query.select(sparql, options);
    return result;
}
  
const executeAsk = async (sparql, options) => {
    let result;

    // 1st try
    try {
        result = await client.query.ask(sparql, options);
        return result;
    } catch (err) { }

    await sleep(2000);

    // 2nd try
    result = await client.query.ask(sparql, options);
    return result;
}
  
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  
module.exports = {
    sleep,
    executeSparql,
    executeAsk,
}