const debug = require('debug')('dss:classops')
const db = require('./db')

const ns_DBpedia = {schema:'dbpedia', ns:[{name:'dbo', caption:'Only from dbo:', type:'in', checked:true}, {name:'yago', caption:'Exclude yago:', type:'notIn', checked:false}]};
const ns_DBpediaL = {schema:'any', ns:[{name:'dbo', caption:'Only from dbo:', type:'in', checked:false}, {name:'yago', caption:'Exclude yago:', type:'notIn', checked:false}]};
const ns_BasicL = {schema:'any', ns:[{isLocal:true, caption:'Only local classes:', type:'in', checked:true}]};
const ns_Basic = {'schema':'any', 'ns':[]};

// TODO: get this info from the db
// simple_prompt  -- vairs nav
const KNOWN_DATA = [
	{display_name: 'DBpedia', db_schema_name:'dbpedia', sparql_url: 'https://dbpedia.org/sparql', named_graph: '', profile_data:ns_DBpedia, use_pp_rels: true, simple_prompt: false, hide_individuals: false, direct_class_role:'rdf:type', indirect_class_role:'', endpoint_type: 'virtuoso' },
	{display_name: 'Tweets_cov', db_schema_name:'tweets_cov', sparql_url: 'https://data.gesis.org/tweetscov19/sparql', named_graph: '',  profile_data:ns_DBpediaL, use_pp_rels: true, simple_prompt: false, hide_individuals: false, direct_class_role:'rdf:type', indirect_class_role:'', endpoint_type: 'virtuoso' },
	{display_name: 'Europeana', db_schema_name:'europeana', sparql_url: 'http://sparql.europeana.eu/', named_graph: '',  profile_data:ns_Basic, use_pp_rels: false, simple_prompt: false, hide_individuals: false, direct_class_role:'rdf:type', indirect_class_role:'' ,endpoint_type: 'virtuoso' },
	{display_name: 'Covid_On_The_Web', db_schema_name:'covid_on_the_web', sparql_url: 'https://covidontheweb.inria.fr/sparql', named_graph: '',  profile_data:ns_DBpediaL, use_pp_rels: false, simple_prompt: false, hide_individuals: false, direct_class_role:'rdf:type', indirect_class_role:'', endpoint_type: 'virtuoso' },
	{display_name: 'Mini_university', db_schema_name:'mini_university', sparql_url: 'http://85.254.199.72:8890/sparql', named_graph: 'MiniUniv', profile_data:ns_BasicL, use_pp_rels: true, simple_prompt: false, hide_individuals: true, direct_class_role:'rdf:type', indirect_class_role:'', endpoint_type: 'virtuoso' },
	{display_name: 'Mini_hospital', db_schema_name:'mini_hospital', sparql_url: 'http://185.23.162.167:8833/sparql', named_graph: 'MiniBkusEN_1',  profile_data:ns_BasicL, use_pp_rels: true, simple_prompt: false, hide_individuals: true, direct_class_role:'rdf:type', indirect_class_role:'', endpoint_type: 'virtuoso' },
	{display_name: 'Wikidata', db_schema_name:'wikidata', sparql_url: 'https://query.wikidata.org/sparql', named_graph: '', profile_data:ns_BasicL, use_pp_rels: false, simple_prompt: false, hide_individuals: true, direct_class_role:'wdt:P31', indirect_class_role:'wdt:P279', endpoint_type: 'generic' },
]

const get_KNOWN_DATA = async () => {
	// Šis ir vecais variants
	const sql = `SELECT * from public.v_configurations`;
	const r = await db.any(sql);
	return r;
	//const kd = KNOWN_DATA;
	//return kd;
}

