const ProgressBar = require('progress')
const debug = require('debug')('work')
const fetch = require('node-fetch')

const db = require('./config').db;

const dbSchema = process.env.DB_SCHEMA;
const INPUT_FILE = process.env.INPUT_FILE;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let auto_ns_counter = 1;

const NS_PREFIX_TO_ID = new Map(); // prefix --> id
const NS_ID_TO_PREFIX = new Map(); // id --> prefix

const generateAbbr = prefix => {
    const P1 = /http:\/\/www\.w3\.org\/2002\/(\d+)\/owl#/;
    let m = P1.exec(prefix);
    if (m) {
        return `owl_${m[1]}`;
    }
    return `auto_${auto_ns_counter++}`;
}

const getAbbrFromTheWeb = async prefix => {
    // may also call `https://prefix.cc/reverse?uri=${prefix}&format=ttl`, e.g., https://prefix.cc/reverse?uri=http://xmlns.com/foaf/0.1/&format=ttl
    const url = `https://prefix.cc/reverse?uri=${prefix}&format=ttl`;

    try {
        const resp = await fetch(url);
        if (resp.ok) {
            const text = await resp.text();
            // format '@prefix foaf: <http://xmlns.com/foaf/0.1/>.'
            const P2 = /@prefix (\w+): (<.+>)./
            let m = P2.exec(text);
            if (m) {
                console.log(`Found abbreviation ${m[1]} for the prefix ${prefix}`);
                return m[1];
            }
        }
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
    return null;
}

const resolveNsPrefix = async (prefix, abbr = null) => {
    if (NS_PREFIX_TO_ID.has(prefix)) {
        return NS_PREFIX_TO_ID.get(prefix);
    }
    try {
        let resolvedAbbr = abbr;
        if (!resolvedAbbr) {
            resolvedAbbr = await getAbbrFromTheWeb(prefix);
        }
        if (!resolvedAbbr) {
            resolvedAbbr = generateAbbr(prefix);
        }

        let id = (await db.one(`INSERT INTO ${dbSchema}.ns (value, name) values ($1, $2) RETURNING id`, [prefix, resolvedAbbr])).id;

        NS_PREFIX_TO_ID.set(prefix, id);
        NS_ABBR_TO_ID.set(resolvedAbbr, id);
        NS_ID_TO_PREFIX.set(id, prefix);
        return id;

    } catch(err) {
        console.error(err);
    }
}

const NS_ABBR_TO_ID = new Map(); // abbr --> id
const NS_ABBR_TO_PREFIX = new Map(); // abbr --> prefix

/**
 * This method works only with data types in form "xsd:integer", as they appear in the input JSON
 */
const DATATYPES = new Map();
const addDatatype = async shortIri => {
    if (!shortIri || typeof shortIri !== 'string') return null;
    if (DATATYPES.has(shortIri)) {
        return DATATYPES.get(shortIri);
    }

    const parts = shortIri.split(':');
    if (parts.length !== 2) {
        console.error('Bad data type IRI:', shortIri);
        return null;
    }
    let prefix = NS_ABBR_TO_PREFIX.get(parts[0]);
    if (!prefix) {
        console.error(`Unknown short prefix: ${parts[0]}`);
        return null;
    }

    let ns_id = NS_ABBR_TO_ID.get(parts[0]);

    try {
        let dt_id = (await db.one(`INSERT INTO ${dbSchema}.datatypes (iri, ns_id, local_name)
            VALUES ($1, $2, $3)
            RETURNING id`,
            [
                `${prefix}${parts[1]}`,
                ns_id,
                parts[1],
            ])).id;

        DATATYPES.set(shortIri, dt_id);

        return dt_id;

    } catch(err) {
        console.error(err)
    }
}
const resolveDatatype = shortIri => DATATYPES.get(shortIri);


const CLASSES = new Map();
const addClass = async c => {
    // c.fullName: "http://dbpedia.org/class/yago/WikicatSingle-partyStates" -> iri
    // ?c.localName: "WikicatSingle-partyStates" -> local_name, ?display_name
    // ?c.namespace: "http://dbpedia.org/class/yago/"
    // c.instanceCount: 1 -> cnt
    // c.SuperClasses[]: ["http://dbpedia.org/class/yago/WikicatStatesAndTerritoriesEstablishedIn1949"] -> cc_rels(1=sub_class_of)
    // c.propertiesInSchema: false

    // if (CLASSES.has(c.fullName)) {
    //     return CLASSES.get(c.fullName)
    // }

    let ns_id = await resolveNsPrefix(c.namespace);
    let props_in_schema = (c.propertiesInSchema === undefined) ? true : c.propertiesInSchema;

    let class_id;
    try {
        class_id = (await db.one(`INSERT INTO ${dbSchema}.classes (iri, local_name, display_name, ns_id, cnt, props_in_schema)
            VALUES ($1, $2, $2, $3, $4, $5) RETURNING id`,
        [
            c.fullName,
            c.localName,
            ns_id,
            c.instanceCount,
            props_in_schema,
        ])).id;
        CLASSES.set(c.fullName, class_id);

    } catch(err) {
        console.error(err);
    }
}

const addClassSuperclasses = async c => {
    // c.SuperClasses[]: ["http://dbpedia.org/class/yago/WikicatStatesAndTerritoriesEstablishedIn1949"] -> cc_rels(1=sub_class_of)

    if (c.SuperClasses && c.SuperClasses.length > 0) {
        let class_id = getClassId(c.fullName);
        for (const sc of c.SuperClasses) {
            let sc_id = getClassId(sc);
            try {
                await db.none(`INSERT INTO ${dbSchema}.cc_rels (class_1_id, class_2_id, type_id) VALUES ($1, $2, 1)`, [
                    class_id,
                    sc_id,
                ]);

            } catch(err) {
                console.error(err);
            }
        }
    }
}

const ANNOT_TYPES = new Map();
const getOrRegisterAnnotationType = async iri => {
    let type_id = ANNOT_TYPES.get(iri);
    if (type_id) return type_id;

    try {
        type_id = (await db.one(`INSERT INTO ${dbSchema}.annot_types (iri) VALUES ($1) RETURNING id`, [
            iri
        ])).id;
        ANNOT_TYPES.set(iri, type_id);
        return type_id;
   
    } catch (err) {
        console.error(err);
    }
}

const addClassLabels = async c => {
    // c.Labels[]:
    // { 
    //    property: "http://www.w3.org/2000/01/rdf-schema#label",
    //    value: "Nephew",
    //    language: "en"
    // }

    let class_id = getClassId(c.fullName);
    if (c.Labels && c.Labels.length > 0) {
        for (const lbl of c.Labels) {
            let type_id = await getOrRegisterAnnotationType(lbl.property);
            try {
                await db.none(`INSERT INTO ${dbSchema}.class_annots (class_id, type_id, annotation, language_code)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT ON CONSTRAINT class_annots_c_t_l_uq
                    DO UPDATE SET annotation = $3
                    `, [
                        class_id,
                        type_id,
                        lbl.value,
                        lbl.language
                    ]);
            } catch (err) {
                console.error(err);
            }
        }
    }
}

const addPropertyLabels = async p => {
    // p.Labels[]:
    // {
    //   "property": "http://www.w3.org/2004/02/skos/core#prefLabel",
    //   "value": "toissijainen nimi",
    //   "language": "fi"
    // }

    let prop_id = getPropertyId(p.fullName);
    if (p.Labels && p.Labels.length > 0) {
        for (const lbl of p.Labels) {
            let type_id = await getOrRegisterAnnotationType(lbl.property);
            try {
                await db.none(`INSERT INTO ${dbSchema}.property_annots (property_id, type_id, annotation, language_code)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT ON CONSTRAINT property_annots_p_t_l_uq
                    DO UPDATE SET annotation = $3
                    `, [
                        prop_id,
                        type_id,
                        lbl.value,
                        lbl.language
                    ]);
            } catch (err) {
                console.error(err);
            }
        }
    }
}

const getClassId = iri => {
    let id = CLASSES.get(iri);
    if (!id) {
        console.error(`Could not find id for the class ${iri}`);
    }
    return id;
}

const PROPS = new Map();
const addProperty = async p => {
    // p.fullName: "http://dbpedia.org/property/julPrecipitationDays"
    // ?p.localName: "julPrecipitationDays"
    // ?p.namespace: "http://dbpedia.org/property/"
    // p.tripleCount: 1 -> cnt
    // p.dataTripleCount: 1 -> data_cnt
    // p.objectTripleCount: 0 -> object_cnt
    // p.maxCardinality: 1, -1 -> max_cardinality
    // p.maxInverseCardinality: -1 -> inverse_max_cardinality
    // p.closedDomain: true
    // p.closedRange: true
    let ns_id = await resolveNsPrefix(p.namespace);

    let domain_class_id = null;
    if (p.closedDomain && p.SourceClasses) {
        const candidates = p.SourceClasses.filter(x => x.importanceIndex > 0);
        if (candidates.length === 1) {
            domain_class_id = getClassId(candidates[0].classFullName);
        }
    }
    let range_class_id = null;
    if (p.closedRange && p.dataTripleCount === 0 && p.TargetClasses) {
        const candidates = p.TargetClasses.filter(x => x.importanceIndex > 0);
        if (candidates.length === 1) {
            range_class_id = getClassId(candidates[0].classFullName);
        }
    }

    let property_id;
    try {
        property_id = (await db.one(`INSERT INTO ${dbSchema}.properties
            (iri, ns_id, local_name, display_name,
                cnt, object_cnt,
                max_cardinality, inverse_max_cardinality,
                source_cover_complete, target_cover_complete,
                domain_class_id, range_class_id)
            VALUES ($1, $2, $3, $3,
                $4, $5,
                $7, $8,
                $9, $10,
                $11, $12)
            RETURNING id`,
        [
            p.fullName, ns_id, p.localName,
            p.tripleCount, p.objectTripleCount, p.dataTripleCount,
            p.maxCardinality, p.maxInverseCardinality,
            p.closedDomain || false, p.closedRange || false,
            domain_class_id, range_class_id,
        ])).id;
        PROPS.set(p.fullName, property_id);

    } catch(err) {
        console.error(err);
    }

    // p.SourceClasses[] -> cp_rels(2=outgoing)
    //      classFullName: "http://dbpedia.org/class/yago/YagoLegalActorGeo" -> resolve to class_id
    //      tripleCount: 33 -> cnt
    //      dataTripleCount: 33 -> data_cnt
    //      objectTripleCount: 0 -> object_cnt
    //      minCardinality: 0 -> min_cardinality
    //      maxCardinality: -1 -> max_cardinality (?specapstrāde -1?)
    //      closedRange: true
    //      importanceIndex: 1
    //      DataTypes[]
    //          dataType: "rdf:langString"
    //          tripleCount: 33
    if (p.SourceClasses) {
        for (const srcClass of p.SourceClasses) {
            const class_id = getClassId(srcClass.classFullName);
            let cp_rel_id;
            try {
                cp_rel_id = (await db.one(`INSERT INTO ${dbSchema}.cp_rels (
                    class_id, property_id, type_id,
                    cnt, object_cnt, data_cnt,
                    min_cardinality, max_cardinality,
                    cover_set_index,
                    details_level,
                    sub_cover_complete)
                VALUES ($1, $2, $3,
                    $4, $5, $6,
                    $7, $8,
                    $9,
                    $10,
                    $11) RETURNING id`,
                [
                    class_id, property_id, 2,
                    srcClass.tripleCount, srcClass.objectTripleCount, srcClass.dataTripleCount,
                    srcClass.minCardinality, srcClass.maxCardinality,
                    srcClass.importanceIndex,
                    p.ClassPairs ? 2 : 0,
                    srcClass.closedRange || false,
                ])).id;

            } catch(err) {
                console.error(err);
            }

            if (srcClass.DataTypes) {
                for (const dtr of srcClass.DataTypes) {
                    try {
                        await addDatatype(dtr.dataType);
                        let datatype_id = resolveDatatype(dtr.dataType);

                        await db.none(`INSERT INTO ${dbSchema}.cpd_rels (cp_rel_id, datatype_id, cnt)
                            VALUES ($1, $2, $3)
                            ON CONFLICT ON CONSTRAINT cpd_rels_cp_rel_id_datatype_id_key DO NOTHING`,
                        [
                            cp_rel_id,
                            datatype_id,
                            dtr.tripleCount,
                        ]);

                    } catch(err) {
                        console.error(err);
                    }
                }
            }

            // p.ClassPairs[]
            //      SourceClass: "http://www.openarchives.org/ore/terms/Proxy"
            //      sourceImportanceIndex: 1
            //      TargetClass: "http://www.europeana.eu/schemas/edm/WebResource"
            //      targetImportanceIndex: 1
            //      tripleCount: 1
            if (p.ClassPairs) {
                for (const pair of p.ClassPairs) {
                    if (pair.SourceClass !== srcClass.classFullName) continue;

                    try {
                        const other_class_id = getClassId(pair.TargetClass);
                        await db.none(`INSERT INTO ${dbSchema}.cpc_rels (cp_rel_id, other_class_id, cnt, cover_set_index)
                            VALUES ($1, $2, $3, $4)`, [
                                cp_rel_id,
                                other_class_id,
                                pair.tripleCount,
                                pair.targetImportanceIndex,
                            ]);

                    } catch (err) {
                        console.error(err);
                    }
                }
            }
        }
    }

    // p.TargetClasses[] -> cp_rels(1=incoming)
    //      classFullName: "http://www.europeana.eu/schemas/edm/WebResource" -> resolve to class_id
    //      tripleCount: 1 -> cnt
    //      closedDomain: true
    //      importanceIndex: 1
    //      minInverseCardinality: 1 ?-> min_cardinality
    //      maxInverseCardinality: 1 ?-> max_cardinality
    if (p.TargetClasses) {
        for (const targetClass of p.TargetClasses) {
            const class_id = getClassId(targetClass.classFullName);
            let cp_rel_id;
            try {
                cp_rel_id = (await db.one(`INSERT INTO ${dbSchema}.cp_rels (
                    class_id, property_id, type_id,
                    cnt, object_cnt,
                    min_cardinality, max_cardinality,
                    cover_set_index,
                    details_level,
                    sub_cover_complete)
                VALUES ($1, $2, $3,
                    $4, $4,
                    $5, $6,
                    $7,
                    $8,
                    $9)
                RETURNING id`,
                [
                    class_id, property_id, 1,
                    targetClass.tripleCount,
                    targetClass.minInverseCardinality, targetClass.maxInverseCardinality,
                    targetClass.importanceIndex,
                    p.ClassPairs ? 2 : 0,
                    targetClass.closedDomain || false,
                ])).id;

            } catch(err) {
                console.error(err);
            }


            // p.ClassPairs[]
            //      SourceClass: "http://www.openarchives.org/ore/terms/Proxy"
            //      sourceImportanceIndex: 1
            //      TargetClass: "http://www.europeana.eu/schemas/edm/WebResource"
            //      targetImportanceIndex: 1
            //      tripleCount: 1
            if (p.ClassPairs) {
                for (const pair of p.ClassPairs) {
                    if (pair.TargetClass !== targetClass.classFullName) continue;

                    try {
                        const other_class_id = getClassId(pair.SourceClass);
                        await db.none(`INSERT INTO ${dbSchema}.cpc_rels (cp_rel_id, other_class_id, cnt, cover_set_index)
                            VALUES ($1, $2, $3, $4)`, [
                                cp_rel_id,
                                other_class_id,
                                pair.tripleCount,
                                pair.sourceImportanceIndex,
                            ]);

                    } catch (err) {
                        console.error(err);
                    }
                }
            }

        }
    }

    // p.DataTypes[]
    //      dataType: "xsd:string"
    //      tripleCount: 1013999
    if (p.DataTypes) {
        for (const dtr of p.DataTypes) {
            try {
                await addDatatype(dtr.dataType)
                let datatype_id = resolveDatatype(dtr.dataType)
                await db.none(`INSERT INTO ${dbSchema}.pd_rels (property_id, datatype_id, cnt)
                    VALUES ($1, $2, $3)
                    ON CONFLICT ON CONSTRAINT pd_rels_property_id_datatype_id_key DO NOTHING`,
                [
                    property_id,
                    datatype_id,
                    dtr.tripleCount,
                ]);
            } catch (err) {
                console.error(err);
            }
        }
    }


}

const addPropertyPairs = async p => {
    // Followers[], IncomingProperties[], OutgoingProperties[]

    // p.Followers[]
    //   "propertyName": "http://dbpedia.org/property/date",
    //   "tripleCount": 0

    const this_prop_id = getPropertyId(p.fullName);

    if (p.Followers) {
        for (let pair of p.Followers) {
            if (pair.tripleCount === 0) continue;
            let other_prop_id = getPropertyId(pair.propertyName)
            if (other_prop_id) {
                try {
                    await db.none(`INSERT INTO ${dbSchema}.pp_rels (property_1_id, property_2_id, type_id, cnt)
                        VALUES ($1, $2, 1, $3)`,
                    [
                        this_prop_id,
                        other_prop_id,
                        pair.tripleCount,
                    ]);
                } catch(err) {
                    console.error(err);
                }
            }
        }
    }

    if (p.IncomingProperties) {
        for (let pair of p.IncomingProperties) {
            if (pair.tripleCount === 0) continue;
            let other_prop_id = getPropertyId(pair.propertyName)
            if (other_prop_id) {
                try {
                    await db.none(`INSERT INTO ${dbSchema}.pp_rels (property_1_id, property_2_id, type_id, cnt)
                        VALUES ($1, $2, 3, $3)`,
                    [
                        this_prop_id,
                        other_prop_id,
                        pair.tripleCount,
                    ]);
                } catch(err) {
                    console.error(err);
                }
            }
        }
    }

    if (p.OutgoingProperties) {
        for (let pair of p.OutgoingProperties) {
            if (pair.tripleCount === 0) continue;
            let other_prop_id = getPropertyId(pair.propertyName)
            if (other_prop_id) {
                try {
                    await db.none(`INSERT INTO ${dbSchema}.pp_rels (property_1_id, property_2_id, type_id, cnt)
                        VALUES ($1, $2, 2, $3)`,
                    [
                        this_prop_id,
                        other_prop_id,
                        pair.tripleCount,
                    ]);
                } catch(err) {
                    console.error(err);
                }
            }
        }
    }

}

const getPropertyId = iri => {
    let id = PROPS.get(iri);
    if (!id) {
        console.error(`Could not find id for the property ${iri}`);
    }
    return id;
}

const addPrefixShortcut = async (namespace, shortcut) => {
    // namespace: "https://creativecommons.org/ns#""
    // shortcut: "cc:" vai ":"
    // droši vien ar upsert
    // TODO:
    if (!shortcut) {
        console.error(`Missing ns alias`);
        return;
    }
    if (!/^\w[a-z0-9]*:$/.test(shortcut)) {
        console.error(`Bad ns alias ${shortcut}`);
        return;
    }

    try {
        let is_local = shortcut === ':';

        let name = shortcut;
        if (shortcut.endsWith(':')) {
            name = shortcut.slice(0, shortcut.length - 1);
        }

        await db.none(`INSERT INTO ${dbSchema}.ns
            (name, value, is_local)
            VALUES ($1, $2, $3)
            ON CONFLICT ON CONSTRAINT ns_value_key DO UPDATE SET name = $1, is_local = $3`,
            // ON CONFLICT ON CONSTRAINT ns_name_key DO UPDATE SET is_local = $3`,
        [
            name,
            namespace,
            is_local,
        ]);

    } catch(err) {
        console.error(err);
    }
}

const init = async () => {
    try {
        const nsData = await db.many(`SELECT * FROM ${dbSchema}.ns`);
        console.log(`${nsData.length} ns entries loaded`);
        for (let row of nsData) {
            NS_PREFIX_TO_ID.set(row.value, row.id);
            NS_ABBR_TO_ID.set(row.name, row.id);
            NS_ID_TO_PREFIX.set(row.id, row.value);
            NS_ABBR_TO_PREFIX.set(row.name, row.value);
        }

        const atData = await db.many(`SELECT * FROM ${dbSchema}.annot_types`);
        console.log(`${atData.length} annotation types loaded`);
        for (let row of atData) {
            ANNOT_TYPES.set(row.iri, row.id);
        }

    } catch(err) {
        console.error(err);
        console.error('cannot init; exiting');
        process.exit(1);
    }
}

const importFromJSON = async data => {
    await init();

    if (data.Classes) {
        let classBar = new ProgressBar(`[:bar] ( :current classes of :total, :percent)`, { total: data.Classes.length, width: 100, incomplete: '.' });
        for (const c of data.Classes) {
            await addClass(c);
            await addClassLabels(c);
            classBar.tick();
        }
        // 2nd pass because sub may appear before super
        let superClassBar = new ProgressBar(`[:bar] ( :current classes for superclasses of :total, :percent)`, { total: data.Classes.length, width: 100, incomplete: '.' });
        for (const c of data.Classes) {
            await addClassSuperclasses(c);
            superClassBar.tick();
        }
    }

    if (data.Properties) {
        let propsBar = new ProgressBar(`[:bar] ( :current props of :total, :percent)`, { total: data.Properties.length, width: 100, incomplete: '.' });
        for (const p of data.Properties) {
            await addProperty(p);
            await addPropertyLabels(p);
            propsBar.tick();
        }
        // 2nd pass because ref may appear before def
        let propsPairsBar = new ProgressBar(`[:bar] ( :current prop pairs of :total, :percent)`, { total: data.Properties.length, width: 100, incomplete: '.' });
        for (const p of data.Properties) {
            await addPropertyPairs(p);
            propsPairsBar.tick();
        }
    }

    if (data.Prefixes) {
        for (const pref of data.Prefixes) {
            await addPrefixShortcut(pref.namespace, pref.prefix);
        }
    }
}

const registerImportedSchema = async () => {
    const schemaName = process.env.SCHEMA_NAME;
    const schemaDisplayName = process.env.SCHEMA_DISPLAY_NAME || process.env.SCHEMA_NAME;

    const sparqlUrl = process.env.SPARQL_URL;
    const publicUrl = process.env.PUBLIC_URL || sparqlUrl;
    const namedGraph = process.env.NAMED_GRAPH || null;
    let endpointTypeId = 1;
    if (process.env.ENDPOINT_TYPE) {
        try {
            endpointTypeId = (await db.one('SELECT id FROM public.endpoint_types WHERE name = $1', [ 
                process.env.ENDPOINT_TYPE.toLowerCase().trim(),
            ])).id;
        } catch {
            endpointTypeId = 1; // default = generic
        }
    }

    const ENDPOINT_SQL = `INSERT INTO public.endpoints (sparql_url, public_url, named_graph, endpoint_type_id) VALUES ($1, $2, $3, $4) RETURNING id`;
    const endpoint_id = (await db.one(ENDPOINT_SQL, [
        sparqlUrl, 
        publicUrl,
        namedGraph,
        endpointTypeId,
    ])).id;

    const SCHEMA_SQL = `INSERT INTO public.schemata (schema_name, db_schema_name, has_pp_rels, has_instance_table) VALUES ($1, $1, $2, $3) RETURNING id`;
    const schema_id = (await db.one(SCHEMA_SQL, [
        schemaName,
        false,
        false,
    ])).id;

    const E2S_SQL = `INSERT INTO public.schemata_to_endpoints (schema_id, endpoint_id, display_name, is_active, use_pp_rels) VALUES ($1, $2, $3, $4, $5)`;
    await db.none(E2S_SQL, [
        schema_id, 
        endpoint_id, 
        schemaDisplayName,
        true,
        false,
    ]);

    console.log(`The new schema "${schemaName}" added to the schema registry`);
}

const work = async () => {
    const data = require(INPUT_FILE);

    await importFromJSON(data);
    
    await registerImportedSchema();

    return 'done';
}

work().then(console.log).catch(console.error);
