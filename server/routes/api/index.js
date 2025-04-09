const express = require('express');
const router = express.Router();
const debug = require('debug')('dss:index')
const c = require('ansi-colors')

const util = require('./utilities')

const db = require('./db')

const { 
	get_KNOWN_DATA5,
	getClasses,
	getTreeClasses,
	getNamespaces,
	getPublicNamespaces,
	xx_getClassList,
	xx_getClassListExt,
	xx_getPropList,
	xx_getPropList2,
	xx_getPropList3,
	xx_getClassListInfo,
	xx_getClassInfo,
	xx_getClassInfoAtr,
	xx_getClassInfoLink,
	xx_getPropListInfo,
	xx_getCCInfo,
	xx_getCCInfoNew,
	xx_getCCInfo_Type3,
	xx_getCPInfo,
	xx_getCPCInfo,
	xx_getCPInfoNew,
	xx_getCPCInfoNew,
	xx_getCPCInfoWithNames,
	xx_getClassCPCCounts,
	xx_getPropListInfo2,
	xx_getPropInfo,
	generateClassUpdate,
} = require('./class-handlers')

const { 
	getProperties,
	checkProperty,
} = require('./property-handlers')

const { 
	getPropertiesNew,
	getClassifiers,
} = require('./property-handlers-new')

const { 
    executeSPARQL,
	sparqlGetIndividualsNew,
	sparqlGetTreeIndividualsNew,
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

const wrapAsync = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next))
      .catch(e => {
        console.trace('Error', e);
        console.trace('Route', c.yellow(req.path), req.method);
        res.json({error: `${e.message}`})
      });
}

/* API root */
router.get('/', (req, res, next) => {
  res.send('API root');
});

/**
 * List of known schema tags
 */
router.get('/schema_tags', wrapAsync(async (req, res, next) => {
  const d = await util.getAllSchemaTags();
  res.json(d);
}));

/**
 * List of known ontologies
 */
router.get('/info', wrapAsync(async (req, res, next) => {
  const kd = await util.get_KNOWN_DATA2();
  res.json(kd);
}));
router.get('/info2', wrapAsync(async (req, res, next) => {
  const kd = await util.get_KNOWN_DATA2();
  res.json(kd);
}));
router.get('/info3/:tag', wrapAsync(async (req, res, next) => {
    const kd = await util.get_KNOWN_DATA3(req.params.tag);
    res.json(kd);
}));
router.get('/info3', wrapAsync(async (req, res, next) => {
  const kd = await util.get_KNOWN_DATA3();
  res.json(kd);
}));
router.get('/info5', wrapAsync(async (req, res, next) => {
	const kd = await get_KNOWN_DATA5();
	res.json(kd);
  }));
router.get('/infoOntTags', wrapAsync(async (req, res, next) => {
	const kd = await util.get_KNOWN_DATA_OntTags();
	res.json(kd);
}));


/**
 * List of known prefixes
 */
router.get('/public_ns', wrapAsync(async (req, res, next) => {
  const ns = await getPublicNamespaces();
  res.json(ns);
}));

/**
 * List of namespaces in given ontology
 */
router.get('/ontologies/:ont/ns', wrapAsync(async (req, res, next) => {
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
}));

/**
 * List of classes in given ontology
 */
router.get('/ontologies/:ont/classes/:limit', wrapAsync(async (req, res, next) => {
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
}));

/**
 * List of classes in given ontology whose name or prefix matches given filter
 */
router.get('/ontologies/:ont/classes-filtered/:filter/:limit', wrapAsync(async (req, res, next) => {
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
}));

/**
 * List of properties in given ontology
 */
router.get('/ontologies/:ont/properties/:limit', wrapAsync(async (req, res, next) => {
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
}));

/**
 * List of properties in given ontology whose name or prefix matches given filter
 */
router.get('/ontologies/:ont/properties-filtered/:filter/:limit', wrapAsync(async (req, res, next) => {
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
}));