const get_KNOWN_DATA2 = async () => {
	const r = await db.any(`SELECT * from public.v_configurations where is_active = true`);
	const tree_profiles = await db.any(`SELECT * from public.tree_profiles`);
	let result = [];
	for ( const db_info of r) {
		let r0 = await db.any(`SELECT COUNT(*) FROM information_schema."tables" where table_schema = '${db_info.db_schema_name}'`);
		if ( r0[0].count > 0) {
			let r2 = await db.any(`SELECT * from ${db_info.db_schema_name}.parameters`);

			if ( r2.filter(function(p){ return p.name == 'show_instance_tab';})[0].jsonvalue == true )
				db_info.hide_instances = false;
			else
				db_info.hide_instances = true;
			let tree_profile_name = r2.filter(function(p){ return p.name == 'tree_profile_name';})[0].textvalue;
			if ( tree_profile_name == null || tree_profile_name == undefined )
				tree_profile_name = 'default';
			db_info.profile_data = tree_profiles.filter(function(t){ return t.profile_name == tree_profile_name;})[0].data;
			db_info.schema_name = r2.filter(function(p){ return p.name == 'schema_kind';})[0].textvalue;
			db_info.direct_class_role = r2.filter(function(p){ return p.name == 'direct_class_role';})[0].textvalue;
			if ( db_info.direct_class_role == undefined )
				db_info.direct_class_role = 'rdf:type';
			db_info.indirect_class_role = r2.filter(function(p){ return p.name == 'indirect_class_role';})[0].textvalue;
			db_info.use_pp_rels = r2.filter(function(p){ return p.name == 'use_pp_rels';})[0].jsonvalue;
			if ( r2.filter(function(p){ return p.name == 'instance_lookup_mode';})[0].textvalue == 'table')
				db_info.has_instance_table = true;
			else
				db_info.has_instance_table = false;

			let rc = await db.any(`SELECT COUNT(*) FROM ${db_info.db_schema_name}.classes`);
			db_info.class_count = rc[0].count;

			result.push(db_info);
		}
	}
	return result;
	//const kd = KNOWN_DATA;
	//return kd;
}

const get_KNOWN_DATA3 = async (tag) => {
	const r = await db.any(`SELECT * from public.v_configurations where is_active = true`);
	let result = [];
	for ( const db_info of r) {
        if (tag && !db_info.tags.includes(tag)) continue;
		let r0 = await db.any(`SELECT COUNT(*) FROM information_schema."tables" where table_schema = '${db_info.db_schema_name}'`);
		if ( r0[0].count > 0) {
			let info = {display_name:db_info.display_name};
			//let rr = await db.any(`SELECT COUNT(*) FROM ${db_info.db_schema_name}.classes`);
			//info.class_count = rr[0].count;
			const sql = `select count(*) count, (select count(*) from ${db_info.db_schema_name}.properties) pp, (select count(*) > 0 from ${db_info.db_schema_name}.cpc_rels) cpc_rels,
(select count(*) from ${db_info.db_schema_name}.cc_rels where type_id = 1 ) cc1, (select count(*) from ${db_info.db_schema_name}.cc_rels where type_id = 2 ) cc2, (select count(*) from ${db_info.db_schema_name}.cc_rels where type_id = 3 ) cc3,
(select count(*) - count(distinct class_1_id) > 0 from ${db_info.db_schema_name}.cc_rels) multi,
(select count(*) from ${db_info.db_schema_name}.cc_rels cr , ${db_info.db_schema_name}.classes c1, ${db_info.db_schema_name}.classes c2 where type_id = 1 and cr.class_1_id = c1.id and cr.class_2_id = c2.id and c1.cnt = c2.cnt) ekv
from ${db_info.db_schema_name}.classes`
			const rr = await db.any(sql);
			info.class_count = rr[0].count;
			info.properties = rr[0].pp;
			info.info = `has_cpc_rels:${rr[0].cpc_rels} cc1:${rr[0].cc1} cc2:${rr[0].cc2} cc3:${rr[0].cc3} multi:${rr[0].multi}, ekv:${rr[0].ekv}`;
			result.push(info);
		}
	}
	result = result.sort(function(a,b){ return b.class_count-a.class_count});
	return result;
}

const get_KNOWN_DATA4 = async () => {
	const r = await db.any(`SELECT * from public.v_configurations where is_active = true`);
	let result = [];
	for ( const db_info of r) {
		let r0 = await db.any(`SELECT COUNT(*) FROM information_schema."tables" where table_schema = '${db_info.db_schema_name}'`);
		if ( r0[0].count > 0) {
			let info = {display_name:db_info.display_name};
			//let rr = await db.any(`SELECT COUNT(*) FROM ${db_info.db_schema_name}.classes`);
			//info.class_count = rr[0].count;
			const sql = `select count(*) count, (select count(*) from ${db_info.db_schema_name}.properties) pp, (select count(*) from ${db_info.db_schema_name}.pp_rels) pp_rels, 
			(select count(*) from ${db_info.db_schema_name}.properties p where (select count(*) from ${db_info.db_schema_name}.cp_rels where property_id = p.id and type_id = 1 ) = 0 ) type_1,
			(select count(*) from ${db_info.db_schema_name}.properties p where (select count(*) from ${db_info.db_schema_name}.cp_rels where property_id = p.id and type_id = 2 ) = 0 ) type_2
from ${db_info.db_schema_name}.classes`
			const rr = await db.any(sql);
			if ( rr[0].pp_rels > 0 && rr[0].type_2 > 0 ) {
				info.class_count = rr[0].count;
				info.properties = rr[0].pp;
				info.pp_type_1 = rr[0].type_1;
				info.pp_type_2 = rr[0].type_2;
				result.push(info);			
			}
		}
	}
	//result = result.sort(function(a,b){ return b.class_count-a.class_count});
	result = result.sort(function(a,b){ return b.pp_type_2-a.pp_type_2});
	return result;
}

