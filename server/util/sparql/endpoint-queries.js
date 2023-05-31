const util = require('../../routes/api/utilities')
const SparqlClient = require('sparql-http-client/ParsingClient')
const db = require('../../routes/api/db')

// const client = new SparqlClient({ endpointUrl: ENDPOINT_URL })

// collection in sparql clients for different endpoints
const clientMap = new Map();

let queryTime = {};
const delay = ms => new Promise(res => setTimeout(res, ms));

const findClient = endpointUrl => {
	if ( queryTime[endpointUrl] != undefined ) {
		if ( Date.now() - queryTime[endpointUrl] < 100 ) {
			delay(100);
		}
	}
	queryTime[endpointUrl] = Date.now();
    let client = clientMap.get(endpointUrl);
    if (client) return client;

    client = new SparqlClient({ endpointUrl });
    clientMap.set(endpointUrl, client);

    return client;
}

const getIndividualPattern =  async (schema, params, classIri = null) => {
	// TODO Šie būs datubāzē, varētu būt ari klasei specifisks
	let prop;
	let individualPattern = {};  // Ir tādi vienkāršie, kuriem nav nekā.
	if (util.getSchemaType(params) == 'wikidata')  
		individualPattern = {label: {property:'rdfs:label', lang:'en'}, description:{property:'schema:description', lang:'en'}};
	if (util.getSchemaType(params) == 'nobel_prizes')  
		individualPattern = {label: {property:'rdfs:label'}}; 
	if (util.getSchemaType(params) == 'warsampo') 	
		individualPattern = {label: {property:'skos:prefLabel'}};
	if (util.getSchemaType(params) == 'dbpedia') 	
		individualPattern = {ns: ['dbc','dbr']};	
		
	if (individualPattern.label !== undefined && individualPattern.label !== null) {
		prop = await util.getPropertyByName(individualPattern.label.property, schema, params);
		individualPattern.label.property = `<${prop[0].iri}>`;
	}
	if (individualPattern.description !== undefined && individualPattern.description !== null) {
		prop = await util.getPropertyByName(individualPattern.description.property, schema, params);
		individualPattern.description.property = `<${prop[0].iri}>`;
	}
	return individualPattern;
}

// Šo jāsauc tikai ar filtru
const getDirectSparql = async (schema, filter, whereList0, params, individualPattern, showDescr = false) => {
	let select = '';
	let sparql = '';
	let whereList = [];
	
	if (individualPattern.label !== undefined && individualPattern.label !== null && individualPattern.label.lang !== undefined && individualPattern.label.lang !== null ) {
		select = '?x ?label_1 ';
		whereList.push(` ?x ${individualPattern.label.property} '${filter}'@${individualPattern.label.lang}`);
		whereList.push(` ?x ${individualPattern.label.property} ?label_1. FILTER(LANG(?label_1) = '${individualPattern.label.lang}' )`);
		if ( showDescr && individualPattern.description !== undefined && individualPattern.description !== null ) {
			select = '?x ?label_1 ?description_1 ';
			if ( individualPattern.description.lang !== undefined &&  individualPattern.description.lang !== null )
				whereList.push(`OPTIONAL{?x ${individualPattern.description.property} ?description_1. FILTER(LANG(?description_1) = '${individualPattern.description.lang}')} `);
			else
				whereList.push(`OPTIONAL{?x ${individualPattern.description.property} ?description_1} `);
		}
	}
	else if (individualPattern.ns !== undefined && individualPattern.ns !== null) {
		select = '?x ';
		const ns = individualPattern.ns.join(`' , '`);
		const sql = `SELECT CONCAT(name,':') as prefix, value from ${schema}.ns WHERE name in ('${ns}')`;
		const list_ind = await db.any(sql);
		let ii = [];
		list_ind.forEach(e => { ii.push(`?x =<${e.value}${filter}>`); });
		whereList.push(`FILTER ( ${ii.join(' or ')})`);
	}
	
	if ( select !== '') {
		if ( whereList0.length > 0 )
			sparql = `select distinct ${select}where { ${whereList0.join('. ')}.  ${whereList.join('. ')}} LIMIT ${util.getLimit(params)}`;
		else
			sparql = `select distinct ${select}where { ${whereList.join('. ')} } LIMIT ${util.getLimit(params)}`;
	}
	
	return sparql;
}

