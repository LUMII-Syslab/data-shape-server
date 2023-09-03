const db = require('./db')
const debug = require('debug')('dss:classops')
const util = require('./utilities')


const { 
	sparqlGetIndividualClasses,
	sparqlGetClassLabels,
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

const findMainClassId = async (schema, mainPropInfo) => {
	if ( mainPropInfo.className !== undefined && mainPropInfo.className !== '' ) {
		const classObj = await util.getClassByName( mainPropInfo.className, schema);
		if ( classObj.length > 0)
			return classObj[0].id;
		else return 0;	
	}
	else {
		return 0;
	}
}
/* list of classes */
const getClasses = async (schema, params) => {

	const viewname = ( util.isFilter(params) || ( util.isNamespaces(params) && util.isInNamespaces(params)) ? `${schema}.v_classes_ns v` :`${schema}.v_classes_ns_main v` ) ;
	const simplePrompt = util.getSimplePrompt(params);
	const schemaType = util.getSchemaType(params);
	const isFilter = util.isFilter(params);
	let use_class_pairs = false;
	let whereList = [ true ];
	let r = { data: [], complete: false };
	
	if ( util.isFilter(params)) 
		whereList.push(`v.${util.getFilterColumn(params)} ~ $2`); 

	if ( util.isUriIndividual(params, 0) ){
		const ind = await util.getUriIndividual(schema, params, 0);
		const classList = await sparqlGetIndividualClasses(schema, params, ind);
		const idList = await db.any(`SELECT id FROM ${schema}.classes where ${util.formWherePart('iri', 'in', classList, 1)}`); 
		if ( idList.length > 0) 
			whereList.push(util.formWherePart('id', 'in', idList.map(v => v.id), 0));
		else
			params = util.clearUriIndividual(params, 0);
	}
	
	if ( util.isNamespaces(params))
			whereList.push(util.getNsWhere(params));

	let mainProp = {};
	let mainPropInfo;
	let mainClassId = 0;
	let newPList = {in:[], out:[]};
	if ( util.isPList(params, 0) && !util.isUriIndividual(params, 0)  ){
		const pList = await util.addIdsToPList(schema, util.getPList(params, 0), params);
		newPList = await util.getIdsfromPList(schema, util.getPList(params, 0), params);
		if ( newPList.in.length > 0 || newPList.out.length > 0 ) {
			mainProp = await findMainProperty(schema, newPList, schemaType);
			console.log("--------galvenā----------")
			mainPropInfo = pList.filter(item => item.id == mainProp.id)[0];
			console.log(mainPropInfo)
			mainClassId = await findMainClassId(schema, mainPropInfo);
			if ( mainClassId >0 ) {
				const info = await db.any(`SELECT count(*) FROM ${schema}.cpc_rels`);
				use_class_pairs = info[0].count > 0;  
			}

			newPList.in = newPList.in.filter(item => item !== mainProp.id);
			newPList.out = newPList.out.filter(item => item !== mainProp.id);
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
		
		// ************************* TODO kaut kā smukāk salikt
		//use_class_pairs = false;

		if ( !use_class_pairs || mainClassId == 0)
			sql = `SELECT v.*, case when p.cover_set_index  > 0 then 2 else 1 end as principal_class 
FROM ${viewname} JOIN ${schema}.cp_rels p ON p.class_id = v.id and p.type_id = ${mainProp.typeId} and p.property_id = ${mainProp.id} 
WHERE ${whereStr} order by ${util.getOrderByPrefix(params)} p.cnt desc LIMIT $1`;
		else  
			sql = `SELECT * FROM (
SELECT v.*, case when p.cover_set_index > 0 then 2 else 1 end as principal_class
FROM ${viewname} JOIN ${schema}.cp_rels p ON p.class_id = v.id and p.type_id = ${mainProp.typeId} and p.property_id = ${mainProp.id} and p.details_level = 0
UNION
SELECT v.*, case when p.cover_set_index > 0 then 2 else 1 end as principal_class
FROM ${viewname} JOIN ${schema}.cp_rels p ON p.class_id = v.id and p.type_id = ${mainProp.typeId} and p.property_id = ${mainProp.id} and p.details_level > 0
JOIN ${schema}.cpc_rels cp on cp.cp_rel_id = p.id and cp.other_class_id = ${mainClassId} 
) aa order by  cnt desc LIMIT $1`;
			
		
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
	
	if ( false && r.complete && r.data.length > 0 && util.getTreeMode(params) === 'Top' && !util.isFilter(params)) {
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
	let r = await db.any(`SELECT  *, 
	          (SELECT count(*) FROM ${schema}.classes where ns_id = ns.id  ) cl_count, 
			  (SELECT count(*) FROM ${schema}.properties where ns_id = ns.id  ) prop_count 
		FROM ${schema}.ns order by cl_count desc`); //Nomainīju sakārtojumu, bija order by value, priority desc
	const local_ns = r.filter(function(n){ return n.is_local == true});
	if (local_ns.length == 0 )
		r[0].is_local = true;
		
	r = util.correctValue(r);
    return r;
}

// **************************************************************************************************************
const getPublicNamespaces = async () => {
	let r = await db.any(`SELECT  abbr as name, prefix as value from public.ns_prefixes`); 
	r = util.correctValue(r);
    return r;
}
// **************************************************************************************************************
const xx_getClassList = async (schema, params) => {

	let where_part = ['true'];
	if ( params.main.not_in != undefined && params.main.not_in.length > 0 )
		where_part.push(` ns_id not in (${params.main.not_in.join(',')}) `);
		
	if ( params.main.isLocal )
		where_part.push('is_local = true');
		
	where_part.push(`cnt >= ${params.main.class_ind}`);	
	
	const sql = `select id, concat(prefix,':',display_name, ' (', cnt_x, ')' ) as display_name from ${schema}.v_classes_ns_main where ${where_part.join(' and ')} order by cnt desc LIMIT $1`;
		
	const r = await util.getSchemaData(sql, params);

    return r;
}
const xx_getClassListExt = async (schema, params) => {
	let r;
	let rr;
	let sql = `select id, display_name as display_name0, prefix, is_local, cnt, cnt_x from ${schema}.v_classes_ns_main order by is_local desc, prefix, cnt desc LIMIT $1`;
	rr =  await util.getSchemaData(sql, params);
	let ii = 1;
	for (var c of rr.data) {
		c.order = ii;
		if (c.is_local)
			c.is_local = 1;
		else
			c.is_local = 0;
		sql = `select distinct(class_id) from ${schema}.cp_rels where type_id = 2 and cover_set_index > 0 and class_id <> ${c.id} and property_id  in
( select property_id from ${schema}.cp_rels where class_id = ${c.id} and type_id = 1 and cover_set_index > 0)`;
		r =  await util.getSchemaData(sql, params, false);
		c.c = r.data.map( v => { return v.class_id});
		ii = ii + 1;
	}

	for (var c of rr.data) {
		for (var cc of c.c) {
			let cx = rr.data.filter(function(n){ return n.id == cc});
			if ( !cx[0].c.includes(c.id) )
				cx[0].c.push(c.id);			
		}
	}
	
	for (var c of rr.data) {
		c.display_name = `${c.prefix}:${c.display_name0} ( cnt-${c.cnt_x} N-${c.c.length} )`;
		c.selected = 0;
	}	
	
	//concat(prefix,':',display_name, ' (', cnt_x, ')' )
	rr.data = rr.data.sort(function(a,b){ return b.cnt-a.cnt;})
	return rr;
}
const xx_getPropList = async (schema, params) => {

	let where_part1 = '';
	let where_part2 = '';
	if ( params.main.not_in != undefined && params.main.not_in.length > 0 ) {
		const propObj = await util.getPropertyByName('rdfs:label', schema, params); // TODO šo vajadzētu no DB ņemt, ja ir uzstādīts, ka par to interesējamies
		if (propObj.length > 0 )
			where_part1 = `id = ${propObj[0].id} or`;
		
		where_part2 = `and ns_id not in (${params.main.not_in.join(',')})`;
	}
	
	const sql = `select id, display_name, prefix, cnt, cnt_x, object_cnt, data_cnt, max_cardinality, inverse_max_cardinality, range_class_id from ${schema}.v_properties_ns vpn where ${where_part1}
	id in (select distinct(property_id) from ${schema}.cp_rels where class_id in (${params.main.c_list})) ${where_part2} order by prefix, data_cnt desc, object_cnt desc`;
	
	let r = await util.getSchemaData(sql, params);
	
	for (var c of r.data) {
		if ( c.cnt == c.object_cnt )
			c.p_name = `${c.prefix}:${c.display_name} ( cnt-${c.cnt_x}, object property )`;
		else if ( c.cnt == c.data_cnt )
			c.p_name = `${c.prefix}:${c.display_name} ( cnt-${c.cnt_x}, data property )`;
		else
			c.p_name = `${c.prefix}:${c.display_name} ( cnt-${c.cnt_x}, property )`;
		
	}

    return r;
}
const xx_getClassListInfo = async (schema, params) => {

	const sql = `select id, prefix, display_name, cnt_x, cnt, 
(select count(*) from ${schema}.cp_rels cr where class_id = vcnm.id and type_id = 2 and data_cnt > 0) as data_prop,
(select count(*) from ${schema}.cp_rels cr where class_id = vcnm.id and type_id = 2 and object_cnt > 0) as obj_prop
from ${schema}.v_classes_ns_main vcnm where id in (${params.main.c_list})`;

		
	const r = await util.getSchemaData(sql, params);

    return r;
}
const xx_getClassInfo = async (schema, params) => {

	const sql = `select id, prefix, display_name, cnt_x, cnt, 
(select count(*) from ${schema}.cp_rels cr where class_id = vcnm.id and type_id = 2 and data_cnt > 0) as data_prop,
(select count(*) from ${schema}.cp_rels cr where class_id = vcnm.id and type_id = 2 and object_cnt > 0) as obj_prop
from ${schema}.v_classes_ns_main vcnm where id in (${params.main.cc})`;

		
	const r = await util.getSchemaData(sql, params);

    return r;
}
const xx_getClassInfoAtr = async (schema, params) => {

	const sql = `select prefix, display_name from ${schema}.v_properties_ns vpn where id in 
	(select property_id from ${schema}.cp_rels cr where class_id = ${params.main.cc} and data_cnt > 0 and cover_set_index >0)`;
		
	const r = await util.getSchemaData(sql, params);

    return r;
}
const xx_getClassInfoLink = async (schema, params) => {
// Vairs netiek izmantota 
/*
select id, prefix, display_name, object_cnt, data_cnt, 
(select count(*) from cp_rels cr where type_id = 1 and property_id = vpn.id),
(select count(*) from cp_rels cr where type_id = 1 and property_id = vpn.id and cover_set_index >0 ),
(select count(*) from cp_rels cr where type_id = 2 and property_id = vpn.id),
(select count(*) from cp_rels cr where type_id = 2 and property_id = vpn.id and cover_set_index >0 )
from v_properties_ns vpn 
where object_cnt > 0 and prefix not in ('rdf', 'owl')
order by object_cnt desc
*/
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

	let plus = '';
	if (params.main.properties_ids !== '')
		plus = ` and iri not in ('${params.main.properties_ids}')`;
	
	const sql = `select prefix, display_name from ${schema}.v_properties_ns
where id in (select property_id from ${schema}.cp_rels where type_id = 1 and cover_set_index > 0 and property_id in (
select property_id from ${schema}.cp_rels cr where class_id = ${params.main.cc} and type_id = 2 and cover_set_index > 0 and object_cnt > 0) and class_id = ${params.main.cc2}) ${plus} order by prefix, display_name`; 
		
	const r = await util.getSchemaData(sql, params);

    return r;
}
const xx_getPropInfo = async (schema, params) => {

	const sql = `select type_id, class_id, cnt, object_cnt, x_max_cardinality, cover_set_index 
	from ${schema}.v_cp_rels_card where property_id = ${params.main.prop_id} and cover_set_index > 0 and class_id in (${params.main.c_list}) order by class_id`; 

	const r = await util.getSchemaData(sql, params);
    return r;
}


const generateClassUpdate = async (schema, params) => {
	let sql = `select count(*) from ${schema}.classes`;
	let r = await util.getSchemaData(sql, params);
	const count = r.data[0].count;
	let rr = [];
	//TODO pagaidām ielikta konstante, lai necīnītos ir lielām shēmām
    if (count<300) {
		sql = `select iri, local_name from ${schema}.classes`;
		r = await util.getSchemaData(sql, params);
		const propObj = await util.getPropertyByName(params.main.label_name, schema, params);
		await Promise.all(r.data.map(async (element) => {
			let localName = element.local_name;
			if (!isNaN(Number(localName.substring(1,localName.length)))) {
				console.log(localName)
				const label = await sparqlGetClassLabels(schema, params, element.iri, propObj[0].iri);
				//console.log(`${schema}.classes set display_name = Concat('[${label} (',local_name ,')]') where iri = '${element.iri}';`)
				if ( label !== '' )
					rr.push(`update ${schema}.classes set display_name = Concat('[${label.replace("'", "''")} (',local_name ,')]') where iri = '${element.iri}';`);
			}
		}));
	}

	return {data: rr, complete: true, params: params};
}
// **************************************************************************************************************

module.exports = {
	getClasses,
	getNamespaces,
	getPublicNamespaces,
	getTreeClasses,
	xx_getClassList,
	xx_getClassListExt,
	xx_getPropList,
	xx_getClassListInfo,
	xx_getClassInfo,
	xx_getClassInfoAtr,
	xx_getClassInfoLink,
	xx_getPropListInfo,
	xx_getCCInfo,
	xx_getPropListInfo2,
	xx_getPropInfo,
	generateClassUpdate,
}