const get_KNOWN_DATA_OntTags = async () => {
	const tags = await getAllSchemaTags();
	const schemas = await get_KNOWN_DATA2();
	return { tags:tags, schemas:schemas};
}


const getAllSchemaTags = async () => {
    const r = await db.any(`SELECT * FROM public.schemata_tags where is_active order by display_name`);
    return r;
}

const parameterExists = (parTree, par) => {
	let r = true;
	if ( parTree[par] === undefined || parTree[par] === '' || parTree[par].length == 0 )
		r = false;
	return r;
}

const isValue = val => {
	let r = true
	if ( val === undefined || val === null || val === '' || val.length == 0 )
		r = false;
	return r;
}

const getValue = val => {
	let r
	if ( val === undefined || val === null || val === '' || val.length == 0 )
		r = '';
	else
		r = val;
	return r;
}

const isPListI = params => {
	if (params.element !== undefined && params.element.pListI !== undefined)
		return true;
	else
		return false;
}
const getPListI = params => { return params.element.pListI;}
const getIndividualMode = params => { return getValue(params.main.individualMode);}
const getSchemaName = params => { return getValue(params.main.schemaName);}
const getSchemaType = params => { return getValue(params.main.schemaType);}
const getMakeLog = params => { return getValue(params.main.makeLog);}
const getDeferredProperties = params => { return getValue(params.main.deferred_properties);}
const getIsBasicOrder = params => { return getValue(params.main.basicOrder);}
const getSimplePrompt = params => { return getValue(params.main.simple_prompt);}
const getUsePP = params => { return getValue(params.main.use_pp_rels);}
const isEndpointUrl = params => { return isValue(params.main.endpointUrl);}
const getEndpointUrl = params => { return getValue(params.main.endpointUrl);}
const setEndpointUrl = (params, s) => {
	if ( s.named_graph != undefined && s.named_graph !== null && s.named_graph !== '' )
		params.main.endpointUrl = `${s.sparql_url}?default-graph-uri=${s.named_graph}`;
	else
		params.main.endpointUrl = s.sparql_url;
	return params;
}
const getTypeStrings = (params) => { return [ getValue(params.main.direct_class_role), getValue(params.main.indirect_class_role)];}
const getTypeString = async (schema, params, classIri = null) => {
	// TODO te vajadzēs ņemt no datu bazes, ja būs zināma klase un varbūt arī kāds parametrs, vai vispār meklēt tajā datu bāzē
	if (params.main.has_classification_property && classIri != null) {
		const prop_info = await db.any(`SELECT classification_property from ${schema}.classes where iri = '${classIri}'`);
		return `<${prop_info[0].classification_property}>`;
	}

	const roles = getTypeStrings(params);
	return await getUriProperty(schema, roles[0]);
	//return roles[0];
    //return 'rdf:type';
}
const setTypeStrings = (params, direct_class_role, indirect_class_role) => {
	params.main.direct_class_role = direct_class_role;
	params.main.indirect_class_role = indirect_class_role;
	return params;
}
const isFilter = params => { return isValue(params.main.filter); }
const getFilter = params => { return getValue(params.main.filter); }
const setFilter = (params, filter) => {
	params.main.filter = filter;
	return params;
}
const getFilterColumn = params => {
	r = 'namestring';
	if (isValue(params.main.filterColumn))
		r = getValue(params.main.filterColumn)
	return r;
}
const getLimit = params => { return getValue(params.main.limit); }
const setLimit = (params, limit) => {
	params.main.limit = limit;
	return params;
}
const getName = params => { return getValue(params.main.name); }
const getPropertyName = params => { return getValue(params.main.propertyName); }
const getTreeMode = params => { return getValue(params.main.treeMode); }
const isNamespaces = params => { return isValue(params.main.namespaces);}
const isInNamespaces = params => { return isValue(params.main.namespaces.in);}
const isNotInNamespaces = params => { return isValue(params.main.namespaces.notIn);}
const getInNamespaces = params => { return getValue(params.main.namespaces.in);}
const getNotInNamespaces = params => { return getValue(params.main.namespaces.notIn);}
const isOnlyPropsInSchema = params => { return isValue(params.main.onlyPropsInSchema);}
const isLinksWithTargets = params => { return isValue(params.main.linksWithTargets);}
const isUriIndividual = ( params, poz = 0) => {
	if ( poz === 0 && isValue(params.element) && isValue(params.element.uriIndividual))
		return true;
	if ( poz === 1 && isValue(params.elementOE) && isValue(params.elementOE.uriIndividual))
		return true;
	return false;
}
const correctValue = ns_list => {
	for (var ns of ns_list) {
		ns.value = ns.value.replace(' ','');
	}
	return ns_list;
}
const getIndividualsNS =  async schema => {
	//const sql = `SELECT CONCAT(name,':') as prefix, value from ${schema}.ns WHERE name in ('dbc','dbr','rdf','xsd','owl', 'en_wiki') order by value desc`; // TODO
	//const sql = `SELECT CONCAT(name,':') as prefix, value from ${schema}.ns WHERE name != '' and value != '' order by value desc`;
    const sql = `SELECT CONCAT(name,':') as prefix, value from ${schema}.ns WHERE value != '' order by value desc`;
	let r = await db.any(sql);
	r = correctValue(r);
	return r;
}
const getOnlyIndividualsNS =  async schema => {
	// TODO Sis vēlāk nebūs vajadzīgs
	const sql = `SELECT CONCAT(name,':') as prefix, value from ${schema}.ns WHERE name in ('dbc','dbr') order by value desc`; // TODO šis ir pagaidām
	let r = await db.any(sql);
	r = correctValue(r);
	return r;
}
const getUriIndividual = async ( schema, params, poz = 0) => {
	let r;
	if ( poz === 0 && isValue(params.element) )
		r = getValue(params.element.uriIndividual);
	if ( poz === 1 && isValue(params.elementOE) )
		r = getValue(params.elementOE.uriIndividual);
	if ( poz === 2 )
		r = getValue(params.element.pListI.uriIndividual);

	const list = await getIndividualsNS(schema);
	list.forEach(e => { if ( r.indexOf(e.prefix) == 0)  r = r.replace(e.prefix, e.value) });
	//r = r.replace('dbr:','http://dbpedia.org/resource/');
	//r = r.replace('dbc:','http://dbpedia.org/resource/Category:');
	//r = r.replace('rdf:','http://www.w3.org/1999/02/22-rdf-syntax-ns#');
	//r = r.replace('xsd:','http://www.w3.org/2001/XMLSchema#');
	//r = r.replace('owl:','http://www.w3.org/2002/07/owl#');
	//r = r.replace('en_wiki:','http://en.wikipedia.org/wiki/');

	if (r.substring(0,7) === 'http://' || r.substring(0,8) === 'https://')
		r = `<${r}>`;
	return r;
}
const getUriProperty = async ( schema, property) => {

	if (property.substring(0,1) === '<' )
		return property;

	const list = await getIndividualsNS(schema);
	list.forEach(e => { if ( property.indexOf(e.prefix) == 0)  property = property.replace(e.prefix, e.value) });

	if (property.substring(0,7) === 'http://' || property.substring(0,8) === 'https://')
		property = `<${property}>`;
	return property;
}
const clearUriIndividual = ( params, poz = 0) => {
	if ( poz === 0 )
		params.element.uriIndividual = '';
	if ( poz === 1 )
		params.elementOE.uriIndividual = '';
	return params;
}
const getClassId = (params) => {
	return getValue(params.main.classId);
}
const isClassName = ( params, poz = 0) => {
	if ( poz === 0 && isValue(params.element) && isValue(params.element.className))
		return true;
	if ( poz === 1 && isValue(params.elementOE) && isValue(params.elementOE.className))
		return true;
	return false;
}
const getClassName = ( params, poz = 0) => {
	if ( poz === 0 && isValue(params.element) )
		return getValue(params.element.className);
	if ( poz === 1 && isValue(params.elementOE) )
		return getValue(params.elementOE.className);
	return '';
}
const isPList = ( params, poz = 0) => {
	if ( poz === 0 && isValue(params.element) && isValue(params.element.pList))
		return true;
	if ( poz === 1 && isValue(params.elementOE) && isValue(params.elementOE.pList))
		return true;
	return false;
}
const getPList = ( params, poz = 0) => {
	if ( poz === 0 && isValue(params.element) )
		return getValue(params.element.pList);
	if ( poz === 1 && isValue(params.elementOE))
		return getValue(params.elementOE.pList);
	return false;
}
const isPropertyKind = params => { return isValue(params.main.propertyKind); }
const getPropertyKind = params => { return getValue(params.main.propertyKind); }
const setPropertyKind = ( params, val) => {
	params.main.propertyKind = val;
	return params;
}
const isOrderByPrefix = params => { return isValue(params.main.orderByPrefix);}
const getOrderByPrefix = params => { return getValue(params.main.orderByPrefix);}