const getSparql = async (schema, filter, whereList0, params, individualPattern, showDescr = false) => {
	let select = '?x ';
	let whereList = [];
	let rez = {select:'?x ', where:''};
	if (filter !== '') {
		if ( individualPattern.label !== undefined && individualPattern.label !== null ) {
			if ( individualPattern.label.lang !== undefined && individualPattern.label.lang !== null ) 
				whereList.push(`?x ${individualPattern.label.property} ?label_1. FILTER(LANG(?label_1) = '${individualPattern.label.lang}' && REGEX(?label_1,'${filter}','i'))`);
			else 
				whereList.push(`?x ${individualPattern.label.property} ?label_1. FILTER( REGEX(?label_1,'${filter}','i'))`);
		}
		else {
			whereList.push(`FILTER( REGEX(?x,'${filter}','i'))`);
		}
	}
	else {
		if ( individualPattern.label !== undefined && individualPattern.label !== null ) {
			if ( individualPattern.label.lang !== undefined && individualPattern.label.lang !== null )
				whereList.push(`OPTIONAL{?x ${individualPattern.label.property} ?label_1. FILTER(LANG(?label_1) = '${individualPattern.label.lang}')} `);
			else
				whereList.push(`OPTIONAL{?x ${individualPattern.label.property} ?label_1}`);
		}
	}
	
	if ( individualPattern.label !== undefined && individualPattern.label !== null ) {
		select = '?x ?label_1 ';
		if ( showDescr && individualPattern.description !== undefined && individualPattern.description !== null ) {
			select = '?x ?label_1  ?description_1 ';
			if ( individualPattern.description.lang !== undefined &&  individualPattern.description.lang !== null )
				whereList.push(`OPTIONAL{?x ${individualPattern.description.property} ?description_1. FILTER(LANG(?description_1) = '${individualPattern.description.lang}')}`);
			else
				whereList.push(`OPTIONAL{?x ${individualPattern.description.property} ?description_1}`);
		}
	}
	
	if ( whereList0.length > 0 && whereList.length > 0)
		return `select distinct ${select}where { ${whereList0.join('. ')}. ${whereList.join('. ')} } LIMIT ${util.getLimit(params)}`;
	else if ( whereList.length > 0 ) 
		return `select distinct ${select}where { ${whereList.join('. ')} } LIMIT ${util.getLimit(params)}`;
	else if ( whereList0.length > 0 ) 
		return `select distinct ${select}where { ${whereList0.join('. ')} } LIMIT ${util.getLimit(params)}`;	
}

const sparqlGetClassLabels = async (schema, params, uriClass, uriProp) => {
	// Domāts pusmanuālai lietošanai
	const endpointUrl = util.getEndpointUrl(params); 
	const sparql = `select ?l where {<${uriClass}> <${uriProp}> ?l}`;
	const reply = await executeSPARQL(endpointUrl, sparql);
	const reply_en = reply.filter(item => { return item.l.language == 'en'});
	if ( reply_en.length > 0 )
		return reply_en[0].l.value;
	else if (reply.length > 0) 
		return reply[0].l.value;
	else
		return '';
}

const sparqlGetIndividualClasses = async (schema, params, uriIndividual) => {
	const endpointUrl = util.getEndpointUrl(params); 
	const typeString = await util.getTypeString(schema, params);  // TODO te būs jādomā, ko darīt, ja būs vairāki typeString
	const sparql = `select distinct ?c where {${uriIndividual} ${typeString} ?c} order by ?c`;
	
	const reply = await executeSPARQL(endpointUrl, sparql);
    return reply.map(v => v.c.value);
}

const getClassSparqlPart = async (schema, params, classIri, hasEnd = false) => {
	const typeString = await util.getTypeString(schema, params, classIri); // TODO
	if (hasEnd)
		return `?x ${typeString} <${classIri}>.`;
	else
		return `?x ${typeString} <${classIri}>`;
}