// ***********************************************************************************
router.post('/ontologies/:ont/:fn', wrapAsync(async (req, res, next) => {
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
		if ( fn === 'xx_getClassCount') {
			const classCount = await db.any(`SELECT count(*) from ${schema}.classes`);
			r = classCount[0].count;
		}
		if ( fn === 'xx_getPropertyInfo') {
			const propCount = await db.any(`SELECT count(*), max(cnt) from ${schema}.properties`);
			r = {count:propCount[0].count, max:propCount[0].max};
		}
		if ( fn === 'getTreeClasses')
			r = await getTreeClasses(schema, params);
		if ( fn === 'getProperties') {
			const view_info = await db.any(`SELECT count(*) FROM information_schema.views v where table_schema = '${schema}' and  table_name = 'v_cp_sources_single'`);
			if ( view_info[0].count > 0)   // TODO kaut kad būs tikai jaunais variants
				r = await getPropertiesNew(schema, params);  
			else
				r = await getProperties(schema, params); 
		}
		if ( fn === 'getClassifiers')
			r = await getClassifiers(schema, params);
		
		if ( fn === 'getNamespaces')
			r = await getNamespaces(schema);
			
		if ( fn === 'getIndividuals') {
			// r = [];	
			// const find = await util.checkIndividualsParams(schema, params);
			// if ( find ) // Lielajām klasēm nedod instances, ja nav precizējumu
			r = await sparqlGetIndividualsNew(schema, params);
		}
		if ( fn === 'getTreeIndividuals') {
			r = await sparqlGetTreeIndividualsNew(schema, params);
		}
		if ( fn === 'resolveClassByName') {
			const classObj = await util.getClassByName(util.getName(params), schema, params);
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
		if ( fn === 'generateClassUpdate') {
			r = await generateClassUpdate(schema, params);
		}
		if ( fn === 'xxx_test') {
			//r = await test(schema, params);
		}
		if ( fn === 'xx_getClassList') {
			r = await xx_getClassList(schema, params);
		}
		if ( fn === 'xx_getClassListExt') {
			r = await xx_getClassListExt(schema, params);
		}
		if ( fn === 'xx_getPropList') {
			r = await xx_getPropList(schema, params);
		}
		if ( fn === 'xx_getPropList2') {
			r = await xx_getPropList2(schema, params);
		}
		if ( fn === 'xx_getPropList3') {
			r = await xx_getPropList3(schema, params);
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
		if ( fn === 'xx_getCCInfoNew') {
			r = await xx_getCCInfoNew(schema, params);
		}
		if ( fn === 'xx_getCCInfo_Type3') {
			r = await xx_getCCInfo_Type3(schema, params);
		}
		if ( fn === 'xx_getCPInfo') {
			r = await xx_getCPInfo(schema, params);
		}
		if ( fn === 'xx_getCPInfoNew') {
			r = await xx_getCPInfoNew(schema, params);
		}
		if ( fn === 'xx_getCPCInfo') {
			r = await xx_getCPCInfo(schema, params);
		}
		if ( fn === 'xx_getCPCInfoNew') {
			r = await xx_getCPCInfoNew(schema, params);
		}
		if ( fn === 'xx_getCPCInfoWithNames') {
			r = await xx_getCPCInfoWithNames(schema, params);
		}
		if ( fn === 'xx_getClassCPCCounts') {
			r = await xx_getClassCPCCounts(schema, params);
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
		if ( fn === 'xx_getPropInfo') {
			r = await xx_getPropInfo(schema, params);
		}		

		r.ontology = ont;
		res.json(r)	

    } catch(err) {
        console.error(err)
        next(err)
    }
}));


/**
 * Example for a generic route where all parameters including the function name are provided in JSON
 */
router.post('/fn1', wrapAsync(async (req, res, next) => {
    const params = req.body;
    const fname = params['fname']
    console.log(fname, params);

    // calculate the result
    let result = {kaut: 1, kas: 3, input: req.body}

    res.json(result)
}));


module.exports = router;