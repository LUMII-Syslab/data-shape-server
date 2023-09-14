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
const getPropertiesNew = async (schema, params) => {
console.log("--------------getPropertiesNew-------------------");
	if ( !util.isPropertyKind(params)) 
		params = util.setPropertyKind(params, 'All');
	function classType(classO) {
		if ( classO.length == 0 )
			return 'n';
		if ( classO[0].props_in_schema === false )	
			return 's';
		if ( classO[0].props_in_schema === true )
			return 'b';
		return 'n'  
	} 
	async function addToWhereList(propListAB)  {
		let sqlA = '';
		let sqlB = '';

		if (propListAB.A.length > 0)
			sqlA = `SELECT id FROM ${schema}.v_properties_ns where ${util.formWherePart('iri', 'in', propListAB.A, 1)} ${filter_string} and ${strOrderField} > 0 order by ${strOrderField} desc limit $1`;
		if (propListAB.B.length > 0)
			sqlB = `SELECT id FROM ${schema}.v_properties_ns where ${util.formWherePart('iri', 'in', propListAB.B, 1)} ${filter_string} and ${strOrderField} > 0 order by ${strOrderField} desc limit $1`;
		
		const idListA = await util.getSchemaData(sqlA,params);
		if ( idListA.data.length > 0) 
			whereListA_2.push(util.formWherePart('v.id', 'in', idListA.data.map(v => v.id), 0));
		else
			whereListA_2.push('false');
			
		const idListB = await util.getSchemaData(sqlB,params);
		if ( idListB.data.length > 0) 
			whereListB_2.push(util.formWherePart('v.id', 'in', idListB.data.map(v => v.id), 0));
		else
			whereListB_2.push('false');	
	}
	async function generateWhereList()  {
		let out_prop_ids = [];
		let in_prop_ids = [];
		whereListA.push(`${strAo} > 0`);
		whereListB.push(`${strBo} > 0`);
		const sql_out = `SELECT v.id FROM ${schema}.v_properties_ns v ${contextA} WHERE ${whereListA.join(' and ')} order by ${orderByPref.replace("id in","v.id in")} ${strAo} desc LIMIT $1`;
		const out_props = await util.getSchemaData(sql_out,params);
		if ( out_props.data.length > 0) {
			out_prop_ids = out_props.data.map(v => v.id);
			whereListA_2.push(util.formWherePart('v.id', 'in', out_prop_ids, 0));
		}
		else 
			whereListA_2.push("false");
			
		if ( !only_out) {
			const sql_in = `SELECT v.id FROM ${schema}.v_properties_ns v ${contextB} WHERE ${whereListB.join(' and ')} order by ${orderByPref.replace("id in","v.id in")} ${strBo} desc LIMIT $1`;
			const in_props = await util.getSchemaData(sql_in,params);
			if ( in_props.data.length > 0) {
				in_prop_ids = in_props.data.map(v => v.id);
				whereListB_2.push(util.formWherePart('v.id', 'in', in_prop_ids, 0));
			}
			else
				whereListB_2.push("false");
		}
	}
	async function formSql()  {

		let sql = `SELECT aa.* FROM ( SELECT 'out' as mark, ${cardA} as x_max_cardinality, v.*, ${strAo} as o 
FROM ${schema}.${viewname_out} v ${contextA_2} WHERE ${whereListA_2.join(' and ')} ) aa order by ${orderByPref} o desc LIMIT $1`;

		if ( !only_out ) {
		sql = `SELECT aa.* FROM (
SELECT 'out' as mark, ${cardA} as x_max_cardinality, v.*, ${strAo} as o FROM ${schema}.${viewname_out} v ${contextA_2} WHERE ${whereListA_2.join(' and ')} 
UNION ALL
SELECT 'in' as mark, ${cardB} as x_max_cardinality, v.*, ${strBo} as o  FROM ${schema}.${viewname_in} v ${contextB_2} WHERE ${whereListB_2.join(' and ')} ) aa 
order by ${orderByPref} o desc LIMIT $1`;	
		}
		
		if (viewname_out == 'v_cp_targets_single') {
		sql = `SELECT aa.* FROM (
SELECT 'out' as mark, v.* FROM ${schema}.${viewname_out} v ${contextA_2} WHERE ${whereListA_2.join(' and ')} 
UNION ALL
SELECT 'in' as mark, v.* o  FROM ${schema}.${viewname_in} v ${contextB_2} WHERE ${whereListB_2.join(' and ')} ) aa 
order by ${orderByPref} o desc LIMIT $1`;	
		}
		return sql;
	}
	
	const filter_string = ( util.isFilter(params) == '' ? '' : ` and v.${util.getFilterColumn(params)} ~ $2`);
	const propertyKind = util.getPropertyKind(params);
		
	const only_out = !(propertyKind === 'ObjectExt' || propertyKind === 'Connect');
	const orderByPref = ( util.getIsBasicOrder(params) ? `case when ${ util.getDeferredProperties(params)} then 0.5 else basic_order_level end, ` : '');
   	let r = { data: [], complete: false };
	let sql;
	const use_pp_rels = util.getUsePP(params);
	const simplePrompt = util.getSimplePrompt(params);  
	const isLinksWithTargets = util.isLinksWithTargets(params);	
	const class_pairs_info = await db.any(`SELECT count(*) FROM ${schema}.cpc_rels`);
	const use_class_pairs = class_pairs_info[0].count > 0;  
	let viewname_out;
	let viewname_in;
	let classFrom = [];
	let classTo = [];
	let whereListA = [ true ];
	let whereListB = [ true ];
	let whereListA_2 = [ true ];
	let whereListB_2 = [ true ];
	let contextA = '';
	let contextB = '';
	let contextA_2 = '';
	let contextB_2 = '';
	let strOrderField = 'cnt';
	let strAo = '';
	let strBo = '';
	let cardA = 'v.max_cardinality';
	let cardB = 'v.inverse_max_cardinality';
	let newPListFrom = {in:[], out:[]};
	let newPListTo = {in:[], out:[]};
	if ( util.isPList(params, 0) )
		newPListFrom = await util.getIdsfromPList(schema, util.getPList(params, 0), params);
	if ( util.isPList(params, 1) )
		newPListTo = await util.getIdsfromPList(schema, util.getPList(params, 1), params);
	
	if ( propertyKind !== 'Connect') {
		viewname_out = 'v_properties_ns';
		viewname_in = 'v_properties_ns';
		
		if ( propertyKind === 'Data' ) 
			strOrderField = 'data_cnt';
		if ( propertyKind === 'Object' || propertyKind === 'ObjectExt') 
			strOrderField = 'object_cnt';	

		if ( util.isNamespaces(params)) {
			whereListA.push(util.getNsWhere(params));
			whereListB.push(util.getNsWhere(params));
		}		

		if ( util.isFilter(params)) {
			whereListA.push(`v.${util.getFilterColumn(params)} ~ $2`); 
			whereListB.push(`v.${util.getFilterColumn(params)} ~ $2`);
		}
		
		if ( util.isClassName(params, 0))
			classFrom = await util.getClassByName(util.getClassName(params, 0), schema, params);
		
		if ( classType(classFrom) === 's' || util.isUriIndividual(params, 0) || util.isPListI(params) ) {  // Informācija no end-pointa
			if ( util.isUriIndividual(params, 0) ) {
				const ind = await util.getUriIndividual(schema, params, 0);
				const propListAB = await sparqlGetPropertiesFromIndividuals(params, 'From', only_out, ind);
				await addToWhereList(propListAB);
			}	
			else if ( util.isPListI(params))  {  // šis zars ie palēns un pagaidām netiks izsaukts
				const propListAB = await sparqlGetPropertiesFromRemoteIndividual(params, schema, only_out);
				addToWhereList(propListAB);
			}
			else if ( classType(classFrom) === 's') {  // Klasei nav cp_rels informācijas
				const propListAB = await sparqlGetPropertiesFromClass(schema, params, 'From', classFrom[0].iri, only_out);
				await addToWhereList(propListAB);
			}
		}
		else {
			if ( classType(classFrom) === 'b') {
				contextA = `, ${schema}.v_cp_rels_card r`;
				contextB = `, ${schema}.v_cp_rels_card r`;
				whereListA.push(`property_id = v.id and r.type_id = 2 and class_id = ${classFrom[0].id}`);  
				whereListB.push(`property_id = v.id and r.type_id = 1 and class_id = ${classFrom[0].id}`);
				if ( only_out || ( propertyKind === 'ObjectExt'  && !util.isLinksWithTargets(params)) ) { // netiks lietots jaunais skats
					cardA = 'r.x_max_cardinality';
					cardB = 'r.x_max_cardinality';
					whereListA_2.push(`property_id = v.id and r.type_id = 2 and class_id = ${classFrom[0].id}`); 
					whereListB_2.push(`property_id = v.id and r.type_id = 1 and class_id = ${classFrom[0].id}`); 
					contextA_2 = contextA;
					contextB_2 = contextB;
				}
			} 
  
			if ( newPListFrom.in.length > 0 || newPListFrom.out.length > 0 ) {  // Ir propertijas apkārtnē
				const mainProp = await findMainProperty(schema, newPListFrom, newPListTo);
				console.log("--------galvenā propertija----------")
				console.log(mainProp)			
				if ( use_pp_rels ) {
					if ( contextA === '' ) {  // Ir tikai properijas

						newPListFrom.in = newPListFrom.in.filter(item => item !== mainProp.id);
						newPListFrom.out = newPListFrom.out.filter(item => item !== mainProp.id);

						contextA = `, ${schema}.pp_rels r`;
						contextB = `, ${schema}.pp_rels r`;
						contextA_2 = contextA;
						contextB_2 = contextB;
						if ( mainProp.type === 'in' ) {
							whereListA.push(`v.id = r.property_2_id and r.type_id = 1 and property_1_id = ${mainProp.id}`);
							whereListB.push(`v.id = r.property_2_id and r.type_id = 3 and property_1_id = ${mainProp.id}`);
							whereListA_2.push(`v.id = r.property_2_id and r.type_id = 1 and property_1_id = ${mainProp.id}`); 
							whereListB_2.push(`v.id = r.property_2_id and r.type_id = 3 and property_1_id = ${mainProp.id}`); 
						}
						if ( mainProp.type === 'out' ) {
							whereListA.push(`v.id = r.property_2_id and r.type_id = 2 and property_1_id = ${mainProp.id}`);
							whereListB.push(`v.id = r.property_1_id and r.type_id = 1 and property_2_id = ${mainProp.id}`);
							whereListA_2.push(`v.id = r.property_2_id and r.type_id = 2 and property_1_id = ${mainProp.id}`); 
							whereListB_2.push(`v.id = r.property_1_id and r.type_id = 1 and property_2_id = ${mainProp.id}`); 
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

					if ( !simplePrompt ) {  // pieliek pārējās propertijas klāt
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
					}
				}
				else {
					if ( contextA === '' && !simplePrompt ) { // Ir tikai propertijas bet nav pp_rels
						const mainPropObj = await db.any(`SELECT * FROM ${schema}.v_properties_ns WHERE id = ${mainProp.id}`);
						let class_id_list = [];
						
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

							const propListA = await db.any(`SELECT distinct property_id FROM ${schema}.cp_rels where ${util.formWherePart('class_id', 'in', class_id_list, 0)} and type_id = 2 order by property_id`); 
							if ( propListA.length > 0)
								whereListA.push(util.formWherePart('v.id', 'in', propListA.map(v => v.property_id), 0));
							else
								whereListA.push('false');
							
							const propListB = await db.any(`SELECT distinct property_id FROM ${schema}.cp_rels where ${util.formWherePart('class_id', 'in', class_id_list, 0)} and type_id = 1 order by property_id`); 
							if ( propListB.length > 0)
								whereListB.push(util.formWherePart('v.id', 'in', propListB.map(v => v.property_id), 0));
							else
								whereListB.push('false');
			
							//strAo = 'v.cnt';  // TODO padomāt, kāpēc šādi bija ielikts
							//strBo = 'v.cnt';
							
						}
			
					}
				}
			}
			if (strAo === '') {
				const ot = ( contextA == '' ? 'v.' : 'r.');
				strAo = `${ot}${strOrderField}`;
				strBo = `${ot}${strOrderField}`;
			}

			await generateWhereList();
		}
		//console.log(whereListA_2);
		//console.log(whereListB_2);
		// **** 			
		if (strAo === '') {
			const ot = ( contextA == '' ? 'v.' : 'r.')
			strAo = `${ot}${strOrderField}`;
			strBo = `${ot}${strOrderField}`;
		}
		
		if ( util.isLinksWithTargets(params)) {
			if ( classType(classFrom) === 'b' ) {
				viewname_out = 'v_cp_targets_single';
				viewname_in = 'v_cp_sources_single';
				if (contextA_2 == '') {
					whereListA_2.push(`class_id = ${classFrom[0].id}`); 
					whereListB_2.push(`class_id = ${classFrom[0].id}`); 
				
				}
			}
			else {
				viewname_out = 'v_properties_targets_single';
				viewname_in = 'v_properties_sources_single';			
			}
		}
		else {
			viewname_out = 'v_properties_ns';
			viewname_in = 'v_properties_ns';
		}
		
		//console.log(contextA_2);
		//console.log(strAo);
		const sql = await formSql();
		//console.log(sql);
		r = await util.getSchemaData(sql, params);
	}
	else {  // propertyKind == 'Connect'  TODO pārdomāt, vai ar šo pietiek (nav filtra, dbpedia varbūt būtu interesants)
		let sql_0 = '';
		let sql_list = [];
		strOrderField = 'object_cnt';
		
		if (  util.isUriIndividual(params, 0) || util.isUriIndividual(params, 1)) {
			if (  util.isUriIndividual(params, 0) && util.isUriIndividual(params, 1)) {
				const indFrom = await util.getUriIndividual(schema, params, 0);
				const indTo = await util.getUriIndividual(schema, params, 1);
				const propListAB = await sparqlGetPropertiesFromIndividuals(params, 'All', only_out, indFrom, indTo); 
				await addToWhereList(propListAB);
			}
			else if (util.isUriIndividual(params, 0)) { 
				const ind = await util.getUriIndividual(schema, params, 0);
				const propListAB = await sparqlGetPropertiesFromIndividuals(params, 'From', only_out, ind);
				await addToWhereList(propListAB);
			}
			else {  //  util.isUriIndividual(params, 1) = true
				const ind = await util.getUriIndividual(schema, params, 1);
				const propListAB = await sparqlGetPropertiesFromIndividuals(params, 'From', only_out, ind);
				await addToWhereList(propListAB);
			}
			sql_0 = `SELECT aa.* FROM ( 
				SELECT 'out' as mark, v.*, v.object_cnt as o FROM ${schema}.v_properties_ns v WHERE ${whereListA_2.join(' and ')}
				UNION 
				SELECT 'in' as mark, v.*, v.object_cnt as o FROM ${schema}.v_properties_ns v WHERE ${whereListB_2.join(' and ')}
				) aa where o > 0 order by o desc LIMIT $1`;			
			r = await util.getSchemaData(sql_0, params);
		}
		else if ( util.isClassName(params, 0) || util.isClassName(params, 1)) {

			if ( util.isClassName(params, 0))
				classFrom = await util.getClassByName(util.getClassName(params, 0), schema, params);		

			if ( util.isClassName(params, 1))
				classTo = await util.getClassByName(util.getClassName(params, 1), schema, params);	
				
			if ( classType(classFrom) === 'b' && classType(classTo) === 'b' ) {

				if ( use_class_pairs ) {
					sql_0 = `SELECT property_id FROM ${schema}.cp_rels cr, ${schema}.cpc_rels cr2 where class_id = ${classFrom[0].id} and type_id = 2 and cp_rel_id = cr.id and other_class_id = ${classTo[0].id} and cr.object_cnt > 0 order by cr.object_cnt desc LIMIT $1`;
					const prop_out = await util.getSchemaData(sql_0, params);

					if ( prop_out.data.length > 0) {
						sql_0 = `SELECT 'out' as mark, v.*, r.object_cnt as o FROM ${schema}.v_properties_ns v , ${schema}.v_cp_rels_card r 
						WHERE property_id = v.id and r.type_id = 2 and class_id = ${classFrom[0].id} and ${util.formWherePart('v.id', 'in', prop_out.data.map(v => v.property_id), 0)}`;
						sql_list.push(sql_0);
					}

					sql_0 = `SELECT property_id FROM ${schema}.cp_rels cr, ${schema}.cpc_rels cr2 where class_id = ${classFrom[0].id} and type_id = 1 and cp_rel_id = cr.id and other_class_id = ${classTo[0].id} and cr.object_cnt > 0 order by cr.object_cnt desc LIMIT $1`;
					const prop_in = await util.getSchemaData(sql_0, params);                         

					if ( prop_in.data.length > 0) {
						sql_0 = `SELECT 'in' as mark, v.*, r.object_cnt as o FROM ${schema}.v_properties_ns v , ${schema}.v_cp_rels_card r
								WHERE property_id = v.id and r.type_id = 1 and class_id = ${classFrom[0].id} and  ${util.formWherePart('v.id', 'in', prop_in.data.map(v => v.property_id), 0)}`;
						sql_list.push(sql_0);
					}
						
					sql_0 = `SELECT aa.* FROM ( ${sql_list.join(' UNION ')} ) aa where o > 0 order by  o desc LIMIT $1`;		
				}
				else {
					sql_0 = `SELECT property_id FROM ${schema}.v_properties_ns v, ${schema}.cp_rels r WHERE property_id = v.id ${filter_string} and r.type_id = 2 and class_id = ${classFrom[0].id} 
							and property_id in (select property_id from ${schema}.cp_rels r where r.type_id = 1 and class_id = ${classTo[0].id}) and r.object_cnt > 0 order by r.object_cnt desc LIMIT $1`;
					const prop_out = await util.getSchemaData(sql_0, params);
					
			
					if ( prop_out.data.length > 0) {
						sql_0 = `SELECT 'out' as mark, v.*, r.object_cnt as o FROM ${schema}.v_properties_ns v , ${schema}.v_cp_rels_card r 
						WHERE property_id = v.id and r.type_id = 2 and class_id = ${classFrom[0].id} and ${util.formWherePart('v.id', 'in', prop_out.data.map(v => v.property_id), 0)}`;
						sql_list.push(sql_0);
					}

					sql_0 = `SELECT property_id FROM ${schema}.v_properties_ns v, ${schema}.cp_rels r WHERE property_id = v.id ${filter_string} and r.type_id = 1 and class_id = ${classFrom[0].id} 
							and property_id in (select property_id from ${schema}.cp_rels r where r.type_id = 2 and class_id = ${classTo[0].id}) and r.object_cnt > 0 order by r.object_cnt desc LIMIT $1`;
					const prop_in = await util.getSchemaData(sql_0, params);                         

					if ( prop_in.data.length > 0) {
						sql_0 = `SELECT 'in' as mark, v.*, r.object_cnt as o FROM ${schema}.v_properties_ns v , ${schema}.v_cp_rels_card r
								WHERE property_id = v.id and r.type_id = 1 and class_id = ${classFrom[0].id} and  ${util.formWherePart('v.id', 'in', prop_in.data.map(v => v.property_id), 0)}`;
						sql_list.push(sql_0);
					}
						
					sql_0 = `SELECT aa.* FROM ( ${sql_list.join(' UNION ')} ) aa where o > 0 order by  o desc LIMIT $1`;					
				}

				r = await util.getSchemaData(sql_0, params);
			}	
			else if ( classType(classFrom) === 'b' ) {
				sql_0 = `SELECT property_id FROM ${schema}.v_properties_ns v, ${schema}.cp_rels r WHERE property_id = v.id ${filter_string} and r.type_id = 2 property_id = v.id ${filter_string} and class_id = ${classFrom[0].id} 
						and r.object_cnt > 0 order by r.object_cnt desc LIMIT $1`;
				const prop_out = await util.getSchemaData(sql_0, params);

				if ( prop_out.data.length > 0) {
					sql_0 = `SELECT 'out' as mark, r.x_max_cardinality as x_max_cardinality, v.*, r.object_cnt as o FROM ${schema}.v_properties_ns v , ${schema}.v_cp_rels_card r 
					WHERE property_id = v.id and r.type_id = 2 and class_id = ${classFrom[0].id} and ${util.formWherePart('v.id', 'in', prop_out.data.map(v => v.property_id), 0)}`;
					sql_list.push(sql_0);
				}

				sql_0 = `SELECT property_id FROM ${schema}.v_properties_ns v, ${schema}.cp_rels r WHERE property_id = v.id ${filter_string} and r.type_id = 1 and class_id = ${classFrom[0].id} 
						and r.object_cnt > 0 order by r.object_cnt desc LIMIT $1`;
				const prop_in = await util.getSchemaData(sql_0, params);                         

				if ( prop_in.data.length > 0) {
					sql_0 = `SELECT 'in' as mark, r.x_max_cardinality as x_max_cardinality, v.*, r.object_cnt as o FROM ${schema}.v_properties_ns v , ${schema}.v_cp_rels_card r
							WHERE property_id = v.id and r.type_id = 1 and class_id = ${classFrom[0].id} and  ${util.formWherePart('v.id', 'in', prop_in.data.map(v => v.property_id), 0)}`;
					sql_list.push(sql_0);
				}
					
				sql_0 = `SELECT aa.* FROM ( ${sql_list.join(' UNION ')} ) aa where o > 0 order by  o desc LIMIT $1`;	
				r = await util.getSchemaData(sql_0, params);				
			}
			else if ( classType(classTo) === 'b' ) {
				sql_0 = `SELECT property_id FROM ${schema}.v_properties_ns v, ${schema}.cp_rels r WHERE property_id = v.id ${filter_string} and r.type_id = 1 and class_id = ${classTo[0].id} 
						and r.object_cnt > 0 order by r.object_cnt desc LIMIT $1`;
				const prop_out = await util.getSchemaData(sql_0, params);

				if ( prop_out.data.length > 0) {
					sql_0 = `SELECT 'out' as mark, r.x_max_cardinality as x_max_cardinality, v.*, r.object_cnt as o FROM ${schema}.v_properties_ns v , ${schema}.v_cp_rels_card r 
					WHERE property_id = v.id and r.type_id = 1 and class_id = ${classTo[0].id} and ${util.formWherePart('v.id', 'in', prop_out.data.map(v => v.property_id), 0)}`;
					sql_list.push(sql_0);
				}

				sql_0 = `SELECT property_id FROM ${schema}.v_properties_ns v, ${schema}.cp_rels r WHERE property_id = v.id ${filter_string} and r.type_id = 2 and class_id = ${classTo[0].id} 
						and r.object_cnt > 0 order by r.object_cnt desc LIMIT $1`;
				const prop_in = await util.getSchemaData(sql_0, params);                         

				if ( prop_in.data.length > 0) {
					sql_0 = `SELECT 'in' as mark, r.x_max_cardinality as x_max_cardinality, v.*, r.object_cnt as o FROM ${schema}.v_properties_ns v , ${schema}.v_cp_rels_card r
							WHERE property_id = v.id and r.type_id = 2 and class_id = ${classTo[0].id} and  ${util.formWherePart('v.id', 'in', prop_in.data.map(v => v.property_id), 0)}`;
					sql_list.push(sql_0);
				}
					
				sql_0 = `SELECT aa.* FROM ( ${sql_list.join(' UNION ')} ) aa where o > 0 order by  o desc LIMIT $1`;	
				r = await util.getSchemaData(sql_0, params);				
			}
		}
	}

	return r;
//x_max_cardinality
}

module.exports = {
getPropertiesNew,
}