const db = require('./db')
const debug = require('debug')('dss:classops')

const { 
	sparqlGetIndividualClasses,
} = require('../../util/sparql/endpoint-queries')

const { 
    parameterExists,
	getFilterColumn,
	formWherePart,
	getPropertyByName,
	getSchemaData,
	getSchemaDataPlus,
	getIdsfromPList,
} = require('./utilities')

const MAX_ANSWERS = 100;

/* list of classes */
const getOntologyClasses = async ontName => {
    // seems there is no way to provide the schema name as a query parameter  
    // const r = await db.any('select iri, local_name from $1.classes limit 10', [ontName]);

    const r = await db.any(`select iri, display_name, cnt from ${ontName}.classes order by cnt desc limit $1`, [MAX_ANSWERS]);
	// debug('esmu te', r)
    return r;
}

/* filtered list of classes */
const getOntologyClassesFiltered = async (ontName, filter) => {
    // const r = await db.any(`SELECT iri, local_name FROM ${ontName}.classes WHERE iri ~ $2 LIMIT $1`, [MAX_ANSWERS, filter]);
	const sk = await db.any(`SELECT count(*) FROM ${ontName}.classes WHERE display_name ~ $1`, [filter]);
    const r = await db.any(`SELECT iri, display_name, local_name, cnt, (select name from ${ontName}.ns n where c.ns_id = n.id ) ns FROM ${ontName}.classes c WHERE display_name ~ $2 order by cnt desc LIMIT $1`, [MAX_ANSWERS, filter]);
	return {data: r, complete: sk[0].count <= MAX_ANSWERS};
    //return r.map(x => x.local_name);
}

/* list of classes */
// **************************************************************************************************************
const findMainProperty = async (schema, pList) => {

	if ( pList.in.length === 1)
		return { id: pList.in[0], type: 'in', typeId: 1 };
	if ( pList.in.length > 1){
		const r =  await db.any(`SELECT id FROM ${schema}.properties where ${formWherePart('id', 'in', pList.in, 0)} order by object_cnt limit 1`); 
		return { id: r[0].id, type: 'in', typeId: 1 }
	}
	
	if ( pList.out.length === 1)
		return { id: pList.out[0], type: 'out', typeId: 2 };
	if ( pList.out.length > 1){
		const r =  await db.any(`SELECT id FROM ${schema}.properties where ${formWherePart('id', 'in', pList.out, 0)} order by cnt limit 1`); 
		return { id: r[0].id, type: 'out', typeId: 2  }
	}
	return {};
}


/* list of classes */
const getClasses = async (schema, params) => {
	
	const viewname = ( parameterExists(params, "filter") || ( parameterExists(params, "namespaces") && params.namespaces.in !== undefined)  ? `${schema}.v_classes_ns v` :`${schema}.v_classes_ns_main v` ) ;
	let whereList = [ true ];
	let r = { data: [], complete: false };
	if ( parameterExists(params, "filter") ) {
		//viewname = `${schema}.v_classes_ns v`;
		whereList.push(`v.${getFilterColumn(params)} ~ $2`); 
	}

	if ( parameterExists(params, "uriIndividual") ){
		const classList = await sparqlGetIndividualClasses(params);
		const idList = await db.any(`SELECT id FROM ${schema}.classes where ${formWherePart('iri', 'in', classList, 1)}`); 
		if ( idList.length > 0) 
			whereList.push(formWherePart('id', 'in', idList.map(v => v.id), 0));
		else
			params.uriIndividual = "";
	}
	
	if ( parameterExists(params, "namespaces") ){
		if (params.namespaces.in !== undefined )
			whereList.push(formWherePart('v.prefix', 'in', params.namespaces.in, 1));
		if (params.namespaces.notIn !== undefined )
			whereList.push(formWherePart('v.prefix', 'not in', params.namespaces.notIn, 1));
	}
	
	let mainProp = {};
	let newPList = {in:[], out:[]};
	if ( parameterExists(params, "pList") && !parameterExists(params, "uriIndividual")  ){
		newPList = await getIdsfromPList(schema, params.pList);
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
			sql = `SELECT v.*, 1 as principal_class FROM ${viewname} order by cnt desc LIMIT $1`;
		else
			sql = `SELECT v.*, 1 as principal_class FROM ${viewname} WHERE ${whereStr} order by cnt desc LIMIT $1`;
		
	}
	else {
		if ( newPList.in.length > 0 || newPList.out.length > 0) {
			if (newPList.in.length > 0 )
				newPList.in.forEach(element => whereList.push(`v.id in (SELECT class_id FROM ${schema}.cp_rels WHERE property_id = ${element} and type_id = 1)`));
			if (newPList.out.length > 0 )
				newPList.out.forEach(element => whereList.push(`v.id in (SELECT class_id FROM ${schema}.cp_rels WHERE property_id = ${element} and type_id = 2)`));
		}
			
		const whereStr = whereList.join(' and ')
	    //const JoinStr = ( parameterExists(params, "onlyPropsInSchema") && params.onlyPropsInSchema ? 'JOIN' : 'LEFT JOIN')

		sql = `SELECT v.*, case when p.cover_set_index is not null then 2 else 1 end as principal_class 
                FROM ${viewname} JOIN ${schema}.cp_rels p ON p.class_id = v.id and p.type_id = ${mainProp.typeId} and p.property_id = ${mainProp.id} 
				WHERE ${whereStr} order by p.cnt desc LIMIT $1`;
		
		const w2 = ( parameterExists(params, "filter") ? `v.${getFilterColumn(params)} ~ $2 and props_in_schema = false` : 'props_in_schema = false' );
		sql_plus = `SELECT v.*, 0 as principal_class FROM ${viewname} WHERE ${w2} order by v.cnt desc LIMIT $1`;

	}
			
	if ( sql_plus !== '')
		r = await getSchemaDataPlus(sql, sql_plus, params);
	else
		r = await getSchemaData(sql, params);

	return r;
}

