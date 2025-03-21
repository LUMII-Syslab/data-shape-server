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

const findMainClassId = async (schema, mainPropInfo, params) => {
	if ( mainPropInfo.className !== undefined && mainPropInfo.className !== '' ) {
		const classObj = await util.getClassByName( mainPropInfo.className, schema, params);
		if ( classObj.length > 0)
			return classObj[0].id;
		else return 0;	
	}
	else {
		return 0;
	}
}

const addFullNames = (r, params) => {
	if ( r.data.length > 0 ) {
		r.data.forEach(cl => cl.full_name = util.getFullName(cl, params));
	}
	return r;
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
			mainClassId = await findMainClassId(schema, mainPropInfo, params);
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
WHERE ${whereStr} 
UNION
SELECT v.*, case when p.cover_set_index > 0 then 2 else 1 end as principal_class
FROM ${viewname} JOIN ${schema}.cp_rels p ON p.class_id = v.id and p.type_id = ${mainProp.typeId} and p.property_id = ${mainProp.id} and p.details_level > 0
JOIN ${schema}.cpc_rels cp on cp.cp_rel_id = p.id and cp.other_class_id = ${mainClassId} 
WHERE ${whereStr} 
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

	r = addFullNames(r, params);	
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
		//let col_info = await db.any(`SELECT count(*) FROM information_schema."columns"  where table_schema = '${schema}' and table_name = 'v_classes_ns_plus' and column_name = 'hide_in_main'`);
		//if ( col_info[0].count > 0) 
		let col_info = await util.columnChecking(schema,'v_classes_ns_plus','hide_in_main');
		if ( col_info)
			whereList.push('v.hide_in_main = false');
		sql = `SELECT v.* FROM ${viewname} WHERE ${whereList.join(' and ')} order by cnt desc LIMIT $1`;
	}
	
	if (util.getTreeMode(params) === 'Sub') {
		whereList.push(`r.class_2_id = ${util.getClassId(params)} and r.class_1_id = v.id and type_id = 1`);
		sql = `SELECT v.* from ${schema}.v_classes_ns_plus v, ${schema}.cc_rels r WHERE ${whereList.join(' and ')} order by cnt desc LIMIT $1`;
	}

	r = await util.getSchemaData(sql, params);
	
	if ( false && r.complete && r.data.length > 0 && util.getTreeMode(params) === 'Top' && !util.isFilter(params)) {
		var owlThing = await util.getClassByName( 'owl:Thing', schema, params);
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
	
	r = addFullNames(r, params);
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
const roundCount = (cnt) => {
	if ( cnt == '' || cnt == 0) {
		return '';
	} 
	else {
		cnt = Number(cnt);
		const formatter = Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 });
		return formatter.format(cnt);
	}
}
const xx_getClassListExt = async (schema, params) => {
	function roundCountV(cnt) {
		if ( cnt == '' || cnt == 0) {
			return '';
		} 
		else {
			cnt = Number(cnt);
		if ( cnt < 10000)
				return cnt;
			else
				return cnt.toPrecision(2).replace("+", "");				
		}
	}

	let r;
	let rr;
	let ca = '';
	if ( params.main.has_classification_adornment ) ca = ', classification_adornment';
	let sql = `select id, display_name, prefix, is_local, cnt, cnt_x ${ca} from ${schema}.v_classes_ns_main order by is_local desc, prefix, cnt desc LIMIT $1`;
	rr =  await util.getSchemaData(sql, params);
	rr = addFullNames(rr, params);
	sql = `select * from ${schema}.cc_rels where type_id = 1 or type_id = 2`;
	r =  await util.getSchemaData(sql, params, false);
	const cc_rels = r.data;
	
	let ii = 1;
	for (var c of rr.data) {
		c.order = ii;
		if (c.is_local)
			c.is_local = 1;
		else
			c.is_local = 0;
			

//		sql = `select distinct(class_id) from ${schema}.cp_rels where type_id = 2  and class_id <> ${c.id} and property_id  in
//( select property_id from ${schema}.cp_rels where class_id = ${c.id} and type_id = 1 )`;
		//*** Kaimiņus vispār vairs neņemam
		//***sql = `select distinct(class_id) from ${schema}.cp_rels where type_id = 2 and cover_set_index > 0 and class_id <> ${c.id} and property_id  in
		//***	( select property_id from ${schema}.cp_rels where class_id = ${c.id} and type_id = 1 and cover_set_index > 0)`;
		//***r =  await util.getSchemaData(sql, params, false);
		//***c.c = r.data.map( v => { return v.class_id});
		sql = `select sum(object_cnt) from ${schema}.cp_rels where type_id = 1 and class_id = ${c.id}`;
		r =  await util.getSchemaData(sql, params, false);
		const in_props = (r.data[0].sum == null) ? '' : ` in_triples-${roundCount(Number(r.data[0].sum))}`; 
		c.in_props = (r.data[0].sum == null) ? 0 : Number(r.data[0].sum);
		c.cnt_sum = Number(c.cnt) + Math.round(Math.pow(c.in_props, 5/6)); 
		
		c.s = [c.id];
		if ( cc_rels.length > 0 ) {
			let len = 1;
			c.s = [...new Set([...c.s, ...cc_rels.filter(function(s){ return c.s.includes(s.class_1_id)}).map( v => { return v.class_2_id})])];
			while ( len < c.s.length) {
				len = c.s.length;
				c.s = [...new Set([...c.s, ...cc_rels.filter(function(s){ return c.s.includes(s.class_1_id)}).map( v => { return v.class_2_id})])];
			}
		}
		c.display_name = `${c.full_name} (weight-${roundCount(c.cnt_sum)} cnt-${roundCount(c.cnt)} ${in_props})`;
		c.sel = 0;
		ii = ii + 1;
	}

	//***for (var c of rr.data) {
	//***	for (var cc of c.c) {
	//***		let cx = rr.data.filter(function(n){ return n.id == cc});
	//***		if ( !cx[0].c.includes(c.id) )
	//***			cx[0].c.push(c.id);			
	//***	}
	//***}
	
	//***for (var c of rr.data) {
	//***	//***c.display_name = `${c.full_name} ( cnt-${c.cnt_x} N-${c.c.length} )`;
	//***	c.display_name = `${c.full_name} ( cnt-${c.cnt_x} )`;
	//***	c.selected = 0;
	//***}	
	
	//concat(prefix,':',display_name, ' (', cnt_x, ')' )
	rr.data = rr.data.sort(function(a,b){ return b.cnt_sum-a.cnt_sum;});

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
	if ( params.main.remSmall > 0  )
		where_part2 = `${where_part2} and cnt > ${params.main.remSmall-1}`; // TODO te varētu būt dažādi izmēri
	
	
	const sql = `select id, display_name, prefix, cnt, cnt_x, object_cnt, data_cnt, max_cardinality, inverse_max_cardinality, domain_class_id, range_class_id,
	(select count(*) from ${schema}.cp_rels where property_id = vpn.id and cover_set_index > 0 and type_id = 2) as type_2,
	(select count(*) from ${schema}.cp_rels where property_id = vpn.id and cover_set_index > 0 and type_id = 1) as type_1	
	from ${schema}.v_properties_ns vpn where ${where_part1}
	id in (select distinct(property_id) from ${schema}.cp_rels where class_id in (${params.main.c_list})) ${where_part2} order by prefix, data_cnt desc, object_cnt desc`;
	
	let r = await util.getSchemaData(sql, params);
	
	for (var c of r.data) {
		if ( c.cnt == c.object_cnt )
			c.p_name = `${c.prefix}:${c.display_name} ( cnt-${c.cnt_x}, object property ${c.type_2}-${c.type_1})`;
		else if ( c.cnt == c.data_cnt )
			c.p_name = `${c.prefix}:${c.display_name} ( cnt-${c.cnt_x}, data property )`;
		else
			c.p_name = `${c.prefix}:${c.display_name} ( cnt-${c.cnt_x}, property ${c.type_2}-${c.type_1})`;
		
	}

    return r;
}
const xx_getPropList2 = async (schema, params) => {
	// TODO pagaidām ir noņemta ns filtra iespēja, remSmall arī vairs nebūs
	function roundCountV(cnt) {
		if ( cnt == '' || cnt == 0) {
			return '';
		} 
		else {
			cnt = Number(cnt);
		if ( cnt < 10000)
				return cnt;
			else
				return cnt.toPrecision(2).replace("+", "");				
		}
	}

	const sql = `select id, iri, display_name, prefix, cnt, object_cnt, data_cnt, max_cardinality, inverse_max_cardinality, domain_class_id, range_class_id,
	(select count(*) from ${schema}.cp_rels where property_id = vpn.id and cover_set_index > 0 and type_id = 2) as type_2,
	(select count(*) from ${schema}.cp_rels where property_id = vpn.id and cover_set_index > 0 and type_id = 1) as type_1	
	from ${schema}.v_properties_ns vpn where id in (select distinct(property_id) from ${schema}.cp_rels where class_id in (${params.main.c_list})) order by cnt desc`;
	
	let r = await util.getSchemaData(sql, params);
	
	for (var c of r.data) {
		if ( c.cnt == c.object_cnt )
			c.p_name = `${c.prefix}:${c.display_name} (cnt-${roundCount(c.cnt)}, object property ${c.type_2}-${c.type_1})`;
		else if ( c.cnt == c.data_cnt )
			c.p_name = `${c.prefix}:${c.display_name} (cnt-${roundCount(c.cnt)}, data property )`;
		else
			c.p_name = `${c.prefix}:${c.display_name} (cnt-${roundCount(c.cnt)}, property ${c.type_2}-${c.type_1})`;
		
	}

    return r;
}
const xx_getPropList3 = async (schema, params) => {
	function roundCountV(cnt) {
		if ( cnt == '' || cnt == 0) {
			return '';
		} 
		else {
			cnt = Number(cnt);
		if ( cnt < 10000)
				return cnt;
			else
				return cnt.toPrecision(2).replace("+", "");				
		}
	}

	const sql = `select id, iri, display_name, prefix, cnt, object_cnt, data_cnt, max_cardinality, inverse_max_cardinality, domain_class_id, range_class_id,
	(select count(*) from ${schema}.cp_rels where property_id = vpn.id and cover_set_index > 0 and type_id = 2) as type_2,
	(select count(*) from ${schema}.cp_rels where property_id = vpn.id and cover_set_index > 0 and type_id = 1) as type_1	
	from ${schema}.v_properties_ns vpn order by cnt desc`;
	
	let r = await util.getSchemaData(sql, params);
	
	for (var c of r.data) {
		if ( c.cnt == c.object_cnt )
			c.p_name = `${c.prefix}:${c.display_name} (cnt-${roundCount(c.cnt)}, object property ${c.type_2}-${c.type_1})`;
		else if ( c.cnt == c.data_cnt )
			c.p_name = `${c.prefix}:${c.display_name} (cnt-${roundCount(c.cnt)}, data property )`;
		else
			c.p_name = `${c.prefix}:${c.display_name} (cnt-${roundCount(c.cnt)}, property ${c.type_2}-${c.type_1})`;
		
	}

    return r;
}
const xx_getClassListInfo = async (schema, params) => {
	let sql = `select * from ${schema}.cc_rels where class_1_id in (${params.main.c_list}) and class_2_id in (${params.main.c_list}) and ( type_id = 1 or type_id = 2 )`;
	let rr =  await util.getSchemaData(sql, params, false);
	const cc_rels = rr.data;
	let cp = '';
	
	if ( params.main.has_classification_property ) 
		cp = 'classification_property, ';
		
	if ( params.main.has_classification_adornment )	
		cp = `${cp} classification_adornment,`;
		
		sql = `select id, prefix, display_name, cnt_x, cnt, ${cp} is_local,
	(select count(*) from ${schema}.cp_rels cr where class_id = vcnm.id and type_id = 2 and data_cnt > 0) as data_prop,
	(select count(*) from ${schema}.cp_rels cr where class_id = vcnm.id and type_id = 2 and object_cnt > 0) as obj_prop
	from ${schema}.v_classes_ns_main vcnm where id in (${params.main.c_list})`;

	rr = await util.getSchemaData(sql, params);
	rr = addFullNames(rr, params);
	
	for (var c of rr.data) {
		c.s = [c.id];
		c.b = [c.id];
		c.s0 = [];
		c.b0 = [];
		
		sql = `select sum(object_cnt) from ${schema}.cp_rels where type_id = 1 and class_id = ${c.id}`;
		r =  await util.getSchemaData(sql, params, false);
		c.in_props = (r.data[0].sum == null) ? 0 : Number(r.data[0].sum);
		c.cnt_sum = Number(c.cnt) + Math.round(Math.pow(c.in_props, 5/6)); 

		if ( cc_rels.length > 0 ) {
			let len = 1;
			c.s = [...new Set([...c.s, ...cc_rels.filter(function(s){ return c.s.includes(s.class_1_id)}).map( v => { return v.class_2_id})])];
			c.s0 = cc_rels.filter(function(s){ return s.class_1_id == c.id; }).map( v => { return v.class_2_id});
			while ( len < c.s.length) {
				len = c.s.length;
				c.s = [...new Set([...c.s, ...cc_rels.filter(function(s){ return c.s.includes(s.class_1_id)}).map( v => { return v.class_2_id})])];
			}
			c.b = [...new Set([...c.b, ...cc_rels.filter(function(s){ return c.b.includes(s.class_2_id)}).map( v => { return v.class_1_id})])];
			c.b0 = cc_rels.filter(function(s){ return s.class_2_id == c.id; }).map( v => { return v.class_1_id});
			while ( len < c.b.length) {
				len = c.b.length;
				c.b = [...new Set([...c.b, ...cc_rels.filter(function(s){ return c.b.includes(s.class_2_id)}).map( v => { return v.class_1_id})])];
			}
		}
	}

	return rr;
}
const xx_getCCInfo = async (schema, params) => {
	const sql = `select class_1_id, class_2_id from ${schema}.cc_rels  where ( type_id = 1 or type_id = 2 ) and class_1_id in (${params.main.c_list}) and class_2_id in (${params.main.c_list})`;
	const r = await util.getSchemaData(sql, params);

    return r;
}
const xx_getCCInfo_Type3 = async (schema, params) => {
	let sql = `select id from ${schema}.classes where id not in (select class_1_id from ${schema}.cc_rels where type_id = 1) and id in (${params.main.c_list})`;
	const rr =  await util.getSchemaData(sql, params);
	const top_classes =  rr.data;
	let r = { data: [], complete: false };
	if ( top_classes.length > 0 ) {
		const top_ids = top_classes.map( v => { return v.id});
		sql = `select class_1_id, class_2_id from ${schema}.cc_rels where class_1_id in (${top_ids.join(', ')}) and class_2_id in (${top_ids.join(', ')}) and type_id = 3`;
		r =  await util.getSchemaData(sql, params);
	}

    return r;
}
const xx_getCPCInfo = async (schema, params) => {
	//const sql = `select * from ${schema}.cpc_rels`;
	//const sql = `select cpc.*, class_id, property_id, type_id from ${schema}.cpc_rels cpc, ${schema}.cp_rels cp where cpc.cp_rel_id = cp.id and cp.cover_set_index > 0`;
	const sql = `select cpc.*, class_id, property_id, type_id from ${schema}.cpc_rels cpc, ${schema}.cp_rels cp where cpc.cp_rel_id = cp.id and cpc.cover_set_index > 0`;
	const r = await util.getSchemaData(sql, params);
    return r;
}
const xx_getCPCInfoWithNames = async (schema, params) => {
	const sql = `SELECT ns1.name AS ns1_name, c1.display_name AS class1_name, p.display_name AS property_name, ns2.name AS ns2_name, c2.display_name AS class2_name, cp.type_id AS type_id, cpc.cnt AS cpc_cnt, cp.cnt AS cp_cnt 
				FROM ${schema}.cp_rels AS cp,
					${schema}.cpc_rels AS cpc,
					${schema}.classes AS c1,
					${schema}.ns AS ns1,
					${schema}.classes AS c2,
					${schema}.ns AS ns2, 
					${schema}.properties AS p
				WHERE cp.id = cpc.cp_rel_id
					AND cp.class_id = c1.id
					AND ns1.id = c1.ns_id
					AND cpc.other_class_id = c2.id
					AND ns2.id = c2.ns_id
					AND cp.property_id = p.id
					AND cpc.cover_set_index > 0
					AND cp.type_id = 1`;
	const r = await util.getSchemaData(sql, params);
    return r;
}
const xx_getClassCPCCounts = async (schema, params) => {
	const sql = `WITH class_total_cpc_cnts AS (
					WITH class_cpc_cnts AS (
						-- collect class_id and cpc_cnt
						SELECT cp.class_id AS class_id, cpc.cnt AS cpc_cnt
						FROM ${schema}.cp_rels AS cp,
							${schema}.cpc_rels AS cpc 
						WHERE cp.id = cpc.cp_rel_id
							AND cpc.cover_set_index > 0
							AND cp.type_id = 1
							-- If both cpc classes are the same, ignore them here to prevent double counting
							AND cp.class_id <> cpc.other_class_id
						
						UNION ALL
						
						-- collect other_class_id and cpc_cnt
						SELECT cpc.other_class_id AS class_id, cpc.cnt AS cpc_cnt
						FROM ${schema}.cp_rels AS cp,
							${schema}.cpc_rels AS cpc
						WHERE cp.id = cpc.cp_rel_id
							AND cpc.cover_set_index > 0
							AND cp.type_id = 1
					)
					
					-- get sum of cpc_cnts for each class_id
					SELECT class_cpc_cnts.class_id AS class_id, SUM(class_cpc_cnts.cpc_cnt) AS total_cpc_cnt
					FROM class_cpc_cnts
					GROUP BY class_cpc_cnts.class_id)

				-- add ns and class name
				SELECT ns.name as ns_name, classes.display_name as class_name, class_total_cpc_cnts.total_cpc_cnt
				FROM class_total_cpc_cnts,
					${schema}.classes AS classes,
					${schema}.ns AS ns
				WHERE class_total_cpc_cnts.class_id = classes.id
					AND classes.ns_id = ns.id`;
	const r = await util.getSchemaData(sql, params);
    return r;
}
const xx_getCPInfo = async (schema, params) => {
	const sql = `select id, property_id, type_id, class_id, cnt, object_cnt, x_max_cardinality, cover_set_index  from ${schema}.v_cp_rels_card where property_id in (${params.main.p_list}) order by property_id, type_id, class_id`;
	const r = await util.getSchemaData(sql, params);
    return r;
}
const xx_getPropInfo = async (schema, params) => {
	// Vairs nevajadzēs
	const sql = `select id, type_id, class_id, cnt, object_cnt, x_max_cardinality, cover_set_index 
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
	xx_getClassListExt,
	xx_getPropList,
	xx_getPropList2,
	xx_getPropList3,
	xx_getClassListInfo,
	xx_getCCInfo,
	xx_getCCInfo_Type3,
	xx_getCPCInfo,
	xx_getCPCInfoWithNames,
	xx_getClassCPCCounts,
	xx_getCPInfo,
	xx_getPropInfo,
	generateClassUpdate,
}