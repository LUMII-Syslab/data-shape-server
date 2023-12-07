const ProgressBar = require('progress')
const debug = require('debug')('import')
const fetch = require('node-fetch');
const col = require('ansi-colors')

const { CC_REL_TYPE, CP_REL_TYPE, PP_REL_TYPE } = require('./type-constants')

const { DB_CONFIG, db } = require('./config');

const dbSchema = process.env.DB_SCHEMA;
const INPUT_FILE = process.env.INPUT_FILE;
const registrySchema = process.env.REGISTRY_SCHEMA || 'public';

const IMPORTER_VERSION = '2023-11-03';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let auto_ns_counter = 1;

const NS_VALUE_TO_ID = new Map(); // prefix --> ns_id
const NS_ID_TO_VALUE = new Map(); // ns_id --> prefix

const NS_NAME_TO_ID = new Map(); // abbr --> ns_id
const NS_ID_TO_NAME = new Map(); // ns_id -> abbr

const NS_NAME_TO_VALUE = new Map(); // abbr --> prefix
const NS_VALUE_TO_NAME = new Map(); // prefix --> abbr

const rememberPrefix = (id, name, value) => {
    NS_VALUE_TO_ID.set(value, id);
    NS_VALUE_TO_NAME.set(value, name);
    NS_ID_TO_VALUE.set(id, value);
    NS_ID_TO_NAME.set(id, name);
    NS_NAME_TO_ID.set(name, id);
    NS_NAME_TO_VALUE.set(name, value);
}

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
    // const url = `https://prefix.cc/reverse?uri=${prefix}&format=ttl`;
    // broken certificate, degrading to http
    const url = `http://prefix.cc/reverse?uri=${prefix}&format=ttl`;

    try {
        const resp = await fetch(url);
        if (resp.ok) {
            const text = await resp.text();
            // format '@prefix foaf: <http://xmlns.com/foaf/0.1/>.'
            const P2 = /@prefix (\w+): (<.+>)./
            let m = P2.exec(text);
            if (m) {
                console.log(`Found abbreviation ${col.yellow(m[1])} for the prefix ${col.yellow(prefix)}`);
                return m[1];
            }
        }
    } catch (err) {
        console.error(err);
        // process.exit(1);
    }
    return null;
}

const getAbbrFromPublic = async prefix => {
    let r = await db.any(`select * from public.ns_prefixes where prefix = $1 order by id`, [ prefix ]);
    if (r.length > 0) return r[0].abbr;
}

const resolveNsPrefix = async (prefix, abbr = null) => {
    if (NS_VALUE_TO_ID.has(prefix)) {
        return NS_VALUE_TO_ID.get(prefix);
    }
    try {
        let resolvedAbbr = abbr;
        if (!resolvedAbbr) {
            resolvedAbbr = await getAbbrFromTheWeb(prefix);
        }
        if (!resolvedAbbr) {
            resolvedAbbr = await getAbbrFromPublic(prefix);
        }
        if (!resolvedAbbr) {
            resolvedAbbr = generateAbbr(prefix);
        }

        let id = (await db.one(
            `INSERT INTO ${dbSchema}.ns (value, name) values ($1, $2) RETURNING id`,
        [
            prefix,
            resolvedAbbr
        ])).id;

        rememberPrefix(id, resolvedAbbr, prefix);

        return id;

    } catch(err) {
        console.error(err);
    }
}

const splitIri = iri => {
    if (!iri || typeof iri !== 'string') throw new Error('bad iri');

    let pos = iri.indexOf('#');
    if (pos >= 0) return [ iri.slice(0, pos + 1), iri.slice(pos + 1) ];
    pos = iri.lastIndexOf('/');
    if (pos >= 0) return [ iri.slice(0, pos + 1), iri.slice(pos + 1) ];
    pos = iri.lastIndexOf(':');
    if (pos >= 0) return [ iri.slice(0, pos + 1), iri.slice(pos + 1) ];

    return [ iri, '' ];
}

const getLocalName = iri => {
    if (!iri || typeof iri !== 'string') return null;

    let [ prefix, localName ] = splitIri(iri);
    return localName;
}

const DATATYPES_BY_IRI = new Map(); // iri -> datatype_id
const DATATYPES_BY_SHORT_IRI = new Map(); // abbr:localName -> datatype_id

const resolveDatatypeByShortIri = shortIri => DATATYPES_BY_SHORT_IRI.get(shortIri);
const resolveDatatypeByIri = iri => DATATYPES_BY_IRI.get(iri);

