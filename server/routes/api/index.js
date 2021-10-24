const express = require('express');
const router = express.Router();
const debug = require('debug')('dss:index')
const util = require('./utilities')

const db = require('./db')

const { 
	getClasses,
	getTreeClasses,
	getNamespaces,
} = require('./class-handlers')

const { 
	getProperties,
	getNextProperties,
	checkProperty,
} = require('./property-handlers')

const { 
    executeSPARQL,
	sparqlGetIndividuals,
} = require('../../util/sparql/endpoint-queries')

// TODO: get this info from the db
const KNOWN_DATA = [ 
	{name: 'DBpedia', schema:'dbpedia', endpoint: 'https://dbpedia.org/sparql', tree_profile: 'DBpedia', use_pp_rels: true , hide_individuals: false },
	{name: 'Tweets_cov', schema:'tweets_cov', endpoint: 'https://data.gesis.org/tweetscov19/sparql', tree_profile: 'DBpediaL', use_pp_rels: true  , hide_individuals: true },
	{name: 'Europeana', schema:'europeana', endpoint: 'http://sparql.europeana.eu/', tree_profile: 'Basic', use_pp_rels: false  , hide_individuals: false },
	{name: 'Covid_On_The_Web', schema:'covid_on_the_web', endpoint: 'https://covidontheweb.inria.fr/sparql', tree_profile: 'DBpediaL', use_pp_rels: false  , hide_individuals: false },
	{name: 'Mini_university', schema:'mini_university', endpoint: 'http://85.254.199.72:8890/sparql', tree_profile: 'BasicL', use_pp_rels: true , hide_individuals: true },
	{name: 'Mini_hospital', schema:'mini_hospital', endpoint: 'http://185.23.162.167:8833/sparql', tree_profile: 'BasicL', use_pp_rels: true  , hide_individuals: true },
]

const validateOntologyName = name => /^[a-zA-Z0-9_-]+$/.test(name)

const getSchemaName = name => {
	if ( name === 'V1_dbpedia' ) name = 'DBpedia'; // TODO: remove
	const s = KNOWN_DATA.find(x => x.name == name);
	if (s !== undefined) return s.schema;
	else return "";
}

const makeOutput = data => {
	return {prefix:data.prefix, name:data.display_name, cnt:data.cnt_x, iri:data.iri};
}

const checkOntology = ont => {

	let err = {err_msg: ''};
	if (!validateOntologyName(ont)) {
		err.status = 400;
		err.err_msg = 'bad ontology name';
	}
	const schema = getSchemaName(ont);
	if (schema === '' ) {
		err.status = 404;
		err.err_msg = 'unknown ontology';
	}
	else 
		err.schema = schema;
	return err;
}

/* API root */
router.get('/', (req, res, next) => {
  res.send('API root');
});

/**
 * List of known ontologies
 */
router.get('/info', (req, res, next) => {
  res.json(KNOWN_DATA);
});

/**
 * List of namespaces in given ontology
 */
router.get('/ontologies/:ont/ns', async (req, res, next) => {
    try {
        const ont = req.params['ont'];
		
		const err = checkOntology(ont);
		if ( err.err_msg !== '') {
			res.status(err.status).send(err.err_msg);
			return;
		}
		const schema = err.schema;
        const ns = await getNamespaces(schema);
		//   res.type('application/json').status(200).send(JSON.stringify(data, null, 2));
        res.json(ns)
    } catch(err) {
        console.error(err)
        next(err)
    }
});

/**
 * List of classes in given ontology
 */
router.get('/ontologies/:ont/classes/:limit', async (req, res, next) => {
    try {
        const ont = req.params['ont'];
		const limit = Number(req.params['limit']);
		const err = checkOntology(ont);
		if ( err.err_msg !== '') {
			res.status(err.status).send(err.err_msg);
			return;
		}
		const schema = err.schema;

        const rr = await getClasses(schema, {main:{limit: limit}});  
		rr.data = rr.data.map(v => {return makeOutput(v)});
        res.json(rr);
		
    } catch(err) {
        console.error(err)
        next(err)
    }
});

/**
 * List of classes in given ontology whose name or prefix matches given filter
 */