const checkEndpoint = async (params, schema, KNOWN_DATA) => {
    const s = KNOWN_DATA.find(x => x.display_name == getSchemaName(params));
	if ( !isEndpointUrl(params)) {
		if (s !== undefined)
			params = setEndpointUrl(params, s);
	}
	if (s !== undefined && s.direct_class_role !== undefined)
		params = setTypeStrings(params, s.direct_class_role, s.indirect_class_role);
	else
		params = setTypeStrings(params, 'rdf:type', '');

	//let col_info = await db.any(`SELECT count(*) FROM information_schema."columns"  where table_schema = '${schema}' and table_name = 'classes' and column_name = 'classification_property'`);
	//if ( col_info[0].count > 0)
	let col_info = await columnChecking(schema, 'classes', 'classification_property');
	if ( col_info)
		params.main.has_classification_property = true;
	//col_info = await db.any(`SELECT count(*) FROM information_schema."columns"  where table_schema = '${schema}' and table_name = 'classes' and column_name = 'classification_adornment'`);
	//if ( col_info[0].count > 0)
	col_info = await columnChecking(schema, 'classes', 'classification_adornment');
	if ( col_info)
		params.main.has_classification_adornment = true;

	return params;
}

const getLocalNamespace = async schema => {

	let r = await db.any(`SELECT * FROM ${schema}.ns WHERE is_local = true limit 1`);
	if ( r.length > 0)
		return r[0];

	r = await db.any(`SELECT * FROM ${schema}.ns order by priority desc limit 1`);
	if ( r[0].priorty > 0 )
		return r[0];

	r = await db.any(`SELECT *,( SELECT count(*) FROM ${schema}.classes where ns_id = ns.id ) ccnt FROM ${schema}.ns order by ccnt desc limit 1`);
	return r[0];

}

