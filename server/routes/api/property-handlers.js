const db = require('./db')
const util = require('./utilities')
const debug = require('debug')('dss:classops')

const { 
    executeSPARQL,
    sparqlGetClassProperties,
	sparqlGetPropertiesFromIndividuals,
	sparqlGetPropertiesFromClass,
} = require('../../util/sparql/endpoint-queries')

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
	let contextA = '';
	let contextB = '';
	let strOrderField = 'cnt';
	let strAo = '';
	let strBo = '';
	
	async function addToWhereList(propListAB)  {
		//console.log(`SELECT id FROM ${schema}.properties where ${util.formWherePart('iri', 'in', propListAB.A, 1)}`)
		const idListA = await db.any(`SELECT id FROM ${schema}.properties where ${util.formWherePart('iri', 'in', propListAB.A, 1)} order by id`);
		if ( idListA.length > 0) 
			whereListA.push(util.formWherePart('v.id', 'in', idListA.map(v => v.id), 0));
		//console.log(`SELECT id FROM ${schema}.properties where ${util.formWherePart('iri', 'in', propListAB.B, 1)}`)	
		const idListB = await db.any(`SELECT id FROM ${schema}.properties where ${util.formWherePart('iri', 'in', propListAB.B, 1)} order by id`);
		if ( idListB.length > 0) 
			whereListB.push(util.formWherePart('v.id', 'in', idListB.map(v => v.id), 0));
	}
	function formSql()  {
		if ( strOrderField !== 'cnt' ) {
			whereListA.push(`${strAo} > 0`);
			whereListB.push(`${strBo} > 0`);	
		}
		const orderByPref = ( util.isOrderByPrefix(params) ? util.getOrderByPrefix(params) : '')
		let sql = `SELECT aa.* FROM ( SELECT 'out' as mark, v.*, ${strAo} as o 				
FROM ${schema}.${viewname_out} v ${contextA}
WHERE ${whereListA.join(' and ')} 
) aa
order by ${orderByPref} o desc LIMIT $1`;
		if ( util.getPropertyKind(params) === 'ObjectExt' || util.getPropertyKind(params) === 'Connect') {
			sql = `SELECT aa.* FROM (
SELECT 'out' as mark, v.*, ${strAo} as o 
FROM ${schema}.${viewname_out} v ${contextA}
WHERE ${whereListA.join(' and ')} 
UNION ALL
SELECT 'in' as mark, v.*, ${strBo} as o   
FROM ${schema}.${viewname_in} v ${contextB}
WHERE ${whereListB.join(' and ')} 
) aa
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
		newPListFrom = await util.getIdsfromPList(schema, util.getPList(params, 0));
	if ( util.isPList(params, 1) )
		newPListTo = await util.getIdsfromPList(schema, util.getPList(params, 1));

	
	//console.log(classFrom)
	if ( classType(classFrom) === 's' || classType(classTo)=== 's' || util.isUriIndividual(params, 0) || util.isUriIndividual(params, 1)) {
		
		if ( util.isUriIndividual(params, 0) || util.isUriIndividual(params, 1)) {
			if ( util.isUriIndividual(params, 0) ) {
				const propListAB = await sparqlGetPropertiesFromIndividuals(params, 'From', util.getUriIndividual(params, 0));
				await addToWhereList(propListAB);
			}
			if ( util.isUriIndividual(params, 1) ) {
				const propListAB = await sparqlGetPropertiesFromIndividuals(params, 'To', util.getUriIndividual(params, 1));
				await addToWhereList(propListAB);
			}
		}
		else {
			if ( classType(classFrom) === 's') {
				const propListAB = await sparqlGetPropertiesFromClass(params, 'From', classFrom[0].iri);
				//console.log(propListAB)
				await addToWhereList(propListAB);
			}
			if ( classType(classTo)=== 's' ) {
				const propListAB = await sparqlGetPropertiesFromClass(params, 'To', classTo[0].iri);
				await addToWhereList(propListAB);
			}
		}
		
		if (strAo === '') {
			const ot = ( contextA == '' ? 'v.' : 'r.')
			strAo = `${ot}${strOrderField}`;
			strBo = `${ot}${strOrderField}`;
		}
		
		sql = formSql();
	}
	else {
		if ( classType(classFrom) === 'b') {
			contextA = ', cp_rels r';
			contextB = ', cp_rels r';
			whereListA.push(`property_id = v.id and r.type_id = 2 and class_id = ${classFrom[0].id}`);
			whereListB.push(`property_id = v.id and r.type_id = 1 and class_id = ${classFrom[0].id}`);
		} 
		if ( classType(classTo) === 'b' ){
			if ( contextA === '' ) {
				contextA = ', cp_rels r';
				contextB = ', cp_rels r';
				whereListA.push(`property_id = v.id and r.type_id = 1 and class_id = ${classTo[0].id}`);
				whereListB.push(`property_id = v.id and r.type_id = 2 and class_id = ${classTo[0].id}`);
			}
			else {
				whereListA.push(`v.id in (select property_id from cp_rels r where r.type_id = 1 and class_id = ${classTo[0].id})`);
				whereListB.push(`v.id in (select property_id from cp_rels r where r.type_id = 2 and class_id = ${classTo[0].id})`);
			}
		}  
		if ( newPListFrom.in.length > 0 || newPListFrom.out.length > 0 || newPListTo.in.length > 0 || newPListTo.out.length > 0) {
			if ( contextA === '' ) {
				const mainProp = await findMainProperty(schema, newPListFrom, newPListTo);
				console.log("--------galvenā----------")
				console.log(mainProp)
				newPListFrom.in = newPListFrom.in.filter(item => item !== mainProp.id);
				newPListFrom.out = newPListFrom.out.filter(item => item !== mainProp.id);
				newPListTo.in = newPListTo.in.filter(item => item !== mainProp.id);
				newPListTo.out = newPListTo.out.filter(item => item !== mainProp.id);
				console.log(newPListFrom)
				contextA = ', pp_rels r';
				contextB = ', pp_rels r';
				if ( mainProp.type === 'in' && mainProp.class === 'from' ) {
					whereListA.push(`v.id = r.property_2_id and r.type_id = 1 and property_1_id = ${mainProp.id}`);
					whereListB.push(`v.id = r.property_2_id and r.type_id = 3 and property_1_id = ${mainProp.id}`);
				}
				if ( mainProp.type === 'out' && mainProp.class === 'from' ) {
					whereListA.push(`v.id = r.property_2_id and r.type_id = 2 and property_1_id = ${mainProp.id}`);
					whereListB.push(`v.id = r.property_1_id and r.type_id = 1 and property_2_id = ${mainProp.id}`);
				}
				if ( mainProp.type === 'in' && mainProp.class === 'to' ) {
					whereListA.push(`v.id = r.property_2_id and r.type_id = 3 and property_1_id = ${mainProp.id}`);
					whereListB.push(`v.id = r.property_2_id and r.type_id = 1 and property_1_id = ${mainProp.id}`);
				}
				if ( mainProp.type === 'out' && mainProp.class === 'to' ) {
					whereListA.push(`v.id = r.property_1_id and r.type_id = 1 and property_2_id = ${mainProp.id}`);
					whereListB.push(`v.id = r.property_2_id and r.type_id = 2 and property_1_id = ${mainProp.id}`);
				}

				if ( strOrderField == 'cnt' ) {
					strAo = 'r.cnt';
					strBo = 'r.cnt';
				}
				if ( strOrderField == 'object_cnt' ) {
					strAo = 'r.cnt / v.cnt * v.object_cnt';
					strBo = 'r.cnt';
				}
				if ( strOrderField == 'data_cnt' ) {
					strAo = 'r.cnt / v.cnt * v.data_cnt ';
					strBo = 'r.cnt';
				}
			}
			
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
		
		if (strAo === '') {
			const ot = ( contextA == '' ? 'v.' : 'r.')
			strAo = `${ot}${strOrderField}`;
			strBo = `${ot}${strOrderField}`;
		}
	
		sql = formSql();
	}
	
	r = await util.getSchemaData(sql, params);
	return r;

}

module.exports = {
getProperties,
}