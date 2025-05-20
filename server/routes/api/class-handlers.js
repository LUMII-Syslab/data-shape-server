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
			len = 1;
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
const xx_getCPCInfoNew = async (schema, params) => {
	console.log('##############################################')
	const p_list = params.main.p_list;
	const c_list = await getAllClassesIds(schema, params, false);	
	const rr = await xx_getCCInfoNew(schema, params);
	const ccFull = await addCCInfo(schema, params, c_list, rr);
	const c_tree_full = ccFull.c_tree_full;
	const dnums = ccFull.dnums;
	const sql = `select cpc.id, cpc.cp_rel_id, cpc.other_class_id, cpc.cover_set_index, cpc.cnt, cpc.other_class_id as class_id, cp.class_id as class_1, cp.property_id, cp.type_id, c.display_name, c.prefix, c.cnt as c_cnt from ${schema}.cpc_rels cpc, ${schema}.cp_rels cp, ${schema}.v_classes_ns c  where cp.id = cpc.cp_rel_id and c.id = cpc.other_class_id  and property_id in (${p_list}) order by cpc.cp_rel_id, cp.cnt desc, c.cnt`;
	const r = await util.getSchemaData(sql, params);
	let cp_ids = await db.any(`select id from ${schema}.cp_rels`);
	cp_ids = cp_ids.map(v => v.id);
	
	for (const d of r.data) {
		d.cnt = Number(d.cnt);
		d.cover_set_index_new = 0;
		d.ok = false;
		d.dnum = dnums[d.class_id];
		d.c_cnt = Number(d.c_cnt);
	}
	r.data = r.data.sort(function(a,b) {
		if ( a.cnt === b.cnt && a.c_cnt === b.c_cnt) {
			return b.dnum - a.dnum;
		}
		else if (a.cnt === b.cnt) {
			return a.c_cnt - b.c_cnt;
		}
		return b.cnt > a.cnt ? 1 : -1;	 
	});	
	
	for (const cp_id of cp_ids) {
		const cp_list = r.data.filter(function(e){ return e.cp_rel_id == cp_id});
		calculateCoverSets(cp_list, c_tree_full);
	}
	for (const d of r.data) {
		d.class_id = d.class_1;
	}
	const dataNew = r.data.filter(function(e){ return e.cover_set_index == 1});	
	r.data = dataNew;
    return r;
}
const xx_getClassesSimple = async (schema, params) => {
	const sql = `SELECT c.id, c.display_name AS class_name, ns.name AS ns_name, c.cnt
				FROM ${schema}.classes AS c, ${schema}.ns AS ns
				WHERE c.ns_id = ns.id`;
	const r = await util.getSchemaData(sql, params);
    return r;
}

