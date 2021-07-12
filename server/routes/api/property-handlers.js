const db = require('./db')
const debug = require('debug')('dss:classops')

const { 
    executeSPARQL,
    sparqlGetClassProperties,
	sparqlGetPropertiesFromIndividuals,
	sparqlGetPropertiesFromClass,
} = require('../../util/sparql/endpoint-queries')

const { 
    parameterExists,
	getFilterColumn,
	formWherePart,
	getClassByName,
	getSchemaData,
} = require('./utilities')


const MAX_ANSWERS = 30;

/* list of properties */
const getProperties = async (schema, params) => {
   // propertyKind
   // filter
   // namespaces
   // className 
   // otherEndClassName
	
   	let r = { data: [], complete: false };
	let sql;
	let viewname = 'v_properties_ns';
	let classFrom = [];
	let classTo = [];
	let whereListA = [ true ];
	let whereListB = [ true ];
	let contextA = '';
	let contextB = '';
	let strAo ='cnt';
	let strBo = 'cnt';
	
	async function addToWhereList(propListAB)  {
		//console.log(`SELECT id FROM ${schema}.properties where ${formWherePart('iri', 'in', propListAB.A, 1)}`)
		const idListA = await db.any(`SELECT id FROM ${schema}.properties where ${formWherePart('iri', 'in', propListAB.A, 1)}`);
		if ( idListA.length > 0) 
			whereListA.push(formWherePart('v.id', 'in', idListA.map(v => v.id), 0));
		//console.log(`SELECT id FROM ${schema}.properties where ${formWherePart('iri', 'in', propListAB.B, 1)}`)	
		const idListB = await db.any(`SELECT id FROM ${schema}.properties where ${formWherePart('iri', 'in', propListAB.B, 1)}`);
		if ( idListB.length > 0) 
			whereListB.push(formWherePart('v.id', 'in', idListB.map(v => v.id), 0));
	}
	function formSql()  {
		const ot = ( contextA == '' ? 'v.' : 'r.')
		const orderByPref = ( parameterExists(params, 'orderByPrefix') ? params.orderByPrefix : '')
		let sql = `SELECT aa.* FROM ( SELECT 'out' as mark, v.*, ${ot}${strAo} as o 				
FROM ${schema}.${viewname} v ${contextA}
WHERE ${whereListA.join(' and ')} 
) aa
order by ${orderByPref} o desc LIMIT $1`;
		if ( params.propertyKind === 'ObjectExt' || params.propertyKind === 'Connect') {
			sql = `SELECT aa.* FROM (
SELECT 'out' as mark, v.*, ${ot}${strAo} as o 
FROM ${schema}.${viewname} v ${contextA}
WHERE ${whereListA.join(' and ')} 
UNION ALL
SELECT 'in' as mark, v.*, ${ot}${strBo} as o   
FROM ${schema}.${viewname} v ${contextB}
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
	
	if ( parameterExists(params, 'propertyKind') ) {
		if ( params.propertyKind === 'Data' ) {
			strAo = 'data_cnt';
			strBo = 'data_cnt';
			whereListA.push('v.data_cnt > 0');
			whereListB.push('v.data_cnt > 0');
		}
		if ( params.propertyKind === 'Object' || params.propertyKind === 'ObjectExt' || params.propertyKind === 'Connect') {
			strAo = 'object_cnt';
			strBo = 'object_cnt';
			whereListA.push('v.object_cnt > 0');
			whereListB.push('v.object_cnt > 0');
		}
	}
	else  params.propertyKind = 'All';
	
	if ( parameterExists(params, 'filter') ) {
		whereListA.push(`v.${getFilterColumn(params)} ~ $2`); 
		whereListB.push(`v.${getFilterColumn(params)} ~ $2`);
	}

	if ( parameterExists(params, 'namespaces') ) {
		if (params.namespaces.in !== undefined ) {
			whereListA.push(formWherePart('v.prefix', 'in', params.namespaces.in, 1));
			whereListB.push(formWherePart('v.prefix', 'in', params.namespaces.in, 1));
		}
		if (params.namespaces.notIn !== undefined ) {
			whereListA.push(formWherePart('v.prefix', 'not in', params.namespaces.notIn, 1));
			whereListB.push(formWherePart('v.prefix', 'not in', params.namespaces.notIn, 1));
		}
	}

	if ( parameterExists(params, 'className'))
		classFrom = await getClassByName(params.className, schema);
	if ( parameterExists(params, 'otherEndClassName'))
		classTo = await getClassByName(params.otherEndClassName, schema);
	
	//console.log(classFrom)
	if ( classType(classFrom) === 's' || classType(classTo)=== 's' || parameterExists(params, 'uriIndividual') || parameterExists(params, 'otherEndUriIndividual')) {
		
		if ( parameterExists(params, 'uriIndividual') || parameterExists(params, 'otherEndUriIndividual')) {
			if ( parameterExists(params, 'uriIndividual') ) {
				const propListAB = await sparqlGetPropertiesFromIndividuals(params, 'From', params.uriIndividual);
				await addToWhereList(propListAB);
			}
			if ( parameterExists(params, 'otherEndUriIndividual') ) {
				const propListAB = await sparqlGetPropertiesFromIndividuals(params, 'To', params.otherEndUriIndividual);
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
	
		sql = formSql();
	}

	r = await getSchemaData(sql, params);
	return r;

}

module.exports = {
getProperties,
}