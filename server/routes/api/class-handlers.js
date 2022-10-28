const db = require('./db')
const debug = require('debug')('dss:classops')
const util = require('./utilities')

const { 
	sparqlGetIndividualClasses,
} = require('../../util/sparql/endpoint-queries')

// **************************************************************************************************************
const findMainProperty = async (schema, pList, schemaType = '') => {

	//if ( pList.in.length === 1)
	//	return { id: pList.in[0], type: 'in', typeId: 1 };
	let isBig = false;

	if ( pList.in.length > 0){
		const r =  await db.any(`SELECT * FROM ${schema}.properties where ${util.formWherePart('id', 'in', pList.in, 0)} order by object_cnt limit 1`); 
		if (schemaType === 'dbpedia' && r[0].cp_count_1 > 500)
			isBig = true;
		return { id: r[0].id, type: 'in', typeId: 1, isBig: isBig}
	}
	
	//if ( pList.out.length === 1)
	//	return { id: pList.out[0], type: 'out', typeId: 2 };
	if ( pList.out.length > 0){
		const r =  await db.any(`SELECT * FROM ${schema}.properties where ${util.formWherePart('id', 'in', pList.out, 0)} order by cnt limit 1`);
		if (schemaType === 'dbpedia' && r[0].cp_count_2 > 500)
			isBig = true;		
		return { id: r[0].id, type: 'out', typeId: 2, isBig: isBig}
	}
	return {};
}

