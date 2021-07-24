const db = require('./db')
const debug = require('debug')('dss:classops')
const util = require('./utilities')

const { 
	sparqlGetIndividualClasses,
} = require('../../util/sparql/endpoint-queries')

// **************************************************************************************************************
const findMainProperty = async (schema, pList) => {

	if ( pList.in.length === 1)
		return { id: pList.in[0], type: 'in', typeId: 1 };
	if ( pList.in.length > 1){
		const r =  await db.any(`SELECT id FROM ${schema}.properties where ${util.formWherePart('id', 'in', pList.in, 0)} order by object_cnt limit 1`); 
		return { id: r[0].id, type: 'in', typeId: 1 }
	}
	
	if ( pList.out.length === 1)
		return { id: pList.out[0], type: 'out', typeId: 2 };
	if ( pList.out.length > 1){
		const r =  await db.any(`SELECT id FROM ${schema}.properties where ${util.formWherePart('id', 'in', pList.out, 0)} order by cnt limit 1`); 
		return { id: r[0].id, type: 'out', typeId: 2  }
	}
	return {};
}

/* list of classes */
const getClasses = async (schema, params) => {

	const viewname = ( util.isFilter(params) || ( util.isNamespaces(params) && util.isInNamespaces(params)) ? `${schema}.v_classes_ns v` :`${schema}.v_classes_ns_main v` ) ;
	let whereList = [ true ];
	let r = { data: [], complete: false };
	
	if ( util.isFilter(params)) 
		whereList.push(`v.${util.getFilterColumn(params)} ~ $2`); 

	if ( util.isUriIndividual(params,0) ){
		const classList = await sparqlGetIndividualClasses(params, util.getUriIndividual(params,0));
		const idList = await db.any(`SELECT id FROM ${schema}.classes where ${util.formWherePart('iri', 'in', classList, 1)}`); 
		if ( idList.length > 0) 
			whereList.push(util.formWherePart('id', 'in', idList.map(v => v.id), 0));
		else
			params = util.clearUriIndividual(params, 0);
	}
	
	if ( util.isNamespaces(params))
			whereList.push(util.getNsWhere(params));

	let mainProp = {};
	let newPList = {in:[], out:[]};
	if ( util.isPList(params, 0) && !util.isUriIndividual(params, 0)  ){
		newPList = await util.getIdsfromPList(schema, util.getPList(params, 0));
		if ( newPList.in.length > 0 || newPList.out.length > 0 ) {
			mainProp = await findMainProperty(schema, newPList);
			console.log("--------galvenā----------")
			console.log(mainProp)
			newPList.in = newPList.in.filter(item => item !== mainProp.id);
			newPList.out = newPList.out.filter(item => item !== mainProp.id);
			//console.log(newPList)
		}
	}
	
	let sql;	
	let sql_plus = '';
	//console.log("----------- whereList -------------")
	//console.log(whereList)	
	if ( mainProp.id === undefined ){
		const whereStr = whereList.join(' and ');
		if ( whereList.length === 0 ) 
			sql = `SELECT v.*, 1 as principal_class FROM ${viewname} order by v.cnt desc LIMIT $1`;
		else
			sql = `SELECT v.*, 1 as principal_class FROM ${viewname} WHERE ${whereStr} order by ${util.getOrderByPrefix(params)} v.cnt desc LIMIT $1`;
		
	}
	else {
		if ( newPList.in.length > 0 || newPList.out.length > 0) {
			if (newPList.in.length > 0 )
				newPList.in.forEach(element => whereList.push(`v.id in (SELECT class_id FROM ${schema}.cp_rels WHERE property_id = ${element} and type_id = 1)`));
			if (newPList.out.length > 0 )
				newPList.out.forEach(element => whereList.push(`v.id in (SELECT class_id FROM ${schema}.cp_rels WHERE property_id = ${element} and type_id = 2)`));
		}
			
		const whereStr = whereList.join(' and ')

		sql = `SELECT v.*, case when p.cover_set_index is not null then 2 else 1 end as principal_class 
                FROM ${viewname} JOIN ${schema}.cp_rels p ON p.class_id = v.id and p.type_id = ${mainProp.typeId} and p.property_id = ${mainProp.id} 
				WHERE ${whereStr} order by ${util.getOrderByPrefix(params)} p.cnt desc LIMIT $1`;
		
		const w2 = ( util.isFilter(params) ? `v.${util.getFilterColumn(params)} ~ $2 and props_in_schema = false` : 'props_in_schema = false' );
		sql_plus = `SELECT v.*, 0 as principal_class FROM ${viewname} WHERE ${w2} order by ${util.getOrderByPrefix(params)} v.cnt desc LIMIT $1`;

	}
	
	if ( sql_plus !== '')
		r = await util.getSchemaDataPlus(sql, sql_plus, params);
	else
		r = await util.getSchemaData(sql, params);

	return r;
}

/* list of tree classes */
const getTreeClasses = async (schema, params) => {
	let whereList = [ true ];
	let sql = '';
	let r = { data: [], complete: false };
	
	const viewname = ( util.isFilter(params) || ( util.isNamespaces(params) && util.isInNamespaces(params))  ? `${schema}.v_classes_ns_plus v` :`${schema}.v_classes_ns_main_plus v` ) ;
		
	if ( util.isNamespaces(params))
			whereList.push(util.getNsWhere(params));
	
	if ( util.isFilter(params)) 
		whereList.push(`v.${util.getFilterColumn(params)} ~ $2`); 
	
	if (util.getTreeMode(params) === 'Top') {
		sql = `SELECT v.* FROM ${viewname} WHERE ${whereList.join(' and ')} order by cnt desc LIMIT $1`;
	}
	
	if (util.getTreeMode(params) === 'Sub') {
		whereList.push(`r.class_2_id = ${util.getClassId(params)} and r.class_1_id = v.id`);
		sql = `SELECT v.* from ${schema}.v_classes_ns_plus v, ${schema}.cc_rels r WHERE ${whereList.join(' and ')} order by cnt desc LIMIT $1`;
	}
	
	r = await util.getSchemaData(sql, params);

	return r;
}

// **************************************************************************************************************
const getNamespaces = async schema => {
	const r = await db.any(`SELECT  *, 
	          (SELECT count(*) FROM ${schema}.classes where ns_id = ns.id  ) cl_count, 
			  (SELECT count(*) FROM ${schema}.properties where ns_id = ns.id  ) prop_count 
		FROM ${schema}.ns order by priority desc`);
    return r;
}
// **************************************************************************************************************

module.exports = {
	getClasses,
	getNamespaces,
	getTreeClasses,
}