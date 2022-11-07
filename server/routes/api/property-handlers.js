const db = require('./db')
const util = require('./utilities')
const debug = require('debug')('dss:classops')

const { 
    executeSPARQL,
    sparqlGetClassProperties,
	sparqlGetPropertiesFromIndividuals,
	sparqlGetPropertiesFromClass,
	sparqlGetPropertiesFromRemoteIndividual,
} = require('../../util/sparql/endpoint-queries')

const checkProperty = async (schema, params) => {
	let r = { data: [], complete: false };
	const className = util.getName(params);
	const propertyName = util.getPropertyName(params);
	const classObj = await util.getClassByName(className, schema);
	const propObj = await util.getPropertyByName(propertyName, schema, params); 
	const typeString = await util.getTypeString(schema, params);
	
	if ( classObj.length > 0 && propObj.length > 0 && classObj[0].props_in_schema ) {
		const sql = `SELECT * from ${schema}.v_cp_rels where class_id = ${classObj[0].id} and property_id = ${propObj[0].id}`;
		r = await util.getSchemaData(sql, params);
	}
	else if (classObj.length > 0 && propObj.length > 0) {
		const sparqlOut = `select count(?x1) where {?x1 ${typeString} <${classObj[0].iri}>. ?x1 <${propObj[0].iri}> [].}`;
		const outPropC = await executeSPARQL(util.getEndpointUrl(params), sparqlOut);
		if ( outPropC[0]['callret-0'].value !== '0') 
			r.data.push({ctn: parseInt(outPropC[0]['callret-0'].value), type_id: 2});

		const sparqlIn = `select count(?x1) where {?x1 ${typeString} <${classObj[0].iri}>. [] <${propObj[0].iri}> $x1.}`;
		const inPropC = await executeSPARQL(util.getEndpointUrl(params), sparqlIn);
		if ( inPropC[0]['callret-0'].value !== '0') 
			r.data.push({ctn: parseInt(inPropC[0]['callret-0'].value), type_id: 1});		
	}

	//*** select count(?x1) where {?x1 rdf:type <http://dbpedia.org/ontology/Country>. ?x1 <http://dbpedia.org/ontology/abstract> [].}
	//*** select count(?x1) where {?x1 rdf:type <http://dbpedia.org/ontology/Country>. [] <http://dbpedia.org/ontology/birthPlace> ?x1.}
	return r;
}

const findMainProperty = async (schema, pListFrom, pListTo) => {

	if ( pListFrom.in.length === 1)
		return { id: pListFrom.in[0], type: 'in', class: 'from' };
	if ( pListFrom.in.length > 1){
		const r =  await db.any(`SELECT id FROM ${schema}.properties where ${util.formWherePart('id', 'in', pListFrom.in, 0)} order by object_cnt limit 1`); 
		return { id: r[0].id, type: 'in', class: 'from' }
	}
	
	if ( pListTo.in.length === 1)
		return { id: pListTo.in[0], type: 'in', class: 'to' };
	if ( pListTo.in.length > 1){
		const r =  await db.any(`SELECT id FROM ${schema}.properties where ${util.formWherePart('id', 'in', pListTo.in, 0)} order by object_cnt limit 1`); 
		return { id: r[0].id, type: 'in', class: 'to' }
	}
	
	if ( pListFrom.out.length === 1)
		return { id: pListFrom.out[0], type: 'out', class: 'from' };
	if ( pListFrom.out.length > 1){
		const r =  await db.any(`SELECT id FROM ${schema}.properties where ${util.formWherePart('id', 'in', pListFrom.out, 0)} order by cnt limit 1`); 
		return { id: r[0].id, type: 'out', class: 'from'  }
	}
	
	if ( pListTo.out.length === 1)
		return { id: pListTo.out[0], type: 'out', class: 'to' };
	if ( pListTo.out.length > 1){
		const r =  await db.any(`SELECT id FROM ${schema}.properties where ${util.formWherePart('id', 'in', pListTo.out, 0)} order by cnt limit 1`); 
		return { id: r[0].id, type: 'out', class: 'to' }
	}
	return {};
}