const sparqlGetPropertiesFromRemoteIndividual = async (params, schema, only_out) => {
	let r = {};
	let sparql;
	let reply;
	const endpointUrl = util.getEndpointUrl(params); 
	const pListI = util.getPListI(params);
	const prop = await util.getPropertyByName(pListI.name, schema, params);
	const ind = await util.getUriIndividual(schema, params, 2);
	//const typeString = await util.getTypeString(schema, params);
	const classFrom = await util.getClassByName(util.getClassName(params, 0), schema);
	let classInfo = '';
	if ( classFrom.length > 0 )
		classInfo = await getClassSparqlPart(schema, params, classFrom[0].iri, true); //`?x1 ${typeString} <${classFrom[0].iri}>.`;
	
	if ( prop.length > 0) {
		const prop_iri = prop[0].iri;
		if ( pListI.type === 'in') {
			sparql = `select distinct ?p where {${classInfo} ${ind} <${prop_iri}> ?x. ?x ?p [].} order by ?p`;
			reply = await executeSPARQL(endpointUrl, sparql);
			r.A = reply.map(v => v.p.value);
			if (!only_out) {
				sparql = `select distinct ?p where {${classInfo} ${ind} <${prop_iri}> ?x. [] ?p ?x.} order by ?p`;
				reply = await executeSPARQL(endpointUrl, sparql);
				r.B = reply.map(v => v.p.value);
			}
			else
				r.B = [];
		}
		else {
			sparql = `select distinct ?p where {${classInfo} ?x <${prop_iri}> ${ind}. ?x ?p [].} order by ?p`;
			reply = await executeSPARQL(endpointUrl, sparql);
			r.A = reply.map(v => v.p.value);
			if (!only_out) {
				sparql = `select distinct ?p where {${classInfo} ?x <${prop_iri}> ${ind}. [] ?p ?x.} order by ?p`;
				reply = await executeSPARQL(endpointUrl, sparql);
				r.B = reply.map(v => v.p.value);
			}
			else
				r.B = [];
		}
	}		
	return r;
}

const sparqlGetPropertiesFromIndividuals = async (params, pos, only_out, uriIndividual, uriIndividualTo = '') => {
	let r = {};
	let sparql;
	let reply;
	const endpointUrl = util.getEndpointUrl(params); 

	if ( pos === 'All') {
		sparql = `select distinct ?p where {${uriIndividual} ?p ${uriIndividualTo} .} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.A = reply.map(v => v.p.value);
		if (!only_out) {
			sparql = `select distinct ?p where {${uriIndividualTo} ?p ${uriIndividual} .} order by ?p`;
			reply = await executeSPARQL(endpointUrl, sparql);
			r.B = reply.map(v => v.p.value);
		}
		else
			r.B = [];
	}	
	if ( pos === 'To') {
		sparql = `select distinct ?p where {[] ?p ${uriIndividual} .} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.A = reply.map(v => v.p.value);
		if (!only_out) {
			sparql = `select distinct ?p where {${uriIndividual} ?p [] .} order by ?p`;
			reply = await executeSPARQL(endpointUrl, sparql);
			r.B = reply.map(v => v.p.value);
		}
		else
			r.B = [];
	}
	if ( pos === 'From') {
		sparql = `select distinct ?p where {${uriIndividual} ?p [] .} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.A = reply.map(v => v.p.value);
		if (!only_out && r.A.length < 500 ) {  // TODO Padomāt par šo, vajadzēs vispār savādāk
			sparql = `select distinct ?p where {[] ?p ${uriIndividual} .} order by ?p`;
			reply = await executeSPARQL(endpointUrl, sparql);
			r.B = reply.map(v => v.p.value);
		}
		else
			r.B = [];
	}
	return r;
}

const sparqlGetPropertiesFromClass = async (schema, params, pos, uriClass, only_out) => {
	let r = {};
	let sparql;
	let reply;
	const endpointUrl = util.getEndpointUrl(params);
	//const typeString = await util.getTypeString(schema, params); 
	const classInfo = await getClassSparqlPart(schema, params, uriClass, true); 
	
	if ( pos === 'To') {
		sparql = `select distinct ?p where {${classInfo} [] ?p ?x.} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.A = reply.map(v => v.p.value);
		if (!only_out) {
			sparql = `select distinct ?p where {${classInfo} ?x ?p [].} order by ?p`;
			reply = await executeSPARQL(endpointUrl, sparql);
			r.B = reply.map(v => v.p.value);
		}
		else
			r.B = [];
	}
	else {
		sparql = `select distinct ?p where {${classInfo} ?x ?p [].} order by ?p`;
		reply = await executeSPARQL(endpointUrl, sparql);
		r.A = reply.map(v => v.p.value);
		if (!only_out) {
			sparql = `select distinct ?p where {${classInfo} [] ?p ?x.} order by ?p`; //`select distinct ?p where {?x1 ${typeString} <${uriClass}>. [] ?p ?x1.} order by ?p`;
			reply = await executeSPARQL(endpointUrl, sparql);
			r.B = reply.map(v => v.p.value);
		}
		else
			r.B = [];
	}
	return r;
}