/* list of tree classes */
const getTreeClasses = async (schema, params) => {
	let whereList = [ true ];
	let sql = '';
	let sql_plus = '';
	let r = { data: [], complete: false };
	
	const viewname = ( parameterExists(params, "filter") || ( parameterExists(params, "namespaces") && params.namespaces.in !== undefined)  ? `${schema}.v_classes_ns_plus v` :`${schema}.v_classes_ns_main_plus v` ) ;
		
	if ( parameterExists(params, "namespaces") ){
		if (params.namespaces.in !== undefined && params.namespaces.in.length > 0 )
			whereList.push(formWherePart('v.prefix', 'in', params.namespaces.in, 1));
		if (params.namespaces.notIn !== undefined && params.namespaces.notIn .length > 0 )
			whereList.push(formWherePart('v.prefix', 'not in', params.namespaces.notIn, 1));
	}
	
	if ( parameterExists(params, "filter") )
		whereList.push(`v.${getFilterColumn(params)} ~ $2`); 
	
	if (params.mode === 'Top') {
		sql = `SELECT v.* FROM ${viewname} WHERE ${whereList.join(' and ')} order by cnt desc LIMIT $1`;
	}
	
	if (params.mode === 'Sub') {
		whereList.push(`r.class_2_id = ${params.class_id} and r.class_1_id = v.id`);
		sql = `SELECT v.* from ${schema}.v_classes_ns_plus v, ${schema}.cc_rels r WHERE ${whereList.join(' and ')} order by cnt desc LIMIT $1`;
	}
	
	if (params.mode === 'SubAll' && params.class_id > 0) {
		
		if ( parameterExists(params, "filter") ) 
			whereList.push(`v.${getFilterColumn(params)} ~ $2`); 

		whereList.push(`r.class_2_id = ${params.class_id} and r.class_1_id = v.id`);
		sql = `SELECT v.* from ${schema}.v_classes_ns v, ${schema}.cc_rels r WHERE ${whereList.join(' and ')} order by cnt desc LIMIT $1`;
		sql_plus = `with recursive pairs(A,B) as ( SELECT class_1_id, class_2_id from ${schema}.cc_rels  union all  SELECT X.A, Y.class_2_id FROM pairs X, ${schema}.cc_rels Y WHERE X.B = Y.class_1_id)
				SELECT v.* from pairs, ${schema}.v_classes_ns v WHERE v.id = A and B = ${params.class_id} and ${whereList.join(' and ')} order by cnt desc LIMIT $1`;
	}
	
	if ( sql_plus !== '')
		r = await getSchemaDataPlus(sql, sql_plus, params);
	if ( sql !== '')
		r = await getSchemaData(sql, params);

	return r;
}

// **************************************************************************************************************
const getOntologyNameSpaces = async schema => {
	const r = await db.any(`select  id, name, priority, (select count(*) from ${schema}.classes where ns_id = ns.id  ) cl_count from ${schema}.ns where priority > 0`);
    return r;
}
	
const getNamespaces = async schema => {
	const r = await db.any(`SELECT  *, 
	          (SELECT count(*) FROM ${schema}.classes where ns_id = ns.id  ) cl_count, 
			  (SELECT count(*) FROM ${schema}.properties where ns_id = ns.id  ) prop_count 
		FROM ${schema}.ns order by priority desc`);
    return r;
}
// **************************************************************************************************************

module.exports = {
	getOntologyNameSpaces,
    getOntologyClasses,
    getOntologyClassesFiltered,
	getClasses,
	getNamespaces,
	getTreeClasses,
}