router.get('/ontologies/:ont/classes-filtered/:filter/:limit', async (req, res, next) => {
    try {
        const ont = req.params['ont'];
		const filter = req.params['filter'];
		const limit = Number(req.params['limit']);
		const err = checkOntology(ont);
		if ( err.err_msg !== '') {
			res.status(err.status).send(err.err_msg);
			return;
		}
		const schema = err.schema;

        const rr = await getClasses(schema, {main:{limit: limit, filter: filter}});  
		rr.data = rr.data.map(v => {return makeOutput(v)});
        res.json(rr);
		
    } catch(err) {
        console.error(err)
        next(err)
    }
});
/**
 * List of properties in given ontology
 */
router.get('/ontologies/:ont/properties/:limit', async (req, res, next) => {
    try {
        const ont = req.params['ont'];
		const limit = Number(req.params['limit']);
		const err = checkOntology(ont);
		if ( err.err_msg !== '') {
			res.status(err.status).send(err.err_msg);
			return;
		}
		const schema = err.schema;

        const rr = await getProperties(schema, {main:{propertyKind:'All', limit: limit}});  
		rr.data = rr.data.map(v => {return makeOutput(v)});
        res.json(rr);
		
    } catch(err) {
        console.error(err)
        next(err)
    }
});

/**
 * List of properties in given ontology whose name or prefix matches given filter
 */
router.get('/ontologies/:ont/properties-filtered/:filter/:limit', async (req, res, next) => {
    try {
        const ont = req.params['ont'];
		const filter = req.params['filter'];
		const limit = Number(req.params['limit']);
		const err = checkOntology(ont);
		if ( err.err_msg !== '') {
			res.status(err.status).send(err.err_msg);
			return;
		}
		const schema = err.schema;

        const rr = await getProperties(schema, {main:{propertyKind:'All', limit: limit, filter: filter}});  
		rr.data = rr.data.map(v => {return makeOutput(v)});
        res.json(rr);
		
    } catch(err) {
        console.error(err)
        next(err)
    }
});

// ***********************************************************************************88
router.post('/ontologies/:ont/:fn', async (req, res, next) => {
	console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
    try {
        const ont = req.params['ont'];
		const fn = req.params['fn'];
		
		const err = checkOntology(ont);
		if ( err.err_msg !== '') {
			res.status(err.status).send(err.err_msg);
			return;
		}
		const schema = err.schema;

		let params = req.body;
		params = await util.checkEndpoint(params, schema, KNOWN_DATA)
	    console.log(params);
		
		let r = { complete: false };
		if ( fn === 'getClasses')
			r = await getClasses(schema, params);
		if ( fn === 'getTreeClasses')
			r = await getTreeClasses(schema, params);
		if ( fn === 'getProperties')
			r = await getProperties(schema, params);
		if ( fn === 'getNextProperties')
			r = await getNextProperties(schema, params);
		if ( fn === 'getNamespaces')
			r = await getNamespaces(schema);
		if ( fn === 'getIndividuals') {
			r = [];			
			const find = await util.checkIndividualsParams(schema, params);
			if ( find )
				r = await sparqlGetIndividuals(schema, params);
		}
		if ( fn === 'getTreeIndividuals') {
			r = await sparqlGetIndividuals(schema, params);
		}
		if ( fn === 'resolveClassByName') {
			const classObj = await util.getClassByName(util.getName(params), schema);
			r = util.getSchemaObject(classObj);
		}
		if ( fn === 'resolvePropertyByName') {
			const propObj = await util.getPropertyByName(util.getName(params), schema);
			r = util.getSchemaObject(propObj);
		}
		if ( fn === 'checkProperty') {
			r = await checkProperty(schema, params);
		}
		

		r.ontology = ont;
		res.json(r)	

    } catch(err) {
        console.error(err)
        next(err)
    }
});


/**
 * Example for a generic route where all parameters including the function name are provided in JSON
 */
router.post('/fn1', async (req, res, next) => {
    const params = req.body;
    const fname = params['fname']
    console.log(fname, params);

    // calculate the result
    let result = {kaut: 1, kas: 3, input: req.body}

    res.json(result)
});


module.exports = router;