/* list of classes */
const getClasses = async (schema, params) => {

	const viewname = ( util.isFilter(params) || ( util.isNamespaces(params) && util.isInNamespaces(params)) ? `${schema}.v_classes_ns v` :`${schema}.v_classes_ns_main v` ) ;
	const simplePrompt = util.getSimplePrompt(params);
	const schemaType = util.getSchemaType(params);
	const isFilter = util.isFilter(params);
	let whereList = [ true ];
	let r = { data: [], complete: false };
	
	if ( util.isFilter(params)) 
		whereList.push(`v.${util.getFilterColumn(params)} ~ $2`); 

	if ( util.isUriIndividual(params, 0) ){
		const ind = await util.getUriIndividual(schema, params, 0);
		const classList = await sparqlGetIndividualClasses(params, ind);
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
		newPList = await util.getIdsfromPList(schema, util.getPList(params, 0), params);
		if ( newPList.in.length > 0 || newPList.out.length > 0 ) {
			mainProp = await findMainProperty(schema, newPList, schemaType);
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
		if ( !simplePrompt ) {
			if ( newPList.in.length > 0 || newPList.out.length > 0) {
				if (newPList.in.length > 0 )
					newPList.in.forEach(element => whereList.push(`v.id in (SELECT class_id FROM ${schema}.cp_rels WHERE property_id = ${element} and type_id = 1)`));
				if (newPList.out.length > 0 )
					newPList.out.forEach(element => whereList.push(`v.id in (SELECT class_id FROM ${schema}.cp_rels WHERE property_id = ${element} and type_id = 2)`));
			}
		}
			
		if (mainProp.isBig && !isFilter)
			whereList.push('v.id < 2500');	
				
		const whereStr = whereList.join(' and ')

		sql = `SELECT v.*, case when p.cover_set_index is not null then 2 else 1 end as principal_class 
                FROM ${viewname} JOIN ${schema}.cp_rels p ON p.class_id = v.id and p.type_id = ${mainProp.typeId} and p.property_id = ${mainProp.id} 
				WHERE ${whereStr} order by ${util.getOrderByPrefix(params)} p.cnt desc LIMIT $1`;
		
		//const w2 = ( util.isFilter(params) ? `v.${util.getFilterColumn(params)} ~ $2 and props_in_schema = false` : 'props_in_schema = false' );
		//sql_plus = `SELECT v.*, 0 as principal_class FROM ${viewname} WHERE ${w2} order by ${util.getOrderByPrefix(params)} v.cnt desc LIMIT $1`;
		
		if ( schemaType !== 'dbpedia')
			sql_plus = `SELECT v.*, 0 as principal_class
                FROM ${viewname} JOIN ${schema}.cp_rels p ON p.class_id = v.large_superclass_id and p.type_id = ${mainProp.typeId} and p.property_id = ${mainProp.id} 
				WHERE ${whereStr} order by ${util.getOrderByPrefix(params)} p.cnt desc LIMIT $1`;
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
	
	if ( r.complete && r.data.length > 0 && util.getTreeMode(params) === 'Top' && !util.isFilter(params)) {
		var owlThing = await util.getClassByName( 'owl:Thing', schema);
		whereList = [];
		whereList.push(util.formWherePart('v.id', 'in', r.data.map(v => v.id), 0))
		if ( owlThing.length == 1) {
			whereList.push(`(not exists ( select * from ${schema}.cc_rels where class_1_id = v.id and type_id = 1) or 
			                 exists (select * from ${schema}.cc_rels where class_1_id = v.id and class_2_id = ${owlThing[0].id} and type_id = 1))`);
		}
		else {
			whereList.push(`not exists ( select * from ${schema}.cc_rels where class_1_id = v.id and type_id = 1)`);
		}
		
		sql = `SELECT v.* FROM ${viewname} WHERE ${whereList.join(' and ')} order by cnt desc LIMIT $1`;
		r = await util.getSchemaData(sql, params);
	}

	return r;
}

// **************************************************************************************************************
const getNamespaces = async schema => {
	const r = await db.any(`SELECT  *, 
	          (SELECT count(*) FROM ${schema}.classes where ns_id = ns.id  ) cl_count, 
			  (SELECT count(*) FROM ${schema}.properties where ns_id = ns.id  ) prop_count 
		FROM ${schema}.ns order by cl_count desc`); //Nomainīju sakārtojumu, bija order by value, priority desc
	const local_ns = r.filter(function(n){ return n.is_local == true});
	console.log(local_ns)
	if (local_ns.length == 0 )
		r[0].is_local = true
    return r;
}
// **************************************************************************************************************
const xx_getClassList = async (schema, params) => {
	let sql = '';
	if ( params.main.isLocal )
		sql = `select id from ${schema}.v_classes_ns_main where is_local = true order by cnt desc LIMIT $1`;
	else
		sql = `select id from ${schema}.v_classes_ns_main order by cnt desc LIMIT $1`;
		
	const r = await util.getSchemaData(sql, params);

    return r;
}
const xx_getClassListInfo = async (schema, params) => {

	const sql = `select id, prefix, display_name, cnt_x, 
(select count(*) from ${schema}.cp_rels cr where class_id = vcnm.id and type_id = 2 and data_cnt > 0) as data_prop,
(select count(*) from ${schema}.cp_rels cr where class_id = vcnm.id and type_id = 2 and object_cnt > 0) as obj_prop
from ${schema}.v_classes_ns_main vcnm where id in (${params.main.c_list})`;

		
	const r = await util.getSchemaData(sql, params);

    return r;
}
const xx_getClassInfo = async (schema, params) => {

	const sql = `select id, prefix, display_name, cnt_x, 
(select count(*) from ${schema}.cp_rels cr where class_id = vcnm.id and type_id = 2 and data_cnt > 0) as data_prop,
(select count(*) from ${schema}.cp_rels cr where class_id = vcnm.id and type_id = 2 and object_cnt > 0) as obj_prop
from ${schema}.v_classes_ns_main vcnm where id in (${params.main.cc})`;

		
	const r = await util.getSchemaData(sql, params);

    return r;
}
const xx_getClassInfoAtr = async (schema, params) => {

	const sql = `select prefix, display_name from ${schema}.v_properties_ns vpn where id in (select property_id from ${schema}.cp_rels cr where class_id = ${params.main.cc} and data_cnt > 0)`;
		
	const r = await util.getSchemaData(sql, params);

    return r;
}
const xx_getClassInfoLink = async (schema, params) => {

	const sql = `select prefix, display_name from ${schema}.v_properties_ns vpn where id in (select property_id from ${schema}.cp_rels cr where class_id = ${params.main.cc} and type_id = 2 and object_cnt > 0)`;
		
	const r = await util.getSchemaData(sql, params);

    return r;
}
const xx_getPropListInfo = async (schema, params) => {

	const sql = `select distinct class_id from ${schema}.cp_rels 
where property_id in (select property_id from ${schema}.cp_rels vcr where class_id = ${params.main.cc} and type_id = 2) and type_id = 1 and class_id in (${params.main.c_list})`;
		
	const r = await util.getSchemaData(sql, params);

    return r;
}
const xx_getCCInfo = async (schema, params) => {

	const sql = `select class_1_id, class_2_id from ${schema}.cc_rels where class_1_id in (${params.main.c_list}) and class_2_id in (${params.main.c_list})`;
	const r = await util.getSchemaData(sql, params);

    return r;
}
const xx_getPropListInfo2 = async (schema, params) => {
	
	const sql = ` select prefix, display_name from ${schema}.v_properties_ns
where id in (select property_id from ${schema}.cp_rels where type_id = 1 and property_id in (
select property_id from ${schema}.cp_rels cr where class_id = ${params.main.cc} and type_id = 2 and object_cnt > 0) and class_id = ${params.main.cc2})`;
		
	const r = await util.getSchemaData(sql, params);

    return r;
}

// **************************************************************************************************************

module.exports = {
	getClasses,
	getNamespaces,
	getTreeClasses,
	xx_getClassList,
	xx_getClassListInfo,
	xx_getClassInfo,
	xx_getClassInfoAtr,
	xx_getClassInfoLink,
	xx_getPropListInfo,
	xx_getCCInfo,
	xx_getPropListInfo2,
}