/**
 * This method works only with data types in form "xsd:integer", as they appear in the input JSON
 */
const addDatatypeByShortIri = async shortIri => {
    if (!shortIri || typeof shortIri !== 'string') return null;
    if (DATATYPES_BY_SHORT_IRI.has(shortIri)) {
        return DATATYPES_BY_SHORT_IRI.get(shortIri);
    }

    const parts = shortIri.split(':');
    if (parts.length !== 2) {
        console.error('Bad data type short IRI:', shortIri);
        return null;
    }

    let [ abbr, localName ] = parts;
    let prefix = NS_NAME_TO_VALUE.get(abbr);

    if (!prefix) {
        console.error(`Unknown short prefix: ${abbr}`);
        return null;
    }

    let ns_id = NS_NAME_TO_ID.get(abbr);
    let iri = `${prefix}${localName}`;

    return await addDatatype(iri, ns_id, localName, abbr);
}

const addDatatypeByIri = async iri => {
    if (!iri || typeof iri !== 'string') return null;
    if (DATATYPES_BY_IRI.has(iri)) {
        return DATATYPES_BY_IRI.get(iri);
    }

    let [ prefix, localName ] = splitIri(iri);
    let ns_id = NS_VALUE_TO_ID.get(prefix);

    if (!ns_id) {
        console.log(`namespace not found for the prefix '${col.yellow(prefix)}'`);
        return null;
    }

    let abbr = NS_ID_TO_NAME.get(ns_id);

    return await addDatatype(iri, ns_id, localName, abbr);
}

const addDatatype = async (iri, ns_id, localName, abbr) => {
    try {
        let dt_id = (await db.one(`INSERT INTO ${dbSchema}.datatypes (iri, ns_id, local_name)
            VALUES ($1, $2, $3)
            RETURNING id`,
            [
                iri,
                ns_id,
                localName,
            ])).id;

        let shortIri = `${abbr}:${localName}`;
        DATATYPES_BY_SHORT_IRI.set(shortIri, dt_id);
        DATATYPES_BY_IRI.set(iri, dt_id);

        return dt_id;

    } catch(err) {
        console.error(err)
    }
}