const xx_getPropertiesSimple = async (schema, params) => {
	const sql = `select id, display_name as name from ${schema}.properties`;
	const r = await util.getSchemaData(sql, params);
    return r;
}
const xx_getCPInfoObjectProps = async (schema, params) => {
	const sql = `select id, property_id, type_id, class_id, cnt, object_cnt  from ${schema}.cp_rels where object_cnt > 0`;
	const r = await util.getSchemaData(sql, params);
    return r;
}
const xx_getCPInfo = async (schema, params) => {
	const sql = `select id, property_id, type_id, class_id, cnt, object_cnt, x_max_cardinality, cover_set_index  from ${schema}.v_cp_rels_card where property_id in (${params.main.p_list}) order by property_id, type_id, class_id`;
	const r = await util.getSchemaData(sql, params);
    return r;
}
const getAllClassesIds = async (schema, params) => {
	const sql = `select id from ${schema}.classes`;
	const r = await util.getSchemaData(sql, params, false);
	return r.data.map(v => v.id);
} 
const getAllPropertiesIds = async (schema, params) => {
	const sql = `select id from ${schema}.properties`;
	const r = await util.getSchemaData(sql, params);
	return r.data.map(v => v.id);
}
const xx_getCPInfoNew = async (schema, params) => {
	// Rēķinu coverSetus uz vietas
	//const c_list = params.main.c_list; // Ņemam visas klases
	const c_list = await getAllClassesIds(schema, params, false);
	const p_list = params.main.p_list;
	const sql = `select cp.*, c.display_name, c.prefix, c.cnt as c_cnt from ${schema}.v_cp_rels_card cp, ${schema}.v_classes_ns c where c.id = class_id and property_id in (${p_list}) order by property_id, cp.cnt desc, c.cnt`;
	const r = await util.getSchemaData(sql, params);
	const rr = await xx_getCCInfoNew(schema, params);
	const ccFull = await addCCInfo(schema, params, c_list, rr);
	const c_tree_full = ccFull.c_tree_full;
	const dnums = ccFull.dnums;

	for (const d of r.data) {
		d.cnt = Number(d.cnt);
		d.cover_set_index_new = 0;
		d.ok = false;
		d.dnum = dnums[d.class_id];
	}
	r.data = r.data.sort(function(a,b) {
		if ( a.cnt === b.cnt && a.c_cnt === b.c_cnt) {
			return b.dnum - a.dnum;
		}
		else if (a.cnt === b.cnt) {
			return a.c_cnt - b.c_cnt;
		}
		return b.cnt > a.cnt ? 1 : -1;	 
	});

	let diffs = {classes:{}, cpIds:[], pIds:[], pIdsAll:[], newCC:rr.data3};
	for (const p of p_list) {
		const pp1 = r.data.filter(function(e){ return e.property_id == p && e.type_id == 1});
		calculateCoverSets(pp1, c_tree_full, diffs);
		const pp2 = r.data.filter(function(e){ return e.property_id == p && e.type_id == 2});
		calculateCoverSets(pp2, c_tree_full, diffs);
		//if (p == 7)
		//	console.log(pp2.map(function(v){ return `${v.prefix}:${v.display_name} ${v.class_id} cnt ${v.cnt} c_cnt ${v.c_cnt} dnum ${v.dnum} ${v.cover_set_index} ${v.cover_set_index_new} ${v.cc}`}));
	}
	r.diffs = diffs;
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
const addCCInfo = async (schema, params, c_list, rr) => {
	let c_tree_full = {};
	const cc_rels = rr.data;
	for (const c of c_list) {
		c_tree_full[c] = [];
	}

	if ( cc_rels.length > 0 ) {
		for (const c of c_list) {
			let ss = [c];
			let bb = [c];
			let len = 1;
			ss = [...new Set([...ss, ...cc_rels.filter(function(s){ return ss.includes(s.class_1_id)}).map( v => { return v.class_2_id})])];
			while ( len < ss.length) {
				len = ss.length;
				ss = [...new Set([...ss, ...cc_rels.filter(function(s){ return ss.includes(s.class_1_id)}).map( v => { return v.class_2_id})])];
			}
			len = 1;
			bb = [...new Set([...bb, ...cc_rels.filter(function(s){ return bb.includes(s.class_2_id)}).map( v => { return v.class_1_id})])];
			while ( len < bb.length) {
				len = bb.length;
				bb = [...new Set([...bb, ...cc_rels.filter(function(s){ return bb.includes(s.class_2_id)}).map( v => { return v.class_1_id})])];
			}
			c_tree_full[c] = [...new Set([...ss, ... bb])];		
		}
	}
	//console.log(c_tree_full)
	return {c_tree_full:c_tree_full,dnums:rr.data2};
}
const getSuperClasses = (cc_rels, clId) => {
	let ss = [clId];
	let len = 1;
	ss = [...new Set([...ss, ...cc_rels.filter(function(s){ return ss.includes(s.class_1_id)}).map( v => { return v.class_2_id})])];
	while ( len < ss.length) {
		len = ss.length;
		ss = [...new Set([...ss, ...cc_rels.filter(function(s){ return ss.includes(s.class_1_id)}).map( v => { return v.class_2_id})])];
	}
	return ss;
}  
const checkConnection = (cc_rels, c1, c2) => {
	let rez = false;
	const ss1 = getSuperClasses(cc_rels, c1);
	const ss2 = getSuperClasses(cc_rels, c2);
	if ( ss1.includes(c2) || ss2.includes(c1))
		rez = true;
	return rez;
}
const sortClassCCLists = (cc_list, sortedClassList) => {
	let cc_ids = [];
	for (const cc of cc_list) {
		if ( !cc_ids.includes(cc.class_1_id))
			cc_ids.push(cc.class_1_id);
		if ( !cc_ids.includes(cc.class_2_id))
			cc_ids.push(cc.class_2_id);
	}
	const classList =  sortedClassList.filter(function(cl){ return cc_ids.includes(cl.id) });
	return classList;
}
const calculateCoverSets = (list, c_tree_full, diffs = {classes:{}, cpIds:[], pIds:[], pIdsAll:[]}) => {
	let rez = list;
	if ( rez.length == 1 ) {
		rez[0].ok = true;
		rez[0].cover_set_index_new = 1;
	} 
	else {
		for (const el of rez) {
			el.cc = c_tree_full[el.class_id];
			if ( el.ok == false) {
				if (((el.display_name == 'Thing' && el.prefix =='owl') || (el.display_name == 'Resource' && el.prefix =='rdfs')) && ( el.cc.length > 0 || rez.length > 0 )) {// TODO te var domāt par tiem bērniem 
					el.ok = true;
				}
				else {
					el.cover_set_index_new = 1;
					el.ok = true;
					if ( c_tree_full[el.class_id].length > 0 ) {
						for (const el2 of rez) {
							if (c_tree_full[el.class_id].includes(el2.class_id)) {
								el2.ok = true;
							}	
						}
					}
				}
	
			}
			else {
				if ( c_tree_full[el.class_id].length > 0 ) {
					for (const el2 of rez) {
						if (c_tree_full[el.class_id].includes(el2.class_id)) {
							el2.ok = true;
						}	
					}
				}			
			}
		}
	}
	const rdfClasses = ['rdf:Property', 'skos:Concept"', 'owl:ObjectProperty','owl:Class', 'owl:AnnotationProperty', 'owl:DatatypeProperty', 'rdfs:Class', 'rdfs:Datatype', 'owl:FunctionalProperty', 'owl:InverseFunctionalProperty'];
	const rez2 = rez.filter(function(r){return r.cover_set_index > 0 });
	let maxCnt = 1;
	if ( rez2.length > 0)
		maxCnt = rez2[0].cnt;
	for (const el of rez) {
		if ( ((el.cover_set_index_new > 0 && el.cover_set_index == 0)|| (el.cover_set_index_new == 0 && el.cover_set_index > 0)) && el.dnum == 0) {
			console.log('********Nesakrīt**********', 'property_id', el.property_id, ' type_id', el.type_id, ' name',`${el.prefix}:${el.display_name}` )
			const clName = `${el.prefix}:${el.display_name}`;
			let type = 'o'; 
			if ( el.type_id == 1) type = 'i';
			diffs.cpIds.push(el.id);
			if ( !diffs.pIdsAll.includes(el.property_id))
				diffs.pIdsAll.push(el.property_id);

			if ( rdfClasses.includes(clName)) {
				diffs.rdfClasses = 'TRUE';
			}
			else {
				let sk = el.cnt/maxCnt;
				if ( sk > 0.1) 
					sk = `_${Math.round(sk*10)/10}`;
				else
					sk = '';
				if ( !diffs.pIds.includes(el.property_id))
					diffs.pIds.push(el.property_id);
				if ( diffs.classes[clName] != undefined )
					diffs.classes[clName] = `${diffs.classes[clName]} ${el.property_id}(${el.cover_set_index_new}${type}${sk})`;
				else
					diffs.classes[clName] = `${el.property_id}(${el.cover_set_index_new}${type}${sk})`;
			}
			el.ok = false;
		}
		el.cover_set_index = el.cover_set_index_new;
	}
	//console.log(rez)
	// 5555
	//if ( check)  // Izpētei, padodam atšķirības
	//	return info;
	//else
	//return rez;
}
const xx_getCCInfoNew = async (schema, params) => {
	const c_list = params.main.c_list; // To pagaidām neņemšu vērā
	let sql = `select cr.*, c1.cnt c1_cnt, c2.cnt c2_cnt, c1.display_name name1, c2.display_name name2 from ${schema}.cc_rels cr , ${schema}.classes c1, ${schema}.classes c2 where ( type_id = 1 or type_id = 2 ) and cr.class_1_id = c1.id and cr.class_2_id = c2.id order by c1.cnt, c2.cnt`;
	let r = await util.getSchemaData(sql, params, false);
	const cc_rels_orig = r.data;
	const cc_rels_ekv = cc_rels_orig.filter(function(cc){ return cc.c1_cnt == cc.c2_cnt });
	const cc_rels_rest = cc_rels_orig.filter(function(cc){ return cc.c1_cnt != cc.c2_cnt });
	sql = `select id, prefix, display_name, is_local from ${schema}.v_classes_ns order by is_local, prefix, display_name`;
	r = await util.getSchemaData(sql, params, false);
	const sortedClassList = r.data;
	let cc_tree = {};
	let c_tree = {};
	let newCCList = [];

	for ( const cl of sortedClassList) {
		c_tree[cl.id] = 0;
	}  

	if ( cc_rels_ekv.length > 0 ) {
		for (const c of cc_rels_ekv) {
			if ( cc_tree[c.c1_cnt] != undefined) {
				for (const cId of Object.keys(cc_tree[c.c1_cnt])) {
					if ( checkConnection(cc_rels_orig, Number(cId), c.class_1_id) )
						cc_tree[c.c1_cnt][cId].push(c);
					else
						cc_tree[c.c1_cnt][c.class_1_id] = [c];
				}
			}
			else {
				cc_tree[c.c1_cnt] = {};
				cc_tree[c.c1_cnt][c.class_1_id] = [c];
			}
		}
	
		let bigSortedIdList = [];
		for (const cnt of Object.keys(cc_tree)) {
			for  (const cId of Object.keys(cc_tree[cnt])) {
				const cc_list = cc_tree[cnt][cId];
				const sortedCCList = sortClassCCLists(cc_list, sortedClassList);
				const sortedIdList = sortedCCList.map( v => { return v.id});
				bigSortedIdList.push(sortedIdList);
				for (let i = 0; i < sortedCCList.length-1; i++) {
					const ccNew = {id:0, class_2_id:sortedCCList[i].id, class_1_id:sortedCCList[i+1].id, type_id:1, c1_cnt:cc_list[0].c1_cnt, c2_cnt:cc_list[0].c1_cnt }; // Skaiti ir vienādi
					cc_rels_rest.push(ccNew);
					newCCList.push(`${sortedCCList[i+1].display_name}- ${sortedCCList[i].display_name}`);
				}
			}
		}

		for (const cIdList of bigSortedIdList) {
			let i = 1;
			for (const cl of cIdList) {
				c_tree[cl] = i;
				i = i+1;
			}
			const ccSup = cc_rels_rest.filter(function(cc){ return cIdList.includes(cc.class_1_id) && !cIdList.includes(cc.class_2_id) });
			for (const cc of ccSup) {
				cc.class_1_id = cIdList[0];
				newCCList.push(`ID-${cIdList[0]}-${cc.name2}`);
			}
			const ccSub = cc_rels_rest.filter(function(cc){ return cIdList.includes(cc.class_2_id) && !cIdList.includes(cc.class_1_id) });
			for (const cc of ccSub) {
				cc.class_2_id = cIdList[cIdList.length-1];
				newCCList.push(`${cc.name1} - ID-${cIdList[cIdList.length-1]}`);
			}
		}		
	}

	r.data = cc_rels_rest;
	r.data2 = c_tree;
	r.data3 = newCCList;
	return r;
}
// **************************************************************************************************************
const get_KNOWN_DATA5 = async (tag) => {
	const r = await db.any(`SELECT * from public.v_configurations where is_active = true `); //and ( display_name = 'ISWC2017' or display_name = 'BlazeGraphNamespace'  `);
	let result = [];
	for ( const db_info of r) {
        if (tag && !db_info.tags.includes(tag)) continue;
		let r0 = await db.any(`SELECT COUNT(*) FROM information_schema."tables" where table_schema = '${db_info.db_schema_name}'`);
		if ( r0[0].count > 0) {
			let info = {display_name:db_info.display_name};
			//let rr = await db.any(`SELECT COUNT(*) FROM ${db_info.db_schema_name}.classes`);
			//info.class_count = rr[0].count;
			const s1 = ``; 
			const sql = `select count(*) count, (select count(*) from ${db_info.db_schema_name}.properties) pp, (select count(*) > 0 from ${db_info.db_schema_name}.cpc_rels) cpc_rels, 
(select count(*) from ${db_info.db_schema_name}.cc_rels where type_id = 1 ) cc1, (select count(*) from ${db_info.db_schema_name}.cc_rels where type_id = 2 ) cc2, (select count(*) from ${db_info.db_schema_name}.cc_rels where type_id = 3 ) cc3, 
(select count(*) - count(distinct class_1_id) > 0 from ${db_info.db_schema_name}.cc_rels) multi, 
(select count(*) from ${db_info.db_schema_name}.cc_rels cr , ${db_info.db_schema_name}.classes c1, ${db_info.db_schema_name}.classes c2 where type_id = 1 and cr.class_1_id = c1.id and cr.class_2_id = c2.id and c1.cnt = c2.cnt) ekv
from ${db_info.db_schema_name}.classes`
			let rr = await db.any(sql);
			info.class_count = rr[0].count;
			info.properties = rr[0].pp;
			info.info = `has_cpc_rels:${rr[0].cpc_rels} cc1:${rr[0].cc1} cc2:${rr[0].cc2} cc3:${rr[0].cc3} multi:${rr[0].multi}, ekv:${rr[0].ekv}`; 
			rr = await db.any(`select prefix, local_name from ${db_info.db_schema_name}.v_classes_ns vcn where ( prefix = 'rdfs' and local_name = 'Resource' ) or ( prefix = 'owl' and local_name = 'Thing')`);
			if ( rr.length > 0 ) {
				rr = rr.map( v => `${v.prefix}:${v.local_name}`);
				info.tops = rr;
			}

			if ( Number(info.class_count) < 100 && Number(info.class_count) > 0 && Number(info.properties) > 0 ) {
				console.log('***************', db_info.db_schema_name, info.class_count)
				const p_list = await getAllPropertiesIds(db_info.db_schema_name, {main:{}});
				const cpInfo = await xx_getCPInfoNew(db_info.db_schema_name, {main:{p_list:p_list}});
				//console.log('~~~~~~~~~~~~~~~~~', cpInfo.diffs)
				if ( cpInfo.diffs.newCC.length > 0 ) {
					info.newCC = cpInfo.diffs.newCC;
				}
				if ( cpInfo.diffs.pIdsAll.length > 0 ) {
					if ( cpInfo.diffs.pIds.length > 0 ) {
						let prop = await db.any(`SELECT id, display_name FROM ${db_info.db_schema_name}.properties where id in (${cpInfo.diffs.pIds}) order by cnt`);
						cpInfo.diffs.pNames = prop.map(v => `${v.display_name}(${v.id})`);
						info.cp = cpInfo.diffs;
					}
					else if ( cpInfo.diffs.rdfClasses) {
						info.rdfClasses = true;
					}

				}
			}
			result.push(info);
		} 
	}
	result = result.sort(function(a,b){ return b.class_count-a.class_count});
	return result;
}
// **************************************************************************************************************

module.exports = {
	get_KNOWN_DATA5,
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
	xx_getCCInfoNew,
	xx_getCCInfo_Type3,
	xx_getCPCInfo,
	xx_getClassesSimple,
	xx_getPropertiesSimple,
	xx_getCPInfoObjectProps,
	xx_getCPInfo,
	xx_getCPInfoNew,
	xx_getCPCInfoNew,
	xx_getPropInfo,
	generateClassUpdate,
}