/* list of properties */
const getProperties = async (schema, params) => {
   	let r = { data: [], complete: false };
	let sql;
	let viewname_out;
	let viewname_in;
	let two_steps = false;
	const use_pp_rels = util.getUsePP(params);
	const simplePrompt = util.getSimplePrompt(params);
	if (simplePrompt)
		two_steps = true;
	//let viewname = 'v_properties_ns';  
	if ( util.isLinksWithTargets(params)) {
		viewname_out = 'v_properties_targets_single';
		viewname_in = 'v_properties_sources_single';
	}
	else {
		viewname_out = 'v_properties_ns';
		viewname_in = 'v_properties_ns';
	}

	let classFrom = [];
	let classTo = [];
	let whereListA = [ true ];
	let whereListB = [ true ];
	let whereListA_2 = [ true ];
	let whereListB_2 = [ true ];
	let contextA = '';
	let contextB = '';
	let strOrderField = 'cnt';
	let strAo = '';
	let strBo = '';
	let cardA = 'v.max_cardinality';
	let cardB = 'v.inverse_max_cardinality';
	
	async function addToWhereList(propListAB)  {
		//console.log(`SELECT id FROM ${schema}.properties where ${util.formWherePart('iri', 'in', propListAB.A, 1)}`)
		const idListA = await db.any(`SELECT id FROM ${schema}.properties where ${util.formWherePart('iri', 'in', propListAB.A, 1)} order by id`);
		if ( idListA.length > 0) 
			whereListA.push(util.formWherePart('v.id', 'in', idListA.map(v => v.id), 0));
		else
			whereListA.push('false');
		//console.log(`SELECT id FROM ${schema}.properties where ${util.formWherePart('iri', 'in', propListAB.B, 1)}`)	
		const idListB = await db.any(`SELECT id FROM ${schema}.properties where ${util.formWherePart('iri', 'in', propListAB.B, 1)} order by id`);
		if ( idListB.length > 0) 
			whereListB.push(util.formWherePart('v.id', 'in', idListB.map(v => v.id), 0));
		else
			whereListB.push('false');
	}
	async function formSql()  {
		//if ( strOrderField !== 'cnt' ) {
		//	whereListA.push(`${strAo} > 0`);
		//	whereListB.push(`${strBo} > 0`);	
			//whereListA.push(`v.${strOrderField} > 0`);  
			//whereListB.push(`v.${strOrderField} > 0`);	
		// }  
		//const orderByPref = ( util.isOrderByPrefix(params) ? util.getOrderByPrefix(params) : '');
		const orderByPref = ( util.getIsBasicOrder(params) ? `case when ${ util.getDeferredProperties(params)} then 0.5 else basic_order_level end, ` : '');

		let sql = `SELECT aa.* FROM ( SELECT 'out' as mark, ${cardA} as x_max_cardinality, v.*, ${strAo} as o 				
FROM ${schema}.${viewname_out} v ${contextA}
WHERE ${whereListA.join(' and ')} 
) aa where o > 0
order by ${orderByPref} o desc LIMIT $1`;

	if ( two_steps && ( util.getPropertyKind(params) === 'ObjectExt' || util.getPropertyKind(params) === 'Connect')) {
		let out_prop_ids = [];
		let in_prop_ids = [];
		whereListA.push(`${strAo} > 0`);
		whereListB.push(`${strBo} > 0`);
		const sql_out = `SELECT v.id FROM ${schema}.v_properties_ns v ${contextA} WHERE ${whereListA.join(' and ')} order by ${orderByPref.replace("id in","v.id in")} ${strAo} desc LIMIT $1`;
		const out_props = await util.getSchemaData(sql_out,params);
		if ( out_props.data.length > 0) 
			out_prop_ids = out_props.data.map(v => v.id);
		const sql_in = `SELECT v.id FROM ${schema}.v_properties_ns v ${contextB} WHERE ${whereListB.join(' and ')} order by ${orderByPref.replace("id in","v.id in")} ${strBo} desc LIMIT $1`;
		const in_props = await util.getSchemaData(sql_in,params);
		if ( in_props.data.length > 0) 
			in_prop_ids = in_props.data.map(v => v.id);

		if ( out_prop_ids.length > 0 && in_prop_ids.length > 0 ) {
			whereListA_2.push(util.formWherePart('v.id', 'in', out_prop_ids, 0));
			whereListB_2.push(util.formWherePart('v.id', 'in', in_prop_ids, 0));
			sql = `SELECT aa.* FROM (
SELECT 'out' as mark, ${cardA} as x_max_cardinality, v.*, ${strAo} as o 
FROM ${schema}.${viewname_out} v ${contextA}
WHERE ${whereListA_2.join(' and ')} 
UNION ALL
SELECT 'in' as mark, ${cardB} as x_max_cardinality, v.*, ${strBo} as o   
FROM ${schema}.${viewname_in} v ${contextB}
WHERE ${whereListB_2.join(' and ')} 
) aa where o > 0
order by ${orderByPref} o desc LIMIT $1`;			
		}
		else {
			if ( out_prop_ids.length > 0 ) {
				whereListA_2.push(util.formWherePart('v.id', 'in', out_prop_ids, 0));
				sql = `SELECT aa.* FROM (
SELECT 'out' as mark, ${cardA} as x_max_cardinality, v.*, ${strAo} as o 
FROM ${schema}.${viewname_out} v ${contextA}
WHERE ${whereListA_2.join(' and ')} 
) aa where o > 0
order by ${orderByPref} o desc LIMIT $1`;				
			}
			if (  in_prop_ids.length > 0 ) {
				whereListB_2.push(util.formWherePart('v.id', 'in', in_prop_ids, 0));
				sql = `SELECT aa.* FROM (
SELECT 'in' as mark, ${cardB} as x_max_cardinality, v.*, ${strBo} as o   
FROM ${schema}.${viewname_in} v ${contextB}
WHERE ${whereListB_2.join(' and ')} 
) aa where o > 0
order by ${orderByPref} o desc LIMIT $1`;
			}
		}
	}

		if (!two_steps && ( util.getPropertyKind(params) === 'ObjectExt' || util.getPropertyKind(params) === 'Connect')) {
			sql = `SELECT aa.* FROM (
SELECT 'out' as mark, ${cardA} as x_max_cardinality, v.*, ${strAo} as o 
FROM ${schema}.${viewname_out} v ${contextA}
WHERE ${whereListA.join(' and ')} 
UNION ALL
SELECT 'in' as mark, ${cardB} as x_max_cardinality, v.*, ${strBo} as o   
FROM ${schema}.${viewname_in} v ${contextB}
WHERE ${whereListB.join(' and ')} 
) aa where o > 0
order by ${orderByPref} o desc LIMIT $1`;
		}
		return sql;
	}
	function classType(classO) {
		if ( classO.length == 0 )
			return 'n';
		if ( classO[0].props_in_schema === false )	
			return 's';
		if ( classO[0].props_in_schema === true )
			return 'b';
		return 'n'  
	} 
	
	if ( util.isPropertyKind(params)) {
		if ( util.getPropertyKind(params) === 'Data' ) 
			strOrderField = 'data_cnt';
		if ( util.getPropertyKind(params) === 'Object' || util.getPropertyKind(params) === 'ObjectExt' || util.getPropertyKind(params) === 'Connect') 
			strOrderField = 'object_cnt';
	}
	else  params = util.setPropertyKind(params, 'All');
	
	if ( util.isFilter(params)) {
		whereListA.push(`v.${util.getFilterColumn(params)} ~ $2`); 
		whereListB.push(`v.${util.getFilterColumn(params)} ~ $2`);
		whereListA_2.push(`v.${util.getFilterColumn(params)} ~ $2`); 
		whereListB_2.push(`v.${util.getFilterColumn(params)} ~ $2`);
	}
	
	if ( util.isNamespaces(params)) {
		whereListA.push(util.getNsWhere(params));
		whereListB.push(util.getNsWhere(params));
	}

	if ( util.isClassName(params, 0))
		classFrom = await util.getClassByName(util.getClassName(params, 0), schema);
	if ( util.isClassName(params, 1))
		classTo = await util.getClassByName(util.getClassName(params, 1), schema);

	let newPListFrom = {in:[], out:[]};
	let newPListTo = {in:[], out:[]};
	if ( util.isPList(params, 0) )
		newPListFrom = await util.getIdsfromPList(schema, util.getPList(params, 0), params);
	if ( util.isPList(params, 1) )
		newPListTo = await util.getIdsfromPList(schema, util.getPList(params, 1), params);

	//console.log(classFrom)
	const only_out = !(util.getPropertyKind(params) === 'ObjectExt' || util.getPropertyKind(params) === 'Connect');
	if ( classType(classFrom) === 's' || classType(classTo)=== 's' || util.isUriIndividual(params, 0) || util.isUriIndividual(params, 1) || util.isPListI(params) ) {
		if ( util.isUriIndividual(params, 0) && util.isUriIndividual(params, 1)) {
				const indFrom = await util.getUriIndividual(schema, params, 0);
				const indTo = await util.getUriIndividual(schema, params, 1);
				const propListAB = await sparqlGetPropertiesFromIndividuals(params, 'All', only_out, indFrom, indTo); 
				await addToWhereList(propListAB);
		}	
		else {
			if ( util.isUriIndividual(params, 0) || util.isUriIndividual(params, 1)) {
				if ( util.isUriIndividual(params, 0) ) {
					const ind = await util.getUriIndividual(schema, params, 0);
					const propListAB = await sparqlGetPropertiesFromIndividuals(params, 'From', only_out, ind);
					await addToWhereList(propListAB);
				}
				if ( util.isUriIndividual(params, 1) ) {
					const ind = await util.getUriIndividual(schema, params, 1);
					const propListAB = await sparqlGetPropertiesFromIndividuals(params, 'To', only_out, ind);
					await addToWhereList(propListAB);
				}
			}
			else if ( util.isPListI(params)) {
				const propListAB = await sparqlGetPropertiesFromRemoteIndividual(params, schema, only_out);
				await addToWhereList(propListAB);

			}
			else {
				if ( classType(classFrom) === 's') {
					const propListAB = await sparqlGetPropertiesFromClass(schema, params, 'From', classFrom[0].iri, only_out);
					//console.log(propListAB)
					await addToWhereList(propListAB);
				}
				if ( classType(classTo)=== 's' ) {
					const propListAB = await sparqlGetPropertiesFromClass(schema, params, 'To', classTo[0].iri, only_out);
					await addToWhereList(propListAB);
				}
			}
		}
		
		if (strAo === '') {
			const ot = ( contextA == '' ? 'v.' : 'r.')
			strAo = `${ot}${strOrderField}`;
			strBo = `${ot}${strOrderField}`;
		}
	}
	else {
		if ( classType(classFrom) === 'b') {
			cardA = 'r.x_max_cardinality';
			cardB = 'r.x_max_cardinality';
			contextA = `, ${schema}.v_cp_rels_card r`;
			contextB = `, ${schema}.v_cp_rels_card r`;
			whereListA.push(`property_id = v.id and r.type_id = 2 and class_id = ${classFrom[0].id}`);
			whereListB.push(`property_id = v.id and r.type_id = 1 and class_id = ${classFrom[0].id}`);
			two_steps = true;
			whereListA_2.push(`property_id = v.id and r.type_id = 2 and class_id = ${classFrom[0].id}`);
			whereListB_2.push(`property_id = v.id and r.type_id = 1 and class_id = ${classFrom[0].id}`);
		} 
		if ( classType(classTo) === 'b' ){
			if ( contextA === '' ) {
				contextA = `, ${schema}.v_cp_rels_card r`;
				contextB = `, ${schema}.v_cp_rels_card r`;
				whereListA.push(`property_id = v.id and r.type_id = 1 and class_id = ${classTo[0].id}`);
				whereListB.push(`property_id = v.id and r.type_id = 2 and class_id = ${classTo[0].id}`);
				two_steps = true;
				whereListA_2.push(`property_id = v.id and r.type_id = 1 and class_id = ${classTo[0].id}`);
				whereListB_2.push(`property_id = v.id and r.type_id = 2 and class_id = ${classTo[0].id}`);
			}
			else {
				whereListA.push(`v.id in (select property_id from ${schema}.v_cp_rels_card r where r.type_id = 1 and class_id = ${classTo[0].id})`);
				whereListB.push(`v.id in (select property_id from ${schema}.v_cp_rels_card r where r.type_id = 2 and class_id = ${classTo[0].id})`);
			}
		}  
		if ( newPListFrom.in.length > 0 || newPListFrom.out.length > 0 || newPListTo.in.length > 0 || newPListTo.out.length > 0) {
			if ( use_pp_rels ) {
				if ( contextA === '' ) {  // Ir tikai properijas
					const mainProp = await findMainProperty(schema, newPListFrom, newPListTo);
					console.log("--------galvenā----------")
					console.log(mainProp)
					newPListFrom.in = newPListFrom.in.filter(item => item !== mainProp.id);
					newPListFrom.out = newPListFrom.out.filter(item => item !== mainProp.id);
					newPListTo.in = newPListTo.in.filter(item => item !== mainProp.id);
					newPListTo.out = newPListTo.out.filter(item => item !== mainProp.id);
					//console.log(newPListFrom)

					contextA = `, ${schema}.pp_rels r`;
					contextB = `, ${schema}.pp_rels r`;
					if ( mainProp.type === 'in' && mainProp.class === 'from' ) {
						whereListA.push(`v.id = r.property_2_id and r.type_id = 1 and property_1_id = ${mainProp.id}`);
						whereListB.push(`v.id = r.property_2_id and r.type_id = 3 and property_1_id = ${mainProp.id}`);
						two_steps = true;
						whereListA_2.push(`v.id = r.property_2_id and r.type_id = 1 and property_1_id = ${mainProp.id}`);
						whereListB_2.push(`v.id = r.property_2_id and r.type_id = 3 and property_1_id = ${mainProp.id}`);
					}
					if ( mainProp.type === 'out' && mainProp.class === 'from' ) {
						whereListA.push(`v.id = r.property_2_id and r.type_id = 2 and property_1_id = ${mainProp.id}`);
						whereListB.push(`v.id = r.property_1_id and r.type_id = 1 and property_2_id = ${mainProp.id}`);
						two_steps = true;
						whereListA_2.push(`v.id = r.property_2_id and r.type_id = 2 and property_1_id = ${mainProp.id}`);
						whereListB_2.push(`v.id = r.property_1_id and r.type_id = 1 and property_2_id = ${mainProp.id}`);
					}
					if ( mainProp.type === 'in' && mainProp.class === 'to' ) {
						whereListA.push(`v.id = r.property_2_id and r.type_id = 3 and property_1_id = ${mainProp.id}`);
						whereListB.push(`v.id = r.property_2_id and r.type_id = 1 and property_1_id = ${mainProp.id}`);
						two_steps = true;
						whereListA_2.push(`v.id = r.property_2_id and r.type_id = 3 and property_1_id = ${mainProp.id}`);
						whereListB_2.push(`v.id = r.property_2_id and r.type_id = 1 and property_1_id = ${mainProp.id}`);
					}
					if ( mainProp.type === 'out' && mainProp.class === 'to' ) {
						whereListA.push(`v.id = r.property_1_id and r.type_id = 1 and property_2_id = ${mainProp.id}`);
						whereListB.push(`v.id = r.property_2_id and r.type_id = 2 and property_1_id = ${mainProp.id}`);
						two_steps = true;
						whereListA_2.push(`v.id = r.property_1_id and r.type_id = 1 and property_2_id = ${mainProp.id}`);
						whereListB_2.push(`v.id = r.property_2_id and r.type_id = 2 and property_1_id = ${mainProp.id}`);
					}

					if ( strOrderField == 'cnt' ) {
						strAo = 'r.cnt';
						strBo = 'r.cnt';
					}
					if ( strOrderField == 'object_cnt' ) {
						strAo = '1.0 * r.cnt / v.cnt * v.object_cnt';
						strBo = 'r.cnt';
					}
					if ( strOrderField == 'data_cnt' ) {
						strAo = '1.0 * r.cnt / v.cnt * v.data_cnt ';
						strBo = 'r.cnt';
					}
				}

				if ( !simplePrompt ) {
					if (newPListFrom.in.length > 0 ) 
						newPListFrom.in.forEach(element => {
							whereListA.push(`v.id in (SELECT property_2_id FROM ${schema}.pp_rels r WHERE r.type_id = 1 and property_1_id = ${element} order by property_2_id)`);
							whereListB.push(`v.id in (SELECT property_2_id FROM ${schema}.pp_rels r WHERE r.type_id = 3 and property_1_id = ${element} order by property_2_id)`);
						});
					if (newPListFrom.out.length > 0 )
						newPListFrom.out.forEach(element => {
							whereListA.push(`v.id in (SELECT property_2_id FROM ${schema}.pp_rels r WHERE r.type_id = 2 and property_1_id = ${element} order by property_2_id)`);
							whereListB.push(`v.id in (SELECT property_1_id FROM ${schema}.pp_rels r WHERE r.type_id = 1 and property_2_id = ${element} order by property_1_id)`)
						});	
					if (newPListTo.in.length > 0 ) 
						newPListTo.in.forEach(element => {
							whereListA.push(`v.id in (SELECT property_2_id FROM ${schema}.pp_rels r WHERE r.type_id = 3 and property_1_id = ${element} order by property_2_id)`);
							whereListB.push(`v.id in (SELECT property_2_id FROM ${schema}.pp_rels r WHERE r.type_id = 1 and property_1_id = ${element} order by property_2_id)`);
						});
					if (newPListTo.out.length > 0 )
						newPListTo.out.forEach(element => {
							whereListA.push(`v.id in (SELECT property_1_id FROM ${schema}.pp_rels r WHERE r.type_id = 1 and property_2_id = ${element} order by property_1_id)`);
							whereListB.push(`v.id in (SELECT property_2_id FROM ${schema}.pp_rels r WHERE r.type_id = 2 and property_1_id = ${element} order by property_2_id)`)
						});	
				}
			}
			else {
				if ( contextA === '' && !simplePrompt ) { // Tikai propertijas bez pp_rels
					form_sql = false;
					const mainProp = await findMainProperty(schema, newPListFrom, newPListTo);
					console.log("--------galvenā propertija----------")
					console.log(mainProp)
					const mainPropObj = await db.any(`SELECT * FROM ${schema}.v_properties_ns WHERE id = ${mainProp.id}`);
					let class_id_list = [];
					
					//if ( mainProp.class === 'from') {
					if ( mainProp.type === 'in' ) {
						if ( mainPropObj[0].domain_class_id !== null) {
							class_id_list.push(mainPropObj[0].domain_class_id);
						}
						else {
							const classList = await db.any(`SELECT class_id FROM ${schema}.cp_rels where property_id = ${mainProp.id} and type_id = 1 order by class_id`);
							if ( classList.length > 0) // TODO ko darīt, ja galvenajai propertijai nav klašu
								class_id_list = classList.map(v => v.class_id);
						}
					}
				
					if ( mainProp.type === 'out' ) {
						if ( mainPropObj[0].range_class_id !== null) {
							class_id_list.push(mainPropObj[0].range_class_id);
						}
						else {
							const classList = await db.any(`SELECT class_id FROM ${schema}.cp_rels where property_id = ${mainProp.id} and type_id = 2 order by class_id`);
							if ( classList.length > 0) // TODO ko darīt, ja galvenajai propertijai nav klašu
								class_id_list = classList.map(v => v.class_id);
						}
					}						
					// }

					console.log("--------klašu saraksts----------")
					console.log(class_id_list)
					
					if ( class_id_list.length > 0) {
						let typeIdA;
						let typeIdB;
						if ( mainProp.class === 'from') {
							typeIdA = 2;
							typeIdB = 1;
						}
						if ( mainProp.class === 'to') {
							typeIdA = 1;
							typeIdB = 2;
						}
						const propListA = await db.any(`SELECT distinct property_id FROM ${schema}.cp_rels where ${util.formWherePart('class_id', 'in', class_id_list, 0)} and type_id = ${typeIdA} order by property_id`); 
						if ( propListA.length > 0)
							whereListA.push(util.formWherePart('v.id', 'in', propListA.map(v => v.property_id), 0));
						else
							whereListA.push('false');
						
						const propListB = await db.any(`SELECT distinct property_id FROM ${schema}.cp_rels where ${util.formWherePart('class_id', 'in', class_id_list, 0)} and type_id = ${typeIdB} order by property_id`); 
						if ( propListB.length > 0)
							whereListB.push(util.formWherePart('v.id', 'in', propListB.map(v => v.property_id), 0));
						else
							whereListB.push('false');
		
						strAo = 'v.cnt';
						strBo = 'v.cnt';
					}
		
				}
			}
		}
		
		if (strAo === '') {
			const ot = ( contextA == '' ? 'v.' : 'r.')
			strAo = `${ot}${strOrderField}`;
			strBo = `${ot}${strOrderField}`;
		}
	}

	sql = await formSql();
	
	r = await util.getSchemaData(sql, params);
	return r;
//x_max_cardinality
}

module.exports = {
getProperties,
checkProperty,
}