const CLASSES = new Map(); // iri -> class_id
const addClass = async c => {
    // c.fullName: "http://dbpedia.org/class/yago/WikicatSingle-partyStates" -> iri
    // ?c.localName: "WikicatSingle-partyStates" -> local_name, ?display_name
    // ?c.namespace: "http://dbpedia.org/class/yago/"
    // c.instanceCount: 1 -> cnt
    // c.SuperClasses[]: ["http://dbpedia.org/class/yago/WikicatStatesAndTerritoriesEstablishedIn1949"] -> cc_rels(1=sub_class_of)
    // c.propertiesInSchema: false

    // c.classificationProperty: "http://data.nobelprize.org/terms/year"
    // ?c.dataType: "http://www.w3.org/2001/XMLSchema#integer"
    // c.Labels: [] // ?? pagaidām vienmēr tukšs []
    // c.isLiteral: true

    // if (CLASSES.has(c.fullName)) {
    //     return CLASSES.get(c.fullName)
    // }

    let ns_id = (c.namespace !== undefined) ? (await resolveNsPrefix(c.namespace)) : null;
    let props_in_schema = (c.propertiesInSchema === undefined) ? true : c.propertiesInSchema;
    // let datatype_id = c.dataType ? DATATYPES_BY_IRI.get(c.dataType) : null;
    let datatype_id = (c.dataType !== undefined) ? (await addDatatypeByIri(c.dataType)) : null;

    let class_id;
    try {
        class_id = (await db.one(`INSERT INTO ${dbSchema}.classes (iri, local_name, display_name, ns_id, cnt, props_in_schema,
            classification_property, is_literal, datatype_id)
            VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
            c.fullName,
            c.localName,
            ns_id,
            c.instanceCount,
            props_in_schema,
            c.classificationProperty,
            c.isLiteral,
            datatype_id
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

const ANNOT_TYPES = new Map(); // iri -> annot_type_id
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

const PROPS = new Map(); // iri -> property_id
const addProperty = async p => {
    // fullName: "http://dbpedia.org/property/julPrecipitationDays"
    // ?localName: "julPrecipitationDays"
    // ?namespace: "http://dbpedia.org/property/"
    // tripleCount: 1 -> cnt
    // dataTripleCount: 1 -> data_cnt
    // objectTripleCount: 0 -> object_cnt
    // maxCardinality: 1, -1 -> max_cardinality
    // maxInverseCardinality: -1 -> inverse_max_cardinality
    // closedDomain: true
    // closedRange: true
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
    //      isPrincipal: true
    //      importanceIndex: 1
    //      DataTypes[]
    //          dataType: "rdf:langString"
    //          tripleCount: 33
    let property_domain_class_id;
    if (p.SourceClasses) {
        for (const srcClass of p.SourceClasses) {
            const class_id = getClassId(srcClass.classFullName);
            if (srcClass.isPrincipal) {
                property_domain_class_id = class_id;
            }

            let principalTargetClassId = null;
            if (p.ClassPairs) {
                for (const pair of p.ClassPairs) {
                    if (pair.SourceClass !== srcClass.classFullName) continue;
                    if (pair.TargetClass.isPrincipalTarget) {
                        principalTargetClassId = getClassId(pair.TargetClass.classFullName);
                    }
                }
            }

            let cp_rel_id;
            try {
                cp_rel_id = (await db.one(`INSERT INTO ${dbSchema}.cp_rels (
                    class_id, property_id, type_id,
                    cnt, object_cnt, data_cnt,
                    min_cardinality, max_cardinality,
                    cover_set_index,
                    details_level,
                    sub_cover_complete,
                    principal_class_id)
                VALUES ($1, $2, $3,
                    $4, $5, $6,
                    $7, $8,
                    $9,
                    $10,
                    $11,
                    $12) RETURNING id`,
                [
                    class_id, property_id, CP_REL_TYPE.OUTGOING,
                    srcClass.tripleCount, srcClass.objectTripleCount, srcClass.dataTripleCount,
                    srcClass.minCardinality, srcClass.maxCardinality,
                    srcClass.importanceIndex,
                    p.ClassPairs ? 2 : 0,
                    srcClass.closedRange || false,
                    principalTargetClassId,
                ])).id;

            } catch(err) {
                console.error(err);
            }

            if (srcClass.DataTypes) {
                for (const dtr of srcClass.DataTypes) {
                    try {
                        await addDatatypeByShortIri(dtr.dataType);
                        let datatype_id = resolveDatatypeByShortIri(dtr.dataType);

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

    // store domain_class_id if found
    if (property_domain_class_id) {
        try {
            await db.none(`UPDATE ${dbSchema}.properties SET domain_class_id = $1 WHERE id = $2`,[
                property_domain_class_id,
                property_id,
            ])
        } catch(err) {
            console.error(err);
        } 
    }

    // p.TargetClasses[] -> cp_rels(1=incoming)
    //      classFullName: "http://www.europeana.eu/schemas/edm/WebResource" -> resolve to class_id
    //      tripleCount: 1 -> cnt
    //      closedDomain: true
    //      isPrincipal: true
    //      importanceIndex: 1
    //      minInverseCardinality: 1 ?-> min_cardinality
    //      maxInverseCardinality: 1 ?-> max_cardinality
    let property_range_class_id;
    if (p.TargetClasses) {
        for (const targetClass of p.TargetClasses) {
            const class_id = getClassId(targetClass.classFullName);
            if (targetClass.isPrincipal) {
                property_range_class_id = class_id;
            }

            let principalSourceClassId = null;
            if (p.ClassPairs) {
                for (const pair of p.ClassPairs) {
                    if (pair.TargetClass !== targetClass.classFullName) continue;
                    if (pair.SourceClass.isPrincipalSource) {
                        principalSourceClassId = getClassId(pair.SourceClass.classFullName);
                    }
                }
            }

            let cp_rel_id;
            try {
                cp_rel_id = (await db.one(`INSERT INTO ${dbSchema}.cp_rels (
                    class_id, property_id, type_id,
                    cnt, object_cnt,
                    min_cardinality, max_cardinality,
                    cover_set_index,
                    details_level,
                    sub_cover_complete,
                    principal_class_id)
                VALUES ($1, $2, $3,
                    $4, $4,
                    $5, $6,
                    $7,
                    $8,
                    $9,
                    $10)
                RETURNING id`,
                [
                    class_id, property_id, CP_REL_TYPE.INCOMING,
                    targetClass.tripleCount,
                    targetClass.minInverseCardinality, targetClass.maxInverseCardinality,
                    targetClass.importanceIndex,
                    p.ClassPairs ? 2 : 0,
                    targetClass.closedDomain || false,
                    principalSourceClassId,
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
            //      isPrincipalSource: false
            //      isPrincipalTarget: false
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

    // store domain_class_id if found
    if (property_range_class_id) {
        try {
            await db.none(`UPDATE ${dbSchema}.properties SET range_class_id = $1 WHERE id = $2`,[
                property_range_class_id,
                property_id,
            ])
        } catch(err) {
            console.error(err);
        } 
    }

    // p.DataTypes[]
    //      dataType: "xsd:string"
    //      tripleCount: 1013999
    if (p.DataTypes) {
        for (const dtr of p.DataTypes) {
            try {
                await addDatatypeByShortIri(dtr.dataType)
                let datatype_id = resolveDatatypeByShortIri(dtr.dataType)
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

const setDefaultNS = async prefixValue => {
    await db.none(`UPDATE ${dbSchema}.ns SET is_local = false`);
    let localId = (await db.one(`INSERT INTO ${dbSchema}.ns (name, value, is_local) VALUES ('', $1, true)
        ON CONFLICT ON CONSTRAINT ns_value_key 
        DO UPDATE SET name = '', value = $1, is_local = true
        RETURNING id`, [ prefixValue ])).id;
    rememberPrefix(localId, '', prefixValue);
}

const addPrefixShortcut = async (prefixValue, prefixName) => {
    // namespace: "https://creativecommons.org/ns#""
    // shortcut: "cc" (vai "cc:") vai ":"

    if (!prefixName) {
        console.error(`Missing prefix name`);
        return;
    }
    if (!prefixValue) {
        console.error(`Missing prefix value`);
        return;
    }

    if (!/^(\w[a-z0-9]*)?:?$/.test(prefixName)) {
        console.error(`Bad prefix name ${prefixName}`);
        return;
    }

    try {
        if (prefixName === ':') {
            await setDefaultNS(prefixValue);
            return;
        }
        
        let normalizedName = prefixName;
        if (prefixName.endsWith(':')) {
            normalizedName = prefixName.slice(0, prefixName.length - 1);
        }

        let idName = NS_NAME_TO_ID.get(normalizedName);
        let idValue = NS_VALUE_TO_ID.get(prefixValue);

        if (idName && idValue) {
            if (idName === idValue) {
                // nothing to do
            } else {
                // delete idName, update idValue
                await db.none(`delete from ${dbSchema}.ns where id = $1`, [ idName ]);
                await db.none(`update ${dbSchema}.ns set name = $1, is_local = false where id = $2`, [ normalizedName, idValue ]);
                rememberPrefix(idValue, normalizedName, prefixValue);
            }
        } else if (idName && !idValue) {
            // update idName set idValue
            await db.none(`update ${dbSchema}.ns set name = $1, is_local = false where id = $2`, [ normalizedName, idName ]);
            rememberPrefix(idName, normalizedName, prefixValue);
        } else if (!idName && idValue) {
            // update idValue set idName
            await db.none(`update ${dbSchema}.ns set name = $1, is_local = false where id = $2`, [ normalizedName, idValue ]);
            rememberPrefix(idValue, normalizedName, prefixValue);
        } else { // not name, not value
            // insert idName, idValue
            let newId = (await db.one(`insert into ${dbSchema}.ns (name, value, is_local) values ($1, $2, false) returning id`, [ normalizedName, prefixValue ])).id;
            rememberPrefix(newId, normalizedName, prefixValue);
        }

    } catch(err) {
        console.error(err);
    }
}

const addOneParameter = async (param_name, param_value) => {
    if (!param_name) return;
    if (!param_value) return;

    let name = param_name.trim();

    try {
        if (typeof param_value !== 'string') {
            await db.none(`INSERT INTO ${dbSchema}.parameters
                (name, jsonvalue)
                VALUES ($1, $2)
                ON CONFLICT ON CONSTRAINT parameters_name_key
                DO UPDATE SET jsonvalue = $2
            `,
                [
                    name,
                    // param_value,
                    JSON.stringify(param_value),
                ]);
            return;
        }

        try {
            let parsed = JSON.parse(param_value);
            await db.none(`INSERT INTO ${dbSchema}.parameters
                (name, jsonvalue)
                VALUES ($1, $2)
                ON CONFLICT ON CONSTRAINT parameters_name_key
                DO UPDATE SET jsonvalue = $2
            `,
                [
                    name,
                    parsed,
                ]);
            return;
        } catch (err) {
            console.log(`not a JSON value for parameter ${col.yellow(name)}; will be stored as text`);
        }

        await db.none(`INSERT INTO ${dbSchema}.parameters
            (name, textvalue)
            VALUES ($1, $2)
            ON CONFLICT ON CONSTRAINT parameters_name_key
            DO UPDATE SET textvalue = $2
        `,
            [
                name,
                param_value,
            ]);

    } catch (err) {
        console.error(err);
    }

}

const findDefaultTreeProfileName = async () => {
    try {
        let defaultTreeProfileName = (await db.one(`SELECT id FROM ${registrySchema}.tree_profiles WHERE is_default`, [])).profile_name;
        return defaultTreeProfileName;
    } catch {
        console.error(`could not read the default tree profile name; using default`);
        return 'default';
    }
}

const addParameters = async (params) => {
    const parameters = {
        display_name_default: process.env.SCHEMA_DISPLAY_NAME ?? process.env.DB_SCHEMA,
        db_schema_name: process.env.DB_SCHEMA,
        schema_description: process.env.SCHEMA_DESCRIPTION,
        endpoint_url: process.env.SPARQL_URL ?? params.endpointUrl,
        named_graph: process.env.NAMED_GRAPH ?? params.graphName,
        endpoint_public_url: process.env.PUBLIC_URL,
        schema_kind: process.env.SCHEMA_KIND || 'default',
        endpoint_type: process.env.ENDPOINT_TYPE || 'generic',
        tree_profile_name: await findDefaultTreeProfileName(),
        schema_extraction_details: params,
        schema_import_datetime: new Date(),
        schema_importer_version: IMPORTER_VERSION,
    }

    for (let key in parameters) {
        console.log(`Adding parameter ${col.yellow(key)} with value ${col.yellow(parameters[key])}`);
        await addOneParameter(key, parameters[key]);
    }

    return parameters;
}

const printStats = async () => {
    try {
        const TABLES = [ 'classes', 'properties', 'datatypes', 'cc_rels', 'cp_rels', 'pd_rels', 'pp_rels', 'cpd_rels', 'cpc_rels', 'ns', 'class_annots', 'property_annots' ];
        let stats = {}
        for (let tn of TABLES) {
            let n = Number.parseInt((await db.one(`select count(*) from ${dbSchema}.${tn}`)).count, 10);
            stats[tn] = n;
        }

        console.log(col.blue('\n=== Imported schema stats ==='));
        console.log(JSON.stringify(stats, null, 2));
    
    } catch (err) {
        console.error('error obtaining schema stats');
        console.error(err);
    }
}

const init = async () => {
    try {
        const nsData = await db.many(`SELECT * FROM ${dbSchema}.ns`);
        console.log(`${col.yellow(nsData.length)} ns entries loaded`);
        for (let row of nsData) {
            rememberPrefix(row.id, row.name, row.value);
        }

        const atData = await db.many(`SELECT * FROM ${dbSchema}.annot_types`);
        console.log(`${col.yellow(atData.length)} annotation types loaded`);
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

    // prefixes
    if (data.Prefixes) {
        for (const pref of data.Prefixes) {
            await addPrefixShortcut(pref.namespace, pref.prefix);
        }
    }

    // classes
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

    // properties
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
    // schema parameters
/*
    // old style:
    {
      "name": "minimalAnalyzedClassSize",
      "value": "1"
    },
    {
      "name": "classificationProperties",
      "value": "[http://www.w3.org/1999/02/22-rdf-syntax-ns#type, http://data.nobelprize.org/terms/category, http://data.nobelprize.org/terms/year, http://xmlns.com/foaf/0.1/gender]"
    }

    // new style:
    "Parameters": {
        "correlationId": "7494937434712105732",
        "endpointUrl": "http://85.254.199.72:8890/sparql",
        "calculateSubClassRelations": true,
        "calculateCardinalitiesMode": "propertyLevelAndClassContext",
        "checkInstanceNamespaces": false,
        "minimalAnalyzedClassSize": 1,
        "classificationProperties": [
        "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
        ],
        "includedLabels": [],
        ...
    }
*/
    let jsonParams = typeof data.Parameters === 'object'
        ? Array.isArray(data.Parameters)
            ? Object.fromEntries(data.Parameters.map(x => [ x.name, x.value ])) 
            : data.Parameters
        : {}

    const effectiveParams = await addParameters(jsonParams);

    await printStats();

    return effectiveParams;
}

module.exports = {
    importFromJSON,
}