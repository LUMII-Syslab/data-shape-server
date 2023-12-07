const SparqlClient = require('sparql-http-client/ParsingClient');

const DEFAULT_GRAPH = 'http://dbpedia.org';
const ENDPOINT_URL = 'https://query.wikidata.org/sparql';

const client = new SparqlClient({ endpointUrl: ENDPOINT_URL });

const executeSparql = async (sparql, options) => {
    let result;

    // 1st try
    try {
    result = await client.query.select(sparql, options);
    return result;
    } catch (err) {
        console.error(err)
        if (result.header['Retry-After']) {

        }
     }

    await sleep(2000);

    // 2nd try
    result = await client.query.select(sparql, options);
    return result;
}
  
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  
module.exports = {
    sleep,
    executeSparql,
}