const getFullName = (cl, params) => {
	let fullName = '';
	let prefix;
	let ad = '';
	if (( params.main.showPrefixes === "false" && cl.is_local) || cl.prefix == null ) {
		prefix = '';
	}
	else {
		prefix = `${cl.prefix}:`;
	}
	if ( params.main.has_classification_adornment && cl.classification_adornment != null) {
		ad = `(${cl.classification_adornment}) `;
	}

	fullName = `${ad}${prefix}${cl.display_name}`;
	return fullName;
}

const getFullNameP = (prop, params) => {
	let fullName = '';
	let prefix;
	if (( params.main.showPrefixes === "false" && prop.is_local) ) {
		prefix = '';
	}
	else {
		prefix = `${prop.prefix}:`;
	}

	//if (prop.display_name.indexOf(':') != -1 )
	//	prop.display_name = `[${prop.display_name}]`;

	fullName = `${prefix}${prop.display_name}`;
	return fullName;
}

const parseName = (name, localNS) => {
	let rez = { hasPrefix:false, name:name, fullName:name };
	// Ja jau ir prefikss, tad abi vārdi būs vienādi
	if ( name.includes(':')){
		if ( name.includes('[')) {
			if ( name.indexOf(':') < name.indexOf('[')) {
				rez.hasPrefix = true;
			}
			else {
				rez.fullName = `${localNS.name}:${name}`;
			}
		}
		else {
			rez.hasPrefix = true;
		}
	}
	else {
		rez.fullName = `${localNS.name}:${name}`;
	}
	return rez;
}

