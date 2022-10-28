const express = require('express');
const router = express.Router();
const debug = require('debug')('dss:index')
const util = require('./utilities')

const db = require('./db')

const { 
	getClasses,
	getTreeClasses,
	getNamespaces,
	xx_getClassList,
	xx_getClassListInfo,
	xx_getClassInfo,
	xx_getClassInfoAtr,
	xx_getClassInfoLink,
	xx_getPropListInfo,
	xx_getCCInfo,
	xx_getPropListInfo2,
} = require('./class-handlers')

const { 
	getProperties,
	getNextProperties,
	checkProperty,
} = require('./property-handlers')

const { 
    executeSPARQL,
	sparqlGetIndividuals,
	sparqlGetTreeIndividuals,
	sparqlGetIndividualByName,
} = require('../../util/sparql/endpoint-queries')

const validateOntologyName = name => /^[a-zA-Z0-9_-]+$/.test(name)

const checkSchemaName = async (name) => {
	const kd = await util.get_KNOWN_DATA();
	const s = kd.find(x => x.db_schema_name == name);
	if (s !== undefined) return s.db_schema_name;
	else return '';
}

const makeOutput = data => {
	return {prefix:data.prefix, name:data.display_name, cnt:data.cnt_x, iri:data.iri};
}

const checkOntology = async (ont) => {
	let err = {err_msg: ''};
	if (!validateOntologyName(ont)) {
		err.status = 400;
		err.err_msg = 'bad ontology name';
	}
	const schema = await checkSchemaName(ont);

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
router.get('/info', async (req, res, next) => {
  const kd = await util.get_KNOWN_DATA();
  res.json(kd);
});

/**
 * List of namespaces in given ontology
 */
router.get('/ontologies/:ont/ns', async (req, res, next) => {
    try {
        const ont = req.params['ont'];
		const err = await checkOntology(ont);
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
		const err = await checkOntology(ont);
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
		const err = await checkOntology(ont);
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
		const err = await checkOntology(ont);
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
		const err = await checkOntology(ont);
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
		
		const err = await checkOntology(ont);
		if ( err.err_msg !== '') {
			res.status(err.status).send(err.err_msg);
			return;
		}
		const schema = err.schema;
		let params = req.body;
		const kd = await util.get_KNOWN_DATA();
		params = await util.checkEndpoint(params, schema, kd);
	    console.log(params);
		
		let r = { complete: false };
		if ( fn === 'getClasses')
			r = await getClasses(schema, params);
		if ( fn === 'getTreeClasses')
			r = await getTreeClasses(schema, params);
		if ( fn === 'getProperties')
			r = await getProperties(schema, params);
		if ( fn === 'getNamespaces')
			r = await getNamespaces(schema);
		if ( fn === 'getIndividuals') {
			// r = [];	
			// const find = await util.checkIndividualsParams(schema, params);
			// if ( find ) // Lielajām klasēm nedod instances, ja nav precizējumu
			r = await sparqlGetIndividuals(schema, params);
		}
		if ( fn === 'getTreeIndividuals') {
			r = await sparqlGetTreeIndividuals(schema, params);
		}
		if ( fn === 'resolveClassByName') {
			const classObj = await util.getClassByName(util.getName(params), schema);
			r = util.getSchemaObject(classObj);
		}
		if ( fn === 'resolvePropertyByName') {
			const propObj = await util.getPropertyByName(util.getName(params), schema, params);
			r = util.getSchemaObject(propObj);
		}
		if ( fn === 'resolveIndividualByName') {
			const indObj = await sparqlGetIndividualByName(util.getName(params), params, schema);
			r = util.getSchemaObject(indObj);
		}
		if ( fn === 'checkProperty') {
			r = await checkProperty(schema, params);
		}
		if ( fn === 'xx_getClassList') {
			r = await xx_getClassList(schema, params);
		}
		if ( fn === 'xx_getClassListInfo') {
			r = await xx_getClassListInfo(schema, params);
		}
		if ( fn === 'xx_getPropListInfo') {
			r = await xx_getPropListInfo(schema, params);
		}
		if ( fn === 'xx_getCCInfo') {
			r = await xx_getCCInfo(schema, params);
		}
		if ( fn === 'xx_getClassInfo') {
			r = await xx_getClassInfo(schema, params);
		}
		if ( fn === 'xx_getClassInfoAtr') {
			r = await xx_getClassInfoAtr(schema, params);
		}
		if ( fn === 'xx_getClassInfoLink') {
			r = await xx_getClassInfoLink(schema, params);
		}	
		if ( fn === 'xx_getPropListInfo2') {
			r = await xx_getPropListInfo2(schema, params);
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