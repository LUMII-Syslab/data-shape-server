const express = require('express');
const router = express.Router();
const debug = require('debug')('dss:index')

const db = require('./db')

const { 
    getOntologyClasses, 
    getOntologyClassesFiltered, 
	getOntologyNameSpaces,
	getSchemaClasses,
	getSchemaClassesFiltered,
	getSchemaProperties,
	getSchemaClassProperties,
} = require('./class-handlers')

const { 
    executeSPARQL,
    getClassProperties,
} = require('../../util/sparql/endpoint-queries')

// TODO: get this list from the db  
const KNOWN_ONTOLOGIES = [
    'dbpedia',
    'leldes_smilskaste',
    'c',
    'd',
	'sample',
]

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

const parameterExists = (parTree, par) => {
	let r = true;
	if ( parTree[par] === undefined || parTree[par] === "" || parTree[par].length == 0)
		r = false
	return r;
}

/* API root */
router.get('/', (req, res, next) => {
  res.send('API root');
});

router.get('/test', async (req, res, next) => {
  const p = await getClassProperties("https://dbpedia.org/sparql", "http://dbpedia.org/ontology/Agent", false, 100);
  res.json(p)
  //res.send('aaa');
});

/**
 * List of known ontologies
 */
router.get('/ontologies', (req, res, next) => {
  res.json(KNOWN_ONTOLOGIES);
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
		console.log(ont)
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
		console.log(cl)
    //   res.type('application/json').status(200).send(JSON.stringify(data, null, 2));
      res.json(cl)
    } catch(err) {
        console.error(err)
        next(err)
    }
});

/* list of properties */
router.get('/ontologies/:ont/properties', (req, res, next) => {
    const data = [
        'a',
        'b',
        'c',
        'd',
    ]
  res.send(JSON.stringify(data, null, 2));
});

/**
 * Example for a generic route where all parameters except the function name are provided in JSON
 */
router.post('/fn/:fname', async (req, res, next) => {
    const fname = req.params['fname']
    const params = req.body;
    console.log(fname, params);

    // calculate the result
    let result = {kaut: 1, kas: 3, input: req.body}

    res.json(result)
});

router.post('/ontologies/:ont/getClasses', async (req, res, next) => {
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

		const params = req.body;
	    console.log(params);
		let r = {}
		//if ( params.filter !== undefined && params.filter !== "")
		if ( parameterExists(params, "filter") )
			r = await getSchemaClassesFiltered(schema, params.filter)
		else
			r = await getSchemaClasses(schema)
		r.ontology = ont;
		res.json(r)	

    } catch(err) {
        console.error(err)
        next(err)
    }
});

router.post('/ontologies/:ont/getProperties', async (req, res, next) => {
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

		const params = req.body;
	    console.log(params);
		let r = {}

		if ( parameterExists(params, "uriClass") )
			r = await getSchemaClassProperties(schema, params.uriClass)
		else  
			r = await getSchemaProperties(schema)
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
