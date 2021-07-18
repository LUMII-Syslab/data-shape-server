const express = require('express');
const router = express.Router();
const debug = require('debug')('dss:index')

const db = require('./db')

const { 
    getOntologyClasses, 
    getOntologyClassesFiltered, 
	getOntologyNameSpaces,
	getClasses,
	getNamespaces,
} = require('./class-handlers')

const { 
	getProperties,
} = require('./property-handlers')

const { 
    parameterExists,
	checkEndpoint,
	getClassByName,
	getPropertyByName,
	getSchemaObject,
} = require('./utilities')

const { 
    executeSPARQL,
    getClassProperties,
} = require('../../util/sparql/endpoint-queries')

// TODO: get this info from the db
const KNOWN_DATA = [ 
	{name: 'V1_dbpedia', schema:'dbpedia' },
    {name: 'V2_miniUniv', schema:'leldes_smilskaste'},
	{name: 'V4_wikidata', schema:'wikidata'},
    {name: 'V3_empty', schema:'sample'},
]

const validateOntologyName = name => /^[a-zA-Z0-9_]+$/.test(name)

const getSchemaName = name => {
	const s = KNOWN_DATA.find(x => x.name == name);
	if (s !== undefined) return s.schema;
	else return "";
}


/* API root */
router.get('/', (req, res, next) => {
  res.send('API root');
});

/**
 * List of known data
 */
router.get('/info', (req, res, next) => {
  res.json({info:KNOWN_DATA});
});

/**
 * List of namespaces in given ontology
 */
router.get('/ontologies/:ont/ns', async (req, res, next) => {
    try {
        const ont = req.params['ont'];
		if (!validateOntologyName(ont)) {
            res.status(400).send('bad ontology name')
            return
        }
		const schema = getSchemaName(ont);
        if (schema === "" ) {
            res.status(404).send('unknown ontology')
			return
        }
        const ns = await getOntologyNameSpaces(schema)
        const data = {
            ontology: ont,
            ns: ns,
        }
		//   res.type('application/json').status(200).send(JSON.stringify(data, null, 2));
        res.json(data)
    } catch(err) {
        console.error(err)
        next(err)
    }
});

/**
 * List of classes in given ontology
 */
router.get('/ontologies/:ont/classes', async (req, res, next) => {
    try {
        const ont = req.params['ont'];
        if (!validateOntologyName(ont)) {
            res.status(400).send('bad ontology name')
            return
        }
		
		const schema = getSchemaName(ont);
        if (schema === "" ) {
            res.status(404).send('unknown ontology')
            return
        }

        const cl = await getOntologyClasses(schema)
        const data = {
            ontology: ont,
            data: cl,
        }
    //   res.type('application/json').status(200).send(JSON.stringify(data, null, 2));
      res.json(data)
    } catch(err) {
        console.error(err)
        next(err)
    }
});

/**
 * List of classes in given ontology whose IRI matches given filter
 */
router.get('/ontologies/:ont/classes-filtered/:filter', async (req, res, next) => {
    try {
        const ont = req.params['ont'];
        if (!validateOntologyName(ont)) {
            res.status(400).send('bad ontology name')
            return
        }

		const schema = getSchemaName(ont);
        if (schema === "" ) {
            res.status(404).send('unknown ontology')
			return
        }
        const filter = req.params['filter'];
        if (!filter) {
            res.status(400).send('parameter missing')
			return
        }

        let cl = await getOntologyClassesFiltered(schema, filter)
		cl.ontology = ont;
		//console.log(cl)
    //   res.type('application/json').status(200).send(JSON.stringify(data, null, 2));
      res.json(cl)
    } catch(err) {
        console.error(err)
        next(err)
    }
});

// ***********************************************************************************88
router.post('/ontologies/:ont/:fn', async (req, res, next) => {
	console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
    try {
        const ont = req.params['ont'];
		const fn = req.params['fn'];
        if (!validateOntologyName(ont)) {
            res.status(400).send('bad ontology name')
            return
        }

		const schema = getSchemaName(ont);
        if (schema === "" ) {
            res.status(404).send('unknown ontology')
			return
        }

		let params = req.body;
		params = await checkEndpoint(params)
	    console.log(params);
		
		let r = { complete: false };
		if ( fn === 'getClasses')
			r = await getClasses(schema, params)
		if ( fn === 'getProperties')
			r = await getProperties(schema, params)
		if ( fn === 'getNamespaces')
			r = await getNamespaces(schema, params)
		if ( fn === 'resolveClassByName') {
			const classObj = await getClassByName(params.name, schema);
			r = getSchemaObject(classObj)
		}
		if ( fn === 'resolvePropertyByName') {
			const propObj = await getPropertyByName(params.name, schema);
			r = getSchemaObject(propObj)
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