const executeSPARQL = async (endpointUrl, querySparql) => {
    let client = findClient(endpointUrl);
	console.log('--------executeSPARQL-----------------')
	console.log(querySparql)
    if (querySparql.toLowerCase().startsWith('ask')) {
        const reply = await client.query.ask(querySparql);
        console.log(reply)
        return reply;
    } else {
        const reply = await client.query.select(querySparql);
        console.log(reply.length)
        return reply;
    }
}

const validateFilter = name => /^[a-žA-Ž0-9_()'-]+$/.test(name)

const getName = (list, v) => {
	let name = v.x.value;
	list.forEach(e => { if ( name.indexOf(e.value) == 0) name = name.replace(e.value,e.prefix) }); 

	//if (name == v.x.value) {
	//	console.log("###########################")
	//	console.log(name)
	// }
	if (v.label_1 !== undefined && name != v.x.value) { 
		const nn = name.replace(':',`:[${v.label_1.value} (`);
		name = `${nn})]`;
	}
	else if ( name.indexOf('/') !== -1 && name != v.x.value ) {
		const nn = name.replace(':',`:[`);
		name = `${nn}]`;
	}

	return name;
}

const getResults = async (schema, endpointUrl, sparql, sparql0 = '') => {
	const list = await util.getIndividualsNS(schema);
	let reply;
	let rrT = {}; // Pagaidu dati, dublikātu izķeršanai
	let rr = [];
	
	if ( sparql0 !== '' ) {
		reply = await executeSPARQL(endpointUrl, sparql0);
		reply.forEach(v => { rrT[getName(list, v)] = v; });	
						
		reply = await executeSPARQL(endpointUrl, sparql);
		reply.forEach(v => { rrT[getName(list, v)] = v; });	
		for (var key in rrT) {
			let t = {uri:rrT[key].x.value, description:''};
			t.localName = getName(list, rrT[key]); 
			if (rrT[key].description_1 !== undefined ) 
				t.description = rrT[key].description_1.value;
			rr.push(t);	
		} 
	}
	else {
		reply = await executeSPARQL(endpointUrl, sparql);
		reply = reply.filter(function(v) { return v.x.value.indexOf("://") !== -1}); // TODO Šāds bija tikai vienā vietā
		reply.forEach(v => { 
			let t = {uri:v.x.value, description:''};
			t.localName = getName(list, v); 
			if (v.description_1 !== undefined ) 
				t.description = v.description_1.value;
			rr.push(t);
			}
		);
	}
	return rr;
}

const getFullResults =  async (schema, endpointUrl, whereList, params, individualPattern, individualMode = '', showDescr = false) => {
	if (util.isFilter(params)) {  
		const filter = util.getFilter(params);
		sparql0 = await getDirectSparql(schema, filter, whereList, params, individualPattern, showDescr);
		sparql = await getSparql(schema, filter, whereList, params, individualPattern, showDescr);
		
		if ( sparql0 !== '' ) {
			if (individualMode === 'Direct') 
				rr = await getResults(schema, endpointUrl, sparql0);
			else 
				rr = await getResults(schema, endpointUrl, sparql, sparql0);
		}	
		else {
			if (individualMode !== 'Direct') 
				rr = await getResults(schema, endpointUrl, sparql);
		}
	}
	else { 
		sparql = await getSparql(schema, '', whereList, params, individualPattern, showDescr);
		rr = await getResults(schema, endpointUrl, sparql);
	}
	return rr;
}

const sparqlGetTreeIndividualsNew =  async (schema, params) => {
	let individualPattern = await getIndividualPattern(schema, params);
	const individualMode = util.getIndividualMode(params);
	const endpointUrl = util.getEndpointUrl(params); 
	//const typeString = await util.getTypeString(schema, params);  // TODO te varētu būt klasei individuāla vērtība
	const list = await util.getIndividualsNS(schema);
	let sparql0;
	let sparql;
	let sql;
	let reply;
	let rrT = {}; // Pagaidu dati, dublikātu izķeršanai
	let rr = [];
	let whereList = [];
	const info = await db.any(`SELECT count(*) FROM information_schema.tables v where table_schema = '${schema}' and  table_name = 'instances'`);
	const has_instances = info[0].count > 0;  
	
	if (util.isClassName(params, 0) && util.getClassName(params, 0).includes('All classes') && has_instances) { //  util.getSchemaType(params) == 'dbpedia' DBpedia zars
		if ( util.isFilter(params)) {
			let filter = util.getFilter(params);
			if ( !validateFilter(filter)) {
				const filter_list = filter.split('');
				let filter_list2 = [];
				filter_list.forEach(f => { 
					if (validateFilter(f))
						filter_list2.push(f);
				});
				filter = filter_list2.join('');
				params = util.setFilter(params, filter);
			}
			filter = filter.replace("'","''");		
			
			if (individualMode === 'Direct') {
				sql = `SELECT local_name, name FROM (SELECT local_name, ns_id FROM ${schema}.instances where local_name = $2 limit $1) AA , ${schema}.ns where ns_id = ns.id`;
				reply = await util.getSchemaData(sql, params);
				reply.data.forEach(v => { rr.push({localName:`${v.name}:${v.local_name}`, description:''});});
			}
			else {
				sql = `SELECT local_name, name FROM (SELECT local_name, ns_id FROM ${schema}.instances where local_name = $2 limit $1) AA , ${schema}.ns where ns_id = ns.id`;
				reply = await util.getSchemaData(sql, params);
				reply.data.forEach(v => { rrT[`${v.name}:${v.local_name}`] = `${v.name}:${v.local_name}`;});
				params.main.filter = params.main.filter.replace("(","").replace(")","");
				sql = `SELECT local_name, name FROM (SELECT local_name, ns_id FROM ${schema}.instances where test @@ to_tsquery($2) limit $1) AA , ${schema}.ns where ns_id = ns.id order by length(local_name)`;
				reply = await util.getSchemaData(sql, params);
				reply.data.forEach(v => { rrT[`${v.name}:${v.local_name}`] = `${v.name}:${v.local_name}`;});
				for (var key in rrT) 
					rr.push({localName:key, description:''});				

			}
		}
		else {  // Nekad neiestāsies, jo vienmēr tiks padots filtrs
			sql = `SELECT local_name, name, AA.id FROM (SELECT local_name, ns_id, id FROM ${schema}.instances where local_name is not null limit $1) AA , ${schema}.ns where ns_id = ns.id order by length(local_name)`;
			reply = await util.getSchemaData(sql, params);
			reply.data.forEach(v => { rr.push({localName:key, description:''});});  
		}

	}
	else {  // Ir konkrēta klase
		if (util.isClassName(params, 0) && !util.getClassName(params, 0).includes('All classes') ) {
			const clInfo = await util.getClassByName(util.getClassName(params, 0), schema);
			if (clInfo.length > 0) {
				const classInfo = await getClassSparqlPart(schema, params, clInfo[0].iri); 
				whereList.push(classInfo); //(`?x ${typeString} <${clInfo[0].iri}>`);   
				individualPattern = await getIndividualPattern(schema, params, clInfo[0].iri);
			}	
		}  // TODO - kas notiek, ja klases pēksņi nav? Tā gan nevajadzētu būt. Teorētiski laikam meklē visur kur.

		rr = await getFullResults(schema, endpointUrl, whereList, params, individualPattern, individualMode, true);
	}
	return rr;
}

const sparqlGetIndividualsNew =  async (schema, params) => {
	let individualPattern = await getIndividualPattern(schema, params);
	const endpointUrl = util.getEndpointUrl(params); 
	//const typeString = await util.getTypeString(schema, params); // TODO varētu būt katrai klasei sava
	const list = await util.getIndividualsNS(schema);
	let sparql;
	let sparql0 = '';
	let reply;
	let rr = [];

	let newPList = {in:[], out:[]};
	let whereList = [];

	if (util.isClassName(params, 0) ) {
		const clInfo = await util.getClassByName(util.getClassName(params, 0), schema);
		if (clInfo.length > 0) {
			individualPattern = await getIndividualPattern(schema, params, clInfo[0].iri);
			const classInfo = await getClassSparqlPart(schema, params, clInfo[0].iri); 
			whereList.push(classInfo); //(`?x ${typeString} <${clInfo[0].iri}>`);
			
		}	
	}
	
	if ( util.isPListI(params)) {
		const pListI = util.getPListI(params);
		const prop = await util.getPropertyByName(pListI.name, schema, params);
		const ind = await util.getUriIndividual(schema, params, 2);
		const classFrom = await util.getClassByName(util.getClassName(params, 0), schema);

		if ( prop.length > 0) {
			if ( pListI.type === 'in')
				whereList.push(`${ind} <${prop[0].iri}> ?x`);
			if ( pListI.type === 'out') 
				whereList.push(`?x  <${prop[0].iri}> ${ind} `);
		}
	}
	else {
		newPList = await util.getUrifromPList(schema, util.getPList(params, 0), params);
		if (newPList.in.length > 0 )
			newPList.in.forEach(element => whereList.push(`[] <${element}> ?x`));
		if (newPList.out.length > 0 )
			newPList.out.forEach(element => whereList.push(`?x <${element}> []`));
	}
	
	reply = await getFullResults(schema, endpointUrl, whereList, params, individualPattern);	
	reply.forEach(v => { rr.push(v.localName);} );
	return rr;
}

// TODO pilnais tikai wikidata. Ja ir nezināms ns tad nebūs labi, nestrādā korekti arī neesošiem indivīdiem
const sparqlGetIndividualByName =  async (info, params, schema) => {
	const endpointUrl = util.getEndpointUrl(params); 
	const list = await util.getIndividualsNS(schema);
	const individualPattern = await getIndividualPattern(schema, params);

	let name = '';
	let iri = '';
	let rr = {};
	if (info.indexOf('//') != -1) {
		iri = info;
		list.forEach(e => { if ( info.indexOf(e.value) == 0) name = info.replace(e.value,e.prefix);});
	}
	else {
		name = info;
		list.forEach(e => { if ( info.indexOf(e.prefix) == 0) iri = info.replace(e.prefix,e.value);});
	}
	
	rr.iri = iri;
	rr.name = name;
	rr.localName = name;
	
	let sparql = `ASK WHERE { {<${iri}> ?p ?o . } UNION {?s ?p <${iri}> . } }`; 
	let reply = await executeSPARQL(endpointUrl, sparql);
	
	if (reply) {
		if ( individualPattern.label !== undefined && individualPattern.label !== null ) {
			if ( individualPattern.label.lang !== undefined && individualPattern.label.lang !== null ) 
				sparql = `SELECT ?label_1 WHERE{ <${iri}> ${individualPattern.label.property} ?label_1. FILTER(LANG(?label_1) = '${individualPattern.label.lang}').}`; 
			else 
				sparql = `SELECT ?label_1 WHERE{ <${iri}> ${individualPattern.label.property} ?label_1.}`;
			
			reply = await executeSPARQL(endpointUrl, sparql);
			if ( reply.length > 0 ) {
				if (reply[0].label_1 !== undefined ) { 
					rr.label = reply[0].label_1.value;
					rr.localName = `${name.replace(':',`:[${rr.label} (`)})]`;
				}
				else
					rr.localName = name;
			}
		}
		
		if (rr.name === '') {
			rr.name = rr.iri;
			rr.localName =  rr.iri;
		}
		return [rr];
	}
	else
	 return [];
}

module.exports = {
    executeSPARQL,
	sparqlGetIndividualClasses,
	sparqlGetPropertiesFromIndividuals,
	sparqlGetPropertiesFromClass,
	sparqlGetIndividualsNew,
	sparqlGetTreeIndividualsNew,
	sparqlGetPropertiesFromRemoteIndividual,
	sparqlGetIndividualByName,
	sparqlGetClassLabels,
}