const getClassByName = async (cName, schema, params) => {
	let r;
	const localNS = await getLocalNamespace(schema);
	//cName = cName.replace(' ','');
	if ( cName.includes('://')){
		r = await db.any(`SELECT * FROM ${schema}.v_classes_ns WHERE iri = $1 order by cnt desc limit 1`, [cName]);
	}
	else {
		if ( params.main.has_classification_property && cName.substring(0,1) == '(') {
			cName = cName.replace(' ','');
			const ad = cName.substring(1,cName.indexOf(')'));
			const restName = cName.substring(cName.indexOf(')')+1, cName.length);
			const parsedName = parseName(restName, localNS);
			r = await db.any(`SELECT * FROM ${schema}.v_classes_ns WHERE ( CONCAT(prefix, ':', display_name) = $2 or CONCAT(prefix, ':', local_name) = $2) and classification_adornment = $1 order by cnt desc limit 1`, [ad, parsedName.fullName]);
			if ( r.length === 0 && !parsedName.hasPrefix )
				r = await db.any(`SELECT * FROM ${schema}.v_classes_ns WHERE ( display_name = $2 or  local_name = $2) and classification_adornment = $1 order by cnt desc limit 1`, [ad, parsedName.name]);

		}
		else {
			parsedName = parseName(cName, localNS);
			r = await db.any(`SELECT * FROM ${schema}.v_classes_ns WHERE ( CONCAT(prefix, ':', display_name) = $1 or CONCAT(prefix, ':', local_name) = $1) order by cnt desc limit 1`, [parsedName.fullName]);
			if ( r.length === 0 && !parsedName.hasPrefix )
				r = await db.any(`SELECT * FROM ${schema}.v_classes_ns WHERE ( display_name = $1 or  local_name = $1) order by cnt desc limit 1`, [ parsedName.name]);

		}
	}

	if ( r.length === 1 ) {
		let cp = await getTypeString(schema, params, r[0].iri); // TODO Varbūt skaistāk būtu dot pilno iri, lai ir visur vienādi. Drusku sanāk dubultas darbības
		cp = cp.substring(1, cp.length-1);
		r[0].classification_property = cp;
		r[0].full_name = getFullName(r[0], params);
	}

	return r;
}

const getPropertyByName = async (pName, schema, params) => {
	let r;
	let localNS = await getLocalNamespace(schema);
	if ( getSchemaType(params) == 'wikidata' )
		localNS.name = 'wdt';

	if ( pName.includes('://')){
		r = await db.any(`SELECT id FROM ${schema}.v_properties_ns WHERE iri = $1 order by cnt desc limit 1`, [pName]);
	}
	else {
		const parsedName = parseName(pName, localNS);
		r = await db.any(`SELECT id FROM ${schema}.v_properties_ns where CONCAT(prefix, ':', display_name) = $1 or CONCAT(prefix, ':', local_name) = $1 order by cnt desc limit 1`, [parsedName.fullName]);
		if ( r.length === 0 && !parsedName.hasPrefix )
			r = await db.any(`SELECT id FROM ${schema}.v_properties_ns v  WHERE ( v.display_name = $1 or v.local_name = $1) order by v.cnt desc limit 1`, [pName]);
	}

	let data_types = [null];
	let data_type;
	if ( r.length > 0 ) {
		const prop_id = r[0].id;
		const col = 'v.*, dc.prefix as dc_prefix, dc.display_name as dc_display_name, dc.is_local as dc_is_local, rc.prefix as rc_prefix, rc.display_name as rc_display_name, rc.is_local as rc_is_local';
		const join = `LEFT JOIN ${schema}.v_classes_ns dc ON v.domain_class_id = dc.id LEFT JOIN ${schema}.v_classes_ns rc ON v.range_class_id = rc.id`;
		r = await db.any(`SELECT ${col} FROM ${schema}.v_properties_ns v ${join} WHERE v.id = ${prop_id}`);
		const dt = await db.any(`SELECT CONCAT(ns.name,':', dt.local_name) as type_name, cnt, (select sum(cnt) from ${schema}.pd_rels where property_id = ${prop_id}) as total_cnt from ${schema}.pd_rels pd, ${schema}.datatypes dt, ${schema}.ns ns where pd.property_id = ${prop_id} and dt.id = pd.datatype_id and ns.id = dt.ns_id order by type_name`);
		if (  dt.length > 0 ) {
			data_types = dt.map(v => v.type_name);
			if ( dt[0].total_cnt == r[0].data_cnt) {
				if (dt.length === 1 )
					data_type = dt[0].type_name;
				if (dt.length === 2 && dt[0].type_name === 'xsd:decimal' && dt[1].type_name === 'xsd:integer')
					data_type = 'xsd:decimal';
				if (dt.length === 2 && dt[0].type_name === 'rdf:langString' && dt[1].type_name === 'xsd:string')
					data_type = 'xsd:string';
				if (dt.length === 2 && dt[0].type_name === 'xsd:date' && dt[1].type_name === 'xsd:dateTime')
					data_type = 'xsd:date';
			}
			else
				data_types.push(null);
		}
		r[0].data_type = data_type;
		r[0].data_types = data_types;
		r[0].full_name = getFullNameP(r[0], params);

	}

	return r;
}

const getClassPropertyDataTypes = async (propId, classId, schema, params) => {
  let data_types = [];
  const cp_info = await db.any(`SELECT id, data_cnt_calc FROM ${schema}.cp_rels WHERE property_id = ${propId} and class_id = ${classId} and type_id = 2`);
  if ( cp_info.length == 1 ) {
    const dt = await db.any(`SELECT CONCAT(ns.name,':', dt.local_name) as type_name, cnt, (select sum(cnt) from ${schema}.cpd_rels where cp_rel_id = ${cp_info[0].id}) as total_cnt from ${schema}.cpd_rels cpd, ${schema}.datatypes dt, ${schema}.ns ns where cpd.cp_rel_id = ${cp_info[0].id} and dt.id = cpd.datatype_id and ns.id = dt.ns_id order by type_name`);
    if (  dt.length > 0 ) {
			data_types = dt.map(v => v.type_name);
			if ( dt[0].total_cnt != cp_info[0].data_cnt_calc) {
        data_types.push(null);
			}
		}
  }
  return data_types;
}

const getPropertyDataTypes = async (propId, dataCnt, schema, params) => {
  let data_types = [];
  const dt = await db.any(`SELECT CONCAT(ns.name,':', dt.local_name) as type_name, cnt, (select sum(cnt) from ${schema}.pd_rels where property_id = ${propId}) as total_cnt from ${schema}.pd_rels pd, ${schema}.datatypes dt, ${schema}.ns ns where pd.property_id = ${propId} and dt.id = pd.datatype_id and ns.id = dt.ns_id order by type_name`);
  if (  dt.length > 0 ) {
    data_types = dt.map(v => v.type_name);
    if ( dt[0].total_cnt != dataCnt) {
      data_types.push(null);
    }
  }
  return data_types;
}

const getSchemaObject = obj => {
	let r;

	if ( obj.length === 0 )
		r = {data: [], complete: false };
	else
		r = {data: obj, complete:true}

	return r;
}

const getSchemaData = async (sql, params, print = true) => {
	if ( sql === '')
		return {data: []};
	let complete = true;
	let r;
	if (print) {
		console.log('--------executeSQL-----------------');
		console.log(sql);
	}
	if ( isFilter(params))
		r = await db.any(sql, [getLimit(params)+1, getFilter(params)]);
	else
		r = await db.any(sql,[getLimit(params)+1]);
	if ( r.length == getLimit(params)+1 && getLimit(params) != '' ){
		complete = false;
		r.pop();
	}
	if (print)
		console.log(r.length)
	let rr = {data: r, complete: complete, params: params};
	if ( getMakeLog(params))
		rr.sql = sql.replace(/(\r\n|\n|\r|\t)/gm,' ');

	return rr;
}

const getSchemaDataPlus = async (sql, sql2, params) => {
	let complete = true;
	let r;
	let r2;
	console.log('--------executeSQL-----------------');
	console.log(sql);
	if ( isFilter(params))
		r = await db.any(sql, [getLimit(params)+1, getFilter(params)]);
	else
		r = await db.any(sql,[getLimit(params)+1]);

	console.log(r.length)
	if ( r.length == getLimit(params)+1 ){
		complete = false;
		r.pop();
	}
	else {
		if ( !isOnlyPropsInSchema(params)) {  // TODO - check this
			console.log('--------executeSQL Plus-----------------');
			console.log(sql2);
			if ( isFilter(params))
				r2 = await db.any(sql2, [getLimit(params)-r.length+1, getFilter(params)]);
			else
				r2 = await db.any(sql2,[getLimit(params)-r.length+1]);

			if ( r2.length == getLimit(params)-r.length+1 ){
				complete = false;
				r2.pop();
			}
			r2.forEach(element => r.push(element));
			console.log(r2.length)
		}
	}
	let rr = {data: r, complete: complete, params: params};
	if ( getMakeLog(params)) {
		rr.sql = sql.replace(/(\r\n|\n|\r|\t)/gm,' ');
		rr.sql2 = sql2.replace(/(\r\n|\n|\r|\t)/gm,' ');
	}

	return rr;
}

const formWherePart = (col, inT, list, listType) => {
	//console.log('------------------------------------------------------')
	let sep = "";
	if ( listType === 1) {
		list = list.map( x => x.toString().replace("'","''"));
		sep = "'";
	}

	//console.log(listN.join(`${sep},${sep}`))
	return  ` ${col} ${inT} (${sep}${list.join(`${sep},${sep}`)}${sep})`;
}

const getIdsfromPList = async (schema, pList, params) => {
	let r = {in:[], out:[]};
	if ( parameterExists(pList, "in") ) {
		for (const element of pList.in) {
			const pr = await getPropertyByName(element.name, schema, params)
			if ( pr.length > 0 && pr[0].object_cnt > 0)
				r.in.push(pr[0].id);
		}
	}

	if ( parameterExists(pList, "out") ) {
		for (const element of pList.out) {
			const pr = await getPropertyByName(element.name, schema, params)
			if ( pr.length > 0)
				r.out.push(pr[0].id);
		}
	}

	return await r;
}

const addIdsToPList = async (schema, pList, params) => {
	let pListOut = [];
	if ( parameterExists(pList, "in") ) {
		for (const element of pList.in) {
			const pr = await getPropertyByName(element.name, schema, params)
			if ( pr.length > 0 && pr[0].object_cnt > 0) {
				element.id = pr[0].id;
				pListOut.push(element);
			}

		}
	}

	if ( parameterExists(pList, "out") ) {
		for (const element of pList.out) {
			const pr = await getPropertyByName(element.name, schema, params)
			if ( pr.length > 0) {
				element.id = pr[0].id;
				pListOut.push(element);
			}
		}
	}

	return await pListOut;
}

const getUrifromPList = async (schema, pList, params) => {
	let r = {in:[], out:[]}
	if ( parameterExists(pList, "in") ) {
		for (const element of pList.in) {
			const pr = await getPropertyByName(element.name, schema, params)
			if ( pr.length > 0 && pr[0].object_cnt > 0)
				r.in.push(pr[0].iri);
		}
	}

	if ( parameterExists(pList, "out") ) {
		for (const element of pList.out) {
			const pr = await getPropertyByName(element.name, schema, params)
			if ( pr.length > 0)
				r.out.push(pr[0].iri);
		}
	}

	return await r;
}

const getNsWhere = params => {
	let whereList = [];
	if (isInNamespaces(params))
		whereList.push(formWherePart('v.prefix', 'in', getInNamespaces(params), 1));
	if (isNotInNamespaces(params))
		whereList.push(formWherePart('v.prefix', 'not in', getNotInNamespaces(params), 1));
	return whereList.join(' and ');
}

const checkIndividualsParams = async (schema, params) => {
	let find = false;
	const cnt_limit = 300000;

	if ( isClassName(params,0)) {
		const classObj = await getClassByName( getClassName(params,0), schema, params);
		if (classObj[0].cnt < cnt_limit)
			find = true;
	}

	if ( isPList(params,0)) {
		const pList = getPList(params,0);
		let prop;
		if ( pList.in.length === 1 && pList.out.length === 0)
			prop = pList.in[0];
		if ( pList.in.length === 0 && pList.out.length === 1)
			prop = pList.out[0];

		if ( prop !== undefined && prop !== null) {
			const propObj = await getPropertyByName(prop.name, schema, params);
			if (propObj[0].cnt < cnt_limit)
			find = true;
		}
		if ( pList.in.length + pList.out.length > 1 )
			find = true;
	}

	return find;
}

const columnChecking = async (schema, table, column) => {
	let col_info = await db.any(`SELECT count(*) FROM information_schema."columns"  where table_schema = '${schema}' and table_name = '${table}' and column_name = '${column}'`);
	if ( col_info[0].count > 0)
		return true;
	else
		return false;
}

module.exports = {
	parameterExists,
	getFilterColumn,
	checkEndpoint,
	formWherePart,
	getClassByName,
	getPropertyByName,
  getClassPropertyDataTypes,
  getPropertyDataTypes,
	getSchemaData,
	getSchemaDataPlus,
	getSchemaObject,
	getIdsfromPList,
	addIdsToPList,
	getUrifromPList,
	isFilter,
	getFilter,
	setFilter,
	getLimit,
	setLimit,
	getName,
	getPropertyName,
	isNamespaces,
	isInNamespaces,
	getEndpointUrl,
	isUriIndividual,
	getUriIndividual,
	clearUriIndividual,
	getClassId,
	isClassName,
	getClassName,
	getNsWhere,
	getTreeMode,
	isPropertyKind,
	getPropertyKind,
	setPropertyKind,
	isOrderByPrefix,
	getOrderByPrefix,
	isLinksWithTargets,
	isPList,
	getPList,
	checkIndividualsParams,
	getIndividualsNS,
	getOnlyIndividualsNS,
	get_KNOWN_DATA,
	get_KNOWN_DATA2,
	get_KNOWN_DATA3,
	get_KNOWN_DATA4,
	get_KNOWN_DATA_OntTags,
	getTypeStrings,
	getTypeString,
	getUsePP,
	getSimplePrompt,
	getIsBasicOrder,
	getDeferredProperties,
	getMakeLog,
	getIndividualMode,
	isPListI,
	getPListI,
	getSchemaType,
	correctValue,
	getFullName,
	getFullNameP,
    getAllSchemaTags,
	columnChecking,
}
