const ProgressBar = require('progress')
const debug = require('debug')('import')
const fetch = require('node-fetch');
const col = require('ansi-colors')
const fs = require('node:fs/promises')
const path = require('node:path')

const { CC_REL_TYPE, CP_REL_TYPE, PP_REL_TYPE, NS_STATS_TYPE } = require('./type-constants')
const { logInfo, logError } = require('./util.js')

const { DB_CONFIG, db } = require('../config');

const dbSchema = process.env.DB_SCHEMA;
const INPUT_FILE = process.env.INPUT_FILE;
const registrySchema = process.env.REGISTRY_SCHEMA || 'public';

const IMPORTER_VERSION = '2026-05-20-2';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let auto_ns_counter = 1;

const NS_VALUE_TO_ID = new Map(); // prefix --> ns_id
const NS_ID_TO_VALUE = new Map(); // ns_id --> prefix

const NS_NAME_TO_ID = new Map(); // abbr --> ns_id
const NS_ID_TO_NAME = new Map(); // ns_id -> abbr

const NS_NAME_TO_VALUE = new Map(); // abbr --> prefix
const NS_VALUE_TO_NAME = new Map(); // prefix --> abbr

const ASSUMED_PP_REL_COUNT = 100

const rememberPrefix = (id, name, value) => {
  NS_VALUE_TO_ID.set(value, id);
  NS_VALUE_TO_NAME.set(value, name);
  NS_ID_TO_VALUE.set(id, value);
  NS_ID_TO_NAME.set(id, name);
  NS_NAME_TO_ID.set(name, id);
  NS_NAME_TO_VALUE.set(name, value);

  if (name === '') {
    NS_NAME_TO_ID.set(':', id);
    NS_NAME_TO_VALUE.set(':', value);
  }
}


function roundUpToSingleDigitPower(num) {
  if (num <= 0) return 0;

  // 1. Find the exponent (n)
  const exponent = Math.floor(Math.log10(num));
  const magnitude = Math.pow(10, exponent);

  // 2. Extract and round 'd' up to the next integer
  const d = Math.ceil(num / magnitude);

  // 3. Reconstruct d * 10^n
  return d * magnitude;
}
const generateAbbr = prefix => {
  const P1 = /http:\/\/www\.w3\.org\/2002\/(\d+)\/owl#/;
  let m = P1.exec(prefix);
  if (m) {
    return `owl_${m[1]}`;
  }
  return `n_${auto_ns_counter++}`;
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
        logInfo(`Found abbreviation ${col.yellow(m[1])} for the prefix ${col.yellow(prefix)}`);
        return m[1];
      }
    }
  } catch (err) {
    logError(err);
    // process.exit(1);
  }
  return null;
}

const getAbbrFromPublic = async prefixValue => {
  let r = await db.any(`select * from public.ns_prefixes where prefix = $1 order by id`, [prefixValue]);
  if (r.length > 0) {
    return r[0].abbr;
  }
}

const getAbbrFromPublicList = async prefixValue => {
  let r = await db.any(`select * from public.ns_list where ns = $1 order by id`, [prefixValue]);
  if (r.length > 0) {
    return r[0].prefix_main;
  }
}

const resolveNsPrefix = async (prefixValue, prefixAbbr = null) => {
  if (NS_VALUE_TO_ID.has(prefixValue)) {
    return NS_VALUE_TO_ID.get(prefixValue);
  }
  try {
    let resolvedAbbr = prefixAbbr;
    if (!resolvedAbbr) {
      resolvedAbbr = await getAbbrFromPublicList(prefixValue);
    }
    if (!resolvedAbbr) {
      resolvedAbbr = await getAbbrFromPublic(prefixValue);
    }
    if (!resolvedAbbr) {
      resolvedAbbr = await getAbbrFromTheWeb(prefixValue);
    }
    if (!resolvedAbbr) {
      resolvedAbbr = generateAbbr(prefixValue);
    }

    let id = (await db.one(
      `INSERT INTO ${dbSchema}.ns (value, name) values ($1, $2)
      ON CONFLICT ON CONSTRAINT ns_name_key
      DO UPDATE SET value = $1
      RETURNING id`,
      [
        prefixValue,
        resolvedAbbr
      ])).id;

    rememberPrefix(id, resolvedAbbr, prefixValue);

    return id;

  } catch (err) {
    logError(err);
  }
}

const splitIri = iri => {
  if (!iri || typeof iri !== 'string') throw new Error('bad iri');

  let pos = iri.indexOf('#');
  if (pos >= 0) return [iri.slice(0, pos + 1), iri.slice(pos + 1)];
  pos = iri.lastIndexOf('/');
  if (pos >= 0) return [iri.slice(0, pos + 1), iri.slice(pos + 1)];
  pos = iri.lastIndexOf(':');
  if (pos >= 0) return [iri.slice(0, pos + 1), iri.slice(pos + 1)];

  return [iri, ''];
}

const getLocalName = iri => {
  if (!iri || typeof iri !== 'string') return null;

  let [prefix, localName] = splitIri(iri);
  return localName;
}

const DATATYPES_BY_IRI = new Map(); // iri -> datatype_id
const DATATYPES_BY_SHORT_IRI = new Map(); // abbr:localName -> datatype_id

const resolveDatatypeByShortIri = shortIri => DATATYPES_BY_SHORT_IRI.get(shortIri);
const resolveDatatypeByIri = iri => DATATYPES_BY_IRI.get(iri);

const badDatatypeShortIriCollection = {}
const reportBadDatatypeShortIri = badIri => {
  if (badDatatypeShortIriCollection[badIri]) {
    badDatatypeShortIriCollection[badIri] += 1
  } else {
    badDatatypeShortIriCollection[badIri] = 1
  }
}

const printBadDatatypeIrisIfExist = () => {
  if (Object.keys(badDatatypeShortIriCollection).length === 0) return

  logError(`\n${Object.keys(badDatatypeShortIriCollection).length} bad datatype IRIs detected:`)
  for (const k in badDatatypeShortIriCollection) {
    logError(badDatatypeShortIriCollection[k])
  }
}

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
    logError('Bad data type short IRI:', shortIri);
    return null;
  }

  let [abbr, localName] = parts;

  if (localName.startsWith('//')) {
    // šis droši vien ir datu tipa garais IRI
    logInfo(`long IRI ${shortIri} provided where abbr:local_name expected`);
    return await addDatatypeByIri(shortIri);
  }

  let prefix = NS_NAME_TO_VALUE.get(abbr);

  if (!prefix) {
    logError(`Unknown short prefix: ${abbr}`);
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

  let [prefix, localName] = splitIri(iri);
  let ns_id = NS_VALUE_TO_ID.get(prefix);

  if (!ns_id) {
    logInfo(`namespace not found for the prefix '${col.yellow(prefix)}'`);
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

  } catch (err) {
    logError(err)
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

  /// ?c.incomingTripleCount: 453
  /// ?c.propertiesInSchema: true
  /// ?c.IntersectionClasses: [ "https://swapi.co/vocabulary/Character" ]

  // c.distinctInstances: 95074
  // c.blankNodeCount: 2
  // c.incomingPropertiesOK: 5
  // c.outgoingPropertiesOK: 5

  // if (CLASSES.has(c.fullName)) {
  //     return CLASSES.get(c.fullName)
  // }

  let ns_id = (c.namespace !== undefined) ? (await resolveNsPrefix(c.namespace)) : null;
  let props_in_schema = (c.propertiesInSchema === undefined) ? true : c.propertiesInSchema;
  // let datatype_id = c.dataType ? DATATYPES_BY_IRI.get(c.dataType) : null;
  let datatype_id = (c.dataType !== undefined) ? (await addDatatypeByIri(c.dataType)) : null;

  let class_id;
  try {
    let cData;
    if (c.incomingPropertiesOK) {
      if (!cData) cData = {}
      cData.incoming_properties_ok = c.incomingPropertiesOK;
    }
    if (c.outgoingPropertiesOK) {
      if (!cData) cData = {}
      cData.outgoing_properties_ok = c.outgoingPropertiesOK;
    }
    class_id = (await db.one(`INSERT INTO ${dbSchema}.classes (
          iri, local_name, display_name, ns_id, cnt,
            props_in_schema, classification_property, is_literal, datatype_id, in_cnt,
            distinct_instances, blank_node_instances, data
            ) VALUES (
              $1, $2, $2, $3, $4,
              $5, $6, $7, $8, $9,
              $10, $11, $12
            ) RETURNING id`,
      [
        c.fullName,
        c.localName,
        ns_id,
        c.instanceCount,
        props_in_schema,
        c.classificationProperty,
        c.isLiteral,
        datatype_id,
        c.incomingTripleCount,
        c.distinctInstances,
        c.blankNodeCount,
        cData,
      ])).id;
    CLASSES.set(c.fullName, class_id);

    /// c.InstanceNamespaces : [ {
    ///   "namespace" : "http://www.wikidata.org/entity/",
    ///   "count" : 195
    /// } ]
    if (c.InstanceNamespaces) {
      for (const ns of c.InstanceNamespaces) {
        await addNamespaceStats(ns, NS_STATS_TYPE.CLASS, class_id, null);
      }
    }

  } catch (err) {
    logError(err);
  }

}

const addNamespaceStats = async ({ namespace, count }, type_id, class_id, property_id) => {
  let ns_id = await resolveNsPrefix(namespace);

  try {
    await db.none(`
            insert into ${dbSchema}.ns_stats (ns_id, type_id, cnt, class_id, property_id)
            values ($1, $2, $3, $4, $5)
            -- on conflict on constraint ns_stats_ns_type_uq
            -- do update set count = count + $3
            `,
      [ns_id, type_id, count, class_id, property_id]);
  } catch (err) {
    logError(err);
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

      } catch (err) {
        logError(err);
      }
    }
  }

  if (c.IntersectionClasses && c.IntersectionClasses.length > 0) {
    let class_id = getClassId(c.fullName);

    // vecajos spiegojumios c.IntersectionClasses ir string saraksts, jaunākos – { className, instanceCount} saraksts
    let objectMode = typeof c.IntersectionClasses[0] === 'object';

    for (const ic of c.IntersectionClasses) {
      let ic_id;
      let ic_count;
      if (objectMode) {
        ic_id = getClassId(ic.className);
        ic_count = ic.instanceCount;
      } else {
        ic_id = getClassId(ic);
        ic_count = null;
      }
      try {
        await db.none(`INSERT INTO ${dbSchema}.cc_rels (class_1_id, class_2_id, type_id, cnt) VALUES ($1, $2, 3, $3)`, [
          class_id,
          ic_id,
          ic_count,
        ]);

      } catch (err) {
        logError(err);
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
    logError(err);
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
        logError(err);
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
        logError(err);
      }
    }
  }
}

const getClassId = iri => {
  let id = CLASSES.get(iri);
  if (!id) {
    logError(`Could not find id for the class ${iri}`);
  }
  return id;
}

/**
 * Fixes the counts for partially successful explorations
 *
 * @param {*} cnt triple count obtained
 * @param {*} object_cnt object triple count obtained
 * @param {*} data_cnt data triple count obtained
 * @returns fixed counts as { cnt, object_cnt, data_cnt }
 */
function fix_cnt_values(p_cnt, p_object_cnt, p_data_cnt, maxTripleCountRounded) {
  let cnt = p_cnt;
  let object_cnt = p_object_cnt;
  let data_cnt = p_data_cnt;
  let pData;

  if (!cnt && maxTripleCountRounded) {
    cnt = maxTripleCountRounded;
    pData = { triple_count_inserted: true }
  }

  if (object_cnt && object_cnt > cnt) {
    if (!pData) pData = {}
    pData.object_cnt_orig = object_cnt
    object_cnt = cnt
  }
  if (data_cnt && data_cnt > cnt) {
    if (!pData) pData = {}
    pData.data_cnt_orig = data_cnt
    data_cnt = cnt
  }

  if (!object_cnt && !data_cnt) {
    if (!pData) pData = {}
    pData.object_cnt_assumed = true
    object_cnt = cnt;
    data_cnt = 0;
  } else if (object_cnt) {
    data_cnt = cnt - object_cnt;
  } else if (data_cnt) {
    object_cnt = cnt - data_cnt;
  }

  return { cnt, object_cnt, data_cnt, pData }
}

const PROPS_ID_BY_IRI = new Map(); // iri -> property_id
const PROPS_OBJ_BY_ID = new Map(); // id -> property
const addProperty = async (p, { maxTripleCountRounded }) => {
  // ?localName: "julPrecipitationDays"
  // ?namespace: "http://dbpedia.org/property/"
  // fullName: "http://dbpedia.org/property/julPrecipitationDays"
  // maxCardinality: 1, -1 -> max_cardinality
  // maxInverseCardinality: -1 -> inverse_max_cardinality
  // tripleCount: 1 -> cnt
  // dataTripleCount: 1 -> data_cnt
  // objectTripleCount: 0 -> object_cnt
  // closedDomain: true
  // closedRange: true

  // hasFollowersOK: 5
  // hasIncomingPropertiesOK: 5
  // hasOutgoingPropertiesOK: 5

  // SourceClasses[]:
  //   ...
  // TargetClasses[]:
  //   ...
  // DataTypes[]:
  //  ...

  let ns_id = await resolveNsPrefix(p.namespace);

  let property_id;

  try {
    let { cnt, object_cnt, data_cnt, pData } = fix_cnt_values(
      p.tripleCount,
      p.objectTripleCount,
      p.dataTripleCount,
      maxTripleCountRounded,
    );

    let domain_class_id = null;
    // if (p.closedDomain && p.SourceClasses) {
    //     const candidates = p.SourceClasses.filter(x => x.importanceIndex > 0);
    //     if (candidates.length === 1) {
    //         domain_class_id = getClassId(candidates[0].classFullName);
    //     }
    // }
    if (p.SourceClasses) { //MMM vai te nevajag veco nosacījumu?
      const candidates = p.SourceClasses.filter(x => x.isPrincipal === true);
      if (candidates.length === 1) {
        domain_class_id = getClassId(candidates[0].classFullName);
        if (candidates[0].principalAssertedSize) {
          if (!pData) pData = {}
          pData.domain_asserted_size = candidates[0].principalAssertedSize
          pData.domain_is_indirect = true
        }
      }
    }
    let range_class_id = null;
    // if (p.closedRange && p.dataTripleCount === 0 && p.TargetClasses) {
    //     const candidates = p.TargetClasses.filter(x => x.importanceIndex > 0);
    //     if (candidates.length === 1) {
    //         range_class_id = getClassId(candidates[0].classFullName);
    //     }
    // }
    if (p.TargetClasses) { //MMM vai te nevajag veco nosacījumu?
      const candidates = p.TargetClasses.filter(x => x.isPrincipal === true);
      if (candidates.length === 1) {
        range_class_id = getClassId(candidates[0].classFullName);
        if (candidates[0].principalAssertedSize) {
          if (!pData) pData = {}
          pData.range_asserted_size = candidates[0].principalAssertedSize
          pData.range_is_indirect = true
        }
      }
    }

    let has_followers_ok = false
    if (p.hasFollowersOK || p.hasFollowersOK === 0) {
      if (!pData) pData = {}
      pData.has_followers_ok = p.hasFollowersOK
      has_followers_ok = true
    }

    let has_incoming_props_ok = false
    if (p.hasIncomingPropertiesOK || p.hasIncomingPropertiesOK === 0) {
      if (!pData) pData = {}
      pData.has_common_objects_ok = p.hasIncomingPropertiesOK
      has_incoming_props_ok = true
    }

    let has_outgoing_props_ok = false
    if (p.hasOutgoingPropertiesOK || p.hasOutgoingPropertiesOK === 0) {
      if (!pData) pData = {}
      pData.has_common_subjects_ok = p.hasOutgoingPropertiesOK
      has_outgoing_props_ok = true
    }

    if (p.sourceClassesOK) {
      if (!pData) pData = {}
      pData.source_classes_ok = p.sourceClassesOK
    }

    if (p.targetClassesOK) {
      if (!pData) pData = {}
      pData.target_classes_ok = p.targetClassesOK
    }

    let source_cover_complete = p.closedDomain || false
    if (p.closedSourceAssertedSize) {
      source_cover_complete = true
      if (!pData) pData = {}
      pData.closed_source_asserted_size = p.closedSourceAssertedSize
      pData.closed_source_is_indirect = true
    }

    let target_cover_complete = p.closedRange || false
    if (p.closedTargetAssertedSize) {
      target_cover_complete = true
      if (!pData) pData = {}
      pData.closed_target_asserted_size = p.closedTargetAssertedSize
      pData.closed_target_is_indirect = true
    }

    let max_cardinality = p.maxCardinality
    if (p.maxCardinality1AssertionSize) {
      max_cardinality = 1
      if (!pData) pData = {}
      pData.max_cardinality_1_asserted_size = p.maxCardinality1AssertionSize
      pData.max_cardinality_1_is_indirect = true
    }

    let inverse_max_cardinality = p.maxInverseCardinality
    if (p.maxInverseCardinality1AssertionSize) {
      inverse_max_cardinality = 1
      if (!pData) pData = {}
      pData.inverse_max_cardinality_1_asserted_size = p.maxInverseCardinality1AssertionSize
      pData.inverse_max_cardinality_1_is_indirect = true
    }

    property_id = (await db.one(`INSERT INTO ${dbSchema}.properties
            (iri, ns_id, local_name, display_name,
                cnt, object_cnt, data_cnt,
                max_cardinality, inverse_max_cardinality,
                source_cover_complete, target_cover_complete,
                domain_class_id, range_class_id,
                data,
                has_followers_ok, has_outgoing_props_ok, has_incoming_props_ok,
                distinct_subjects, distinct_objects, distinct_triples, blank_node_subjects, blank_node_objects)
            VALUES ($1, $2, $3, $3,
                $4, $5, $6,
                $7, $8,
                $9, $10,
                $11, $12,
                $13,
                $14, $15, $16,
                $17, $18, $19, $20, $21)
            RETURNING id`,
      [
        p.fullName, ns_id, p.localName,
        // p.tripleCount, p.objectTripleCount, p.dataTripleCount,
        cnt, object_cnt, data_cnt,
        max_cardinality, inverse_max_cardinality,
        source_cover_complete, target_cover_complete,
        domain_class_id, range_class_id,
        pData,
        has_followers_ok, has_outgoing_props_ok, has_incoming_props_ok,
        p.distinctSubjectsCount, p.distinctObjectsCount, p.distinctTriples, p.blankNodeSubjects, p.blankNodeObjects,
      ])).id;
    PROPS_ID_BY_IRI.set(p.fullName, property_id);
    PROPS_OBJ_BY_ID.set(property_id, p);
    // for easier access in next passes
    p.cnt = cnt;
    p.object_cnt = object_cnt;
    p.data_cnt = data_cnt;


    // "SubjectInstanceNamespaces" : [ {
    //     "namespace" : "https://swapi.co/resource/human/",
    //     "count" : 22
    // },
    if (p.SubjectInstanceNamespaces) {
      for (const ns of p.SubjectInstanceNamespaces) {
        await addNamespaceStats(ns, NS_STATS_TYPE.SUBJECT, null, property_id)
      }
    }

    // "ObjectInstanceNamespaces" : [ {
    //     "namespace" : "https://swapi.co/resource/human/",
    //     "count" : 34
    // }
    if (p.ObjectInstanceNamespaces) {
      for (const ns of p.ObjectInstanceNamespaces) {
        await addNamespaceStats(ns, NS_STATS_TYPE.OBJECT, null, property_id)
      }
    }

    // "hasOutgoingPropertiesOK" : true | false,
    // "hasIncomingPropertiesOK" : true | false,
    // "hasFollowersOK" : true | false,
    if (p.hasOutgoingPropertiesOK === false || !p.hasOutgoingPropertiesOK) {
      await db.none(`update ${dbSchema}.properties set has_outgoing_props_ok = false where id = $1`, [property_id]);
    }
    if (p.hasIncomingPropertiesOK === false || !p.hasIncomingPropertiesOK) {
      await db.none(`update ${dbSchema}.properties set has_incoming_props_ok = false where id = $1`, [property_id]);
    }
    if (p.hasFollowersOK === false || !p.hasFollowersOK) {
      await db.none(`update ${dbSchema}.properties set has_followers_ok = false where id = $1`, [property_id]);
    }

  } catch (err) {
    logError(err);
  }


  // p.SourceClasses[] -> cp_rels(2=outgoing); p.SourceClasses[].DataTypes[] -> cpd_rels; p.ClassPairs -> cpc_rels
  //      classFullName: "http://dbpedia.org/class/yago/YagoLegalActorGeo" -> resolve to class_id
  //      tripleCount: 33 -> cnt
  //      tripleCountBase: 3 -> cnt_base
  //      dataTripleCount: 33 -> data_cnt
  //      objectTripleCount: 0 -> object_cnt
  //      minCardinality: 0 -> min_cardinality
  //      maxCardinality: -1 -> max_cardinality (?specapstrāde -1?)
  //      closedRange: true
  //      isPrincipal: true
  //      importanceIndex: 1
  //      DataTypes[]
  //          ...
  let property_domain_class_id;
  if (p.SourceClasses) {
    for (const srcClass of p.SourceClasses) {
      let cpData;
      const class_id = getClassId(srcClass.classFullName);

      try {
        let _tmp = await db.one(`select cnt from ${dbSchema}.classes where id = $1`, [class_id])
        // for use in forlmulae later in the code
        srcClass.instanceCount = Number.parseInt(_tmp.cnt)
      } catch (err) {
        logError('Could not read the class instance count')
        logError(err)
      }

      if (srcClass.isPrincipal) {
        property_domain_class_id = class_id;
      }

      let principalTargetClassId = null;
      if (p.ClassPairs) {
        for (const pair of p.ClassPairs) {
          if (pair.SourceClass !== srcClass.classFullName) continue;
          if (pair.isPrincipalTarget) {
            principalTargetClassId = getClassId(pair.TargetClass);
            if (pair.targetPrincipalAssertedSize) {
              if (!cpData) cpData = {}
              cpData.principal_asserted_size = pair.targetPrincipalAssertedSize
              cpData.principal_is_indirect = true
            }
          }
        }
      }

      let cp_rel_id;
      try {
        let { cnt, object_cnt, data_cnt } = fix_cnt_values(
          srcClass.tripleCount,
          srcClass.objectTripleCount,
          srcClass.dataTripleCount
        );

        let jauns1 = false
        let jauns2 = false
        if (srcClass.tripleCountBase) {
          if (srcClass.objectTripleCount && srcClass.dataTripleCount) {
            cnt = srcClass.objectTripleCount + srcClass.dataTripleCount
            jauns1 = true
          }

          if (!srcClass.tripleCount && !jauns1 && srcClass.tripleCountBase) {
            // formula
            if (srcClass.instanceCount !== undefined && srcClass.tripleCountBase !== undefined) {
              cnt = Math.floor(Math.pow(srcClass.instanceCount / srcClass.tripleCountBase * Math.log(2), 1 / 3))
              jauns2 = true
              if (!cpData) cpData = {}
              cpData.estimated_from_zero = true
            } else {
              // log
              logError(`Missing arguments in formula 1: "${srcClass.instanceCount}" "${srcClass.tripleCountBase}"`)
              logError(`Context: ${JSON.stringify(srcClass, null, 2)}`)
            }
          }
          if (!jauns1 && !jauns2) {
            // formula
            if (srcClass.tripleCount !== undefined && srcClass.tripleCountBase !== undefined && srcClass.instanceCount !== undefined) {
              cnt = Math.max(Math.floor(srcClass.tripleCount / srcClass.tripleCountBase * srcClass.instanceCount), srcClass.tripleCount)
            } else {
              // log
              logError(`Missing arguments in formula 2: "${srcClass.tripleCount}" "${srcClass.tripleCountBase}" "${srcClass.instanceCount}"`)
              logError(`Context: ${JSON.stringify(srcClass, null, 2)}`)
            }
          }
          if (srcClass.tripleCountBase) {
            if (!cpData) cpData = {}
            cpData.triple_count_raw = srcClass.tripleCount
            cpData.triple_count_base = srcClass.tripleCountBase
          }
        }


        // if (srcClass.tripleCountBase) {
        //  // formula
        //   cnt = Math.max(srcClass.tripleCount, Math.floor(srcClass.tripleCount / srcClass.tripleCountBase * c.instanceCount));
        //   if (!cpData) cpData = {}
        //   cpData.triple_count_raw = srcClass.tripleCount
        //   cpData.triple_count_base = srcClass.tripleCountBase
        // }

        let sub_cover_complete = srcClass.closedRange || false
        if (srcClass.closedTargetAssertedSize) {
          sub_cover_complete = true
          if (!cpData) cpData = {}
          cpData.closed_target_asserted_size = srcClass.closedTargetAssertedSize
          cpData.closed_target_is_indirect = true
        }

        let min_cardinality = srcClass.minCardinality
        if (srcClass.minCardinality1AssertionSize) {
          min_cardinality = 1
          if (!cpData) cpData = {}
          cpData.min_cardinality_1_asserted_size = srcClass.minCardinality1AssertionSize
          cpData.min_cardinality_1_is_indirect = true
        }

        let max_cardinality = srcClass.maxCardinality
        if (srcClass.maxCardinality1AssertionSize) {
          max_cardinality = 1
          if (!cpData) cpData = {}
          cpData.max_cardinality_1_asserted_size = srcClass.maxCardinality1AssertionSize
          cpData.max_cardinality_1_is_indirect = true
        }

        let distinct_subjects = srcClass.distinctSubjectsCount

        cp_rel_id = (await db.one(`INSERT INTO ${dbSchema}.cp_rels (
                    class_id, property_id, type_id,
                    cnt, object_cnt, data_cnt,
                    min_cardinality, max_cardinality,
                    cover_set_index,
                    details_level,
                    sub_cover_complete,
                    principal_class_id,
                    cnt_base, data,
                    distinct_subjects)
                VALUES ($1, $2, $3,
                    $4, $5, $6,
                    $7, $8,
                    $9,
                    $10,
                    $11,
                    $12,
                    $13, $14,
                    $15) RETURNING id`,
          [
            class_id, property_id, CP_REL_TYPE.OUTGOING,
            // srcClass.tripleCount, srcClass.objectTripleCount, srcClass.dataTripleCount,
            cnt, object_cnt, data_cnt,
            min_cardinality, max_cardinality,
            srcClass.importanceIndex,
            p.ClassPairs ? 2 : 0,
            sub_cover_complete,
            principalTargetClassId,
            srcClass.tripleCountBase,
            cpData,
            distinct_subjects,
          ])).id;

      } catch (err) {
        logError(err);
      }

      //      DataTypes[]
      //          dataType: "rdf:langString"
      //          tripleCount: 33
      //          tripleCountBase: 1
      if (srcClass.DataTypes) {
        for (const dtr of srcClass.DataTypes) {
          try {
            await addDatatypeByShortIri(dtr.dataType);
            let datatype_id = resolveDatatypeByShortIri(dtr.dataType);
            if (!datatype_id) {
              reportBadDatatypeShortIri(dtr.dataType)
              continue
            }

            let cnt = dtr.tripleCount
            let cnt_base = dtr.tripleCountBase
            let cpdData;
            if (dtr.tripleCountBase) {
              // formula
              if (cnt !== undefined && cnt_base !== undefined && srcClass.dataTripleCount !== undefined) {
                cnt = Math.max(cnt, Math.floor(cnt / cnt_base * srcClass.dataTripleCount))
              } else {
                // log
                logError(`Missing arguments in formula 3: "${cnt}" "${cnt_base}" "${srcClass.dataTripleCount}"`)
                logError(`Context: ${JSON.stringify(dtr, null, 2)}`)
              }
              if (!cpdData) cpdData = {}
              cpdData.triple_count_raw = dtr.tripleCount
              cpdData.triple_count_base = dtr.tripleCountBase
            }

            await db.none(`INSERT INTO ${dbSchema}.cpd_rels (cp_rel_id, datatype_id, cnt, cnt_base, data)
                            VALUES ($1, $2, $3, $4, $5)
                            ON CONFLICT ON CONSTRAINT cpd_rels_cp_rel_id_datatype_id_key DO NOTHING`,
              [
                cp_rel_id,
                datatype_id,
                cnt,
                cnt_base,
                cpdData,
              ]);

          } catch (err) {
            logError(err);
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
            logError(err);
          }
        }
      }
    }
  }

  // store domain_class_id if found
  if (property_domain_class_id) {
    try {
      await db.none(`UPDATE ${dbSchema}.properties SET domain_class_id = $1 WHERE id = $2`, [
        property_domain_class_id,
        property_id,
      ])
    } catch (err) {
      logError(err);
    }
  }

  // p.TargetClasses[] -> cp_rels(1=incoming), p.ClassPairs -> cpc_rels
  //      classFullName: "http://www.europeana.eu/schemas/edm/WebResource" -> resolve to class_id
  //      tripleCount: 1 -> cnt
  //      tripleCountBase: 3 -> cnt_base
  //      closedDomain: true
  //      isPrincipal: true
  //      importanceIndex: 1
  //      minInverseCardinality: 1 ?-> min_cardinality
  //      maxInverseCardinality: 1 ?-> max_cardinality
  let property_range_class_id;
  if (p.TargetClasses) {
    for (const targetClass of p.TargetClasses) {
      let cpData;
      const class_id = getClassId(targetClass.classFullName);

      try {
        let _tmp = await db.one(`select cnt from ${dbSchema}.classes where id = $1`, [class_id])
        // for use in forlmulae later in the code
        targetClass.instanceCount = Number.parseInt(_tmp.cnt)
      } catch (err) {
        logError('Could not read the class instance count')
        logError(err)
      }

      if (targetClass.isPrincipal) {
        property_range_class_id = class_id;
      }

      let principalSourceClassId = null;
      if (p.ClassPairs) {
        for (const pair of p.ClassPairs) {
          if (pair.TargetClass !== targetClass.classFullName) continue;
          if (pair.isPrincipalSource) {
            principalSourceClassId = getClassId(pair.SourceClass);
            if (pair.sourcePrincipalAssertedSize) {
              if (!cpData) cpData = {}
              cpData.principal_asserted_size = pair.sourcePrincipalAssertedSize
              cpData.principal_is_indirect = true
            }
          }
        }
      }

      let cp_rel_id;
      try {
        let { cnt, object_cnt, data_cnt } = fix_cnt_values(
          targetClass.tripleCount,
          undefined,
          undefined
        );

        let jauns1 = false
        let jauns2 = false
        if (targetClass.tripleCountBase) {
          if (targetClass.objectTripleCount && targetClass.dataTripleCount) {
            cnt = targetClass.objectTripleCount + targetClass.dataTripleCount
            jauns1 = true
          }

          if (!targetClass.tripleCount && !jauns1 && targetClass.tripleCountBase) {
            // formula
            if (targetClass.instanceCount !== undefined && targetClass.tripleCountBase !== undefined) {
              cnt = Math.floor(Math.pow(targetClass.instanceCount / targetClass.tripleCountBase * Math.log(2), 1 / 3))
              jauns2 = true
              if (!cpData) cpData = {}
              cpData.estimated_from_zero = true
            } else {
              // log
              logError(`Missing arguments in formula 4: "${targetClass.instanceCount}" "${targetClass.tripleCountBase}"`)
              logError(`Context: ${JSON.stringify(targetClass, null, 2)}`)
            }
          }
          if (!jauns1 && !jauns2) {
            // formula
            if (targetClass.tripleCount !== undefined && targetClass.tripleCountBase !== undefined && targetClass.instanceCount !== undefined) {
              cnt = Math.max(Math.floor(targetClass.tripleCount / targetClass.tripleCountBase * targetClass.instanceCount), targetClass.tripleCount)
            } else {
              // log
              logError(`Missing arguments in formula 5: "${targetClass.tripleCount}" "${targetClass.tripleCountBase}" "${targetClass.instanceCount}"`)
              logError(`Context: ${JSON.stringify(targetClass, null, 2)}`)
            }
          }
        }
        if (targetClass.tripleCountBase) {
          if (!cpData) cpData = {}
          cpData.triple_count_raw = targetClass.tripleCount
          cpData.triple_count_base = targetClass.tripleCountBase
        }

        // if (targetClass.tripleCountBase) {
        //  // formula
        //   cnt = Math.max(targetClass.tripleCount, Math.floor(targetClass.tripleCount / targetClass.tripleCountBase * c.instanceCount));
        //   if (!cpData) cpData = {}
        //   cpData.triple_count_raw = targetClass.tripleCount
        //   cpData.triple_count_base = targetClass.tripleCountBase
        // }

        let sub_cover_complete = targetClass.closedDomain || false
        if (targetClass.closedSourceAssertedSize) {
          sub_cover_complete = true
          if (!cpData) cpData = {}
          cpData.closed_source_asserted_size = targetClass.closedSourceAssertedSize
          cpData.closed_source_is_indirect = true
        }

        let min_cardinality = targetClass.minInverseCardinality
        if (targetClass.minInverseCardinality1AssertionSize) {
          min_cardinality = 1
          if (!cpData) cpData = {}
          cpData.inverse_min_cardinality_1_asserted_size = targetClass.minInverseCardinality1AssertionSize
          cpData.inverse_min_cardinality_1_is_indirect = true
        }

        let max_cardinality = targetClass.maxInverseCardinality
        if (targetClass.maxInverseCardinality1AssertionSize) {
          max_cardinality = 1
          if (!cpData) cpData = {}
          cpData.inverse_max_cardinality_1_asserted_size = targetClass.maxInverseCardinality1AssertionSize
          cpData.inverse_max_cardinality_1_is_indirect = true
        }

        let distinct_objects = targetClass.distinctObjectsCount

        cp_rel_id = (await db.one(`INSERT INTO ${dbSchema}.cp_rels (
                    class_id, property_id, type_id,
                    cnt, object_cnt, data_cnt,
                    min_cardinality, max_cardinality,
                    cover_set_index,
                    details_level,
                    sub_cover_complete,
                    principal_class_id,
                    cnt_base, data,
                    distinct_objects)
                VALUES ($1, $2, $3,
                    $4, $5, $6,
                    $7, $8,
                    $9,
                    $10,
                    $11,
                    $12,
                    $13, $14,
                    $15)
                RETURNING id`,
          [
            class_id, property_id, CP_REL_TYPE.INCOMING,
            // targetClass.tripleCount,
            cnt, object_cnt, data_cnt,
            min_cardinality, max_cardinality,
            targetClass.importanceIndex,
            p.ClassPairs ? 2 : 0,
            sub_cover_complete,
            principalSourceClassId,
            targetClass.tripleCountBase,
            cpData,
            distinct_objects,
          ])).id;

      } catch (err) {
        logError(err);
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
            logError(err);
          }
        }
      }

    }
  }

  // store domain_class_id if found
  if (property_range_class_id) {
    try {
      await db.none(`UPDATE ${dbSchema}.properties SET range_class_id = $1 WHERE id = $2`, [
        property_range_class_id,
        property_id,
      ])
    } catch (err) {
      logError(err);
    }
  }

  // p.DataTypes[] -> pd_rels
  //      dataType: "xsd:string"
  //      tripleCount: 1013999
  //      tripleCountBase: 2
  if (p.DataTypes) {
    for (const dtr of p.DataTypes) {
      try {
        await addDatatypeByShortIri(dtr.dataType)
        let datatype_id = resolveDatatypeByShortIri(dtr.dataType)

        let cnt = dtr.tripleCount
        let cnt_base = dtr.tripleCountBase
        let pdData;
        if (dtr.tripleCountBase) {
          // formula
          if (cnt !== undefined && cnt_base !== undefined && p.dataTripleCount !== undefined) {
            cnt = Math.max(cnt, Math.floor(cnt / cnt_base * p.dataTripleCount))
          } else {
            // log
            logError(`Missing arguments in formula 6: "${cnt}" "${cnt_base}" "${p.dataTripleCount}"`)
            logError(`Context: ${JSON.stringify(dtr, null, 2)}`)
          }
          if (!pdData) pdData = {}
          pdData.triple_count_raw = dtr.tripleCount
          pdData.triple_count_base = dtr.tripleCountBase
        }

        await db.none(`INSERT INTO ${dbSchema}.pd_rels (property_id, datatype_id, cnt, cnt_base)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT ON CONSTRAINT pd_rels_property_id_datatype_id_key DO NOTHING`,
          [
            property_id,
            datatype_id,
            cnt,
            cnt_base,
          ]);
      } catch (err) {
        logError(err);
      }
    }
  }


}

const addPropertyPairs = async p => {
  // Followers[],
  //  ...
  // IncomingProperties[],
  //  ...
  // OutgoingProperties[]
  //  ...

  // p.Followers[]
  //  propertyName: "http://dbpedia.org/property/date",
  //  tripleCount: 0
  //  tripleCountBase?: 3

  const this_prop_id = getPropertyId(p.fullName);

  if (p.Followers) {
    for (let pair of p.Followers) {
      // if (pair.tripleCount === 0) continue;
      let other_prop_id = getPropertyId(pair.propertyName)
      if (other_prop_id) {
        let cnt = pair.tripleCount
        let cnt_base = pair.tripleCountBase
        let ppData
        if (cnt && cnt_base) {
          if (!ppData) ppData = {}
          ppData.triple_count_raw = cnt
          ppData.triple_count_base = cnt_base
          // formula
          if (cnt !== undefined && cnt_base !== undefined && p.tripleCount !== undefined) {
            cnt = Math.max(cnt, Math.floor(cnt / cnt_base * p.tripleCount))
          } else {
            // log
            logError(`Missing arguments in formula 7: "${cnt}" "${cnt_base}" "${p.tripleCount}"`)
            logError(`Context: ${JSON.stringify(pair, null, 2)}`)
          }
        } else if (cnt_base && !cnt) {
          // formula
          if (p.tripleCount !== undefined && cnt_base !== undefined) {
            cnt = Math.floor(Math.pow(p.tripleCount / cnt_base * Math.log(2), 1 / 3))
            if (!ppData) ppData = {}
            ppData.triple_count_raw = cnt
            ppData.triple_count_base = cnt_base
            ppData.estimated_from_zero = true
          } else {
            // log
            logError(`Missing arguments in formula 8: "${p.tripleCount}" "${cnt_base}"`)
            logError(`Context: ${JSON.stringify(pair, null, 2)}`)
          }
        } else if (!cnt && !cnt_base) {
          // NOP
        }

        if (!cnt) {
          let otherProp = getPropertyById(other_prop_id)
          if (p.cnt && otherProp.cnt) {
            cnt = Math.floor(Math.pow(p.cnt * otherProp.cnt, 1 / 3))
          } else {
            cnt = ASSUMED_PP_REL_COUNT
            if (!ppData) ppData = {}
            ppData.is_assumed = true
          }
        }

        try {
          await db.none(`INSERT INTO ${dbSchema}.pp_rels (property_1_id, property_2_id, type_id, cnt, cnt_base, data)
                        VALUES ($1, $2, 1, $3, $4, $5)`,
            [
              this_prop_id,
              other_prop_id,
              cnt,
              cnt_base,
              ppData,
            ]);
        } catch (err) {
          logError(err);
        }
      }
    }
  }

  // propertyName: "http://dbpedia.org/ontology/deathPlace",
  // tripleCount: 3,
  // tripleCountBase?: 3

  if (p.IncomingProperties) {
    for (let pair of p.IncomingProperties) {
      // if (pair.tripleCount === 0) continue;
      let other_prop_id = getPropertyId(pair.propertyName)
      if (other_prop_id) {
        let cnt = pair.tripleCount
        let cnt_base = pair.tripleCountBase
        let ppData
        if (cnt && cnt_base) {
          if (!ppData) ppData = {}
          ppData.triple_count_raw = cnt
          ppData.triple_count_base = cnt_base
          // formula
          if (cnt !== undefined && cnt_base !== undefined && p.objectTripleCount !== undefined) {
            cnt = Math.max(cnt, Math.floor(cnt / cnt_base * p.objectTripleCount))
          } else {
            // log
            logError(`Missing arguments in formula 9: "${cnt}" "${cnt_base}" "${p.objectTripleCount}"`)
            logError(`Context: ${JSON.stringify(pair, null, 2)}`)
          }
        } else if (cnt_base && !cnt) {
          // formula
          if (p.objectTripleCount !== undefined && cnt_base !== undefined) {
            cnt = Math.floor(Math.pow(p.objectTripleCount / cnt_base * Math.log(2), 1 / 3))
            if (!ppData) ppData = {}
            ppData.triple_count_raw = cnt
            ppData.triple_count_base = cnt_base
            ppData.estimated_from_zero = true
          } else {
            // log
            logError(`Missing arguments in formula 10: "${p.objectTripleCount}" "${cnt_base}"`)
            logError(`Context: ${JSON.stringify(pair, null, 2)}`)
          }
        } else if (!cnt && !cnt_base) {
          // šim vajag second (i.e., third) pass
          pair.needsCountsFromReverse = true
          // continue
        }

        if (!cnt) {
          let otherProp = getPropertyById(other_prop_id)
          if (p.cnt && otherProp.cnt) {
            cnt = Math.floor(Math.pow(p.cnt * otherProp.cnt, 1 / 3))
          } else {
            cnt = ASSUMED_PP_REL_COUNT
            if (!ppData) ppData = {}
            ppData.is_assumed = true
          }
        }

        try {
          await db.none(`INSERT INTO ${dbSchema}.pp_rels (property_1_id, property_2_id, type_id, cnt, cnt_base, data)
                        VALUES ($1, $2, 3, $3, $4, $5)`,
            [
              this_prop_id,
              other_prop_id,
              cnt,
              cnt_base,
              ppData,
            ]);
        } catch (err) {
          logError(err);
        }
      }
    }
  }

  //  propertyName: "http://www.w3.org/ns/dcat#theme",
  //  tripleCount: 4,
  //  tripleCountBase?: 2

  if (p.OutgoingProperties) {
    for (let pair of p.OutgoingProperties) {
      // if (pair.tripleCount === 0) continue;
      let other_prop_id = getPropertyId(pair.propertyName)
      if (other_prop_id) {
        let cnt = pair.tripleCount
        let cnt_base = pair.tripleCountBase
        let ppData
        if (cnt && cnt_base) {
          if (!ppData) ppData = {}
          ppData.triple_count_raw = cnt
          ppData.triple_count_base = cnt_base
          // formula
          if (cnt !== undefined && cnt_base !== undefined && p.tripleCount !== undefined) {
            cnt = Math.max(cnt, Math.floor(cnt / cnt_base * p.tripleCount))
          } else {
            // log
            logError(`Missing arguments in formula 11: "${cnt}" "${cnt_base}" "${p.tripleCount}"`)
            logError(`Context: ${JSON.stringify(pair, null, 2)}`)
          }
        } else if (cnt_base && !cnt) {
          // formula
          if (p.tripleCount !== undefined && cnt_base !== undefined) {
            cnt = Math.floor(Math.pow(p.tripleCount / cnt_base * Math.log(2), 1 / 3))
            if (!ppData) ppData = {}
            ppData.triple_count_raw = cnt
            ppData.triple_count_base = cnt_base
            ppData.estimated_from_zero = true
          } else {
            // log
            logError(`Missing arguments in formula 12: "${p.tripleCount}" "${cnt_base}"`)
            logError(`Context: ${JSON.stringify(pair, null, 2)}`)
          }
        } else if (!cnt && !cnt_base) {
          // šim vajag second (i.e., third) pass
          pair.needsCountsFromReverse = true
          // continue
        }

        if (!cnt) {
          let otherProp = getPropertyById(other_prop_id)
          if (p.cnt && otherProp.cnt) {
            cnt = Math.floor(Math.pow(p.cnt * otherProp.cnt, 1 / 3))
          } else {
            cnt = ASSUMED_PP_REL_COUNT
            if (!ppData) ppData = {}
            ppData.is_assumed = true
          }
        }

        try {
          await db.none(`INSERT INTO ${dbSchema}.pp_rels (property_1_id, property_2_id, type_id, cnt, cnt_base, data)
                        VALUES ($1, $2, 2, $3, $4, $5)`,
            [
              this_prop_id,
              other_prop_id,
              cnt,
              cnt_base,
              ppData,
            ]);
        } catch (err) {
          logError(err);
        }
      }
    }
  }

}

const addCountsFromReversePP = async p => {
  const this_prop_id = getPropertyId(p.fullName);

  for (let [pairs, type_id] of [[p.IncomingProperties, 3], [p.OutgoingProperties, 2]]) {
    if (pairs) {
      for (let pair of pairs) {
        if (!pair.needsCountsFromReverse) continue
        let other_prop_id = getPropertyId(pair.propertyName)
        if (other_prop_id) {
          try {
            let pairFromDb = await db.one(`select * from ${dbSchema}.pp_rels where property_1_id = $1 and property_2_id = $2 and type_id = $3`, [
              other_prop_id,
              this_prop_id,
              type_id
            ])

            let { cnt, cnt_base, data } = pairFromDb
            let data2 = Object.assign({}, data, { is_reverse_count: true })
            if (!cnt) {
              cnt = ASSUMED_PP_REL_COUNT
              data2.is_assumed = true
            }

            await db.none(`insert into ${dbSchema}.pp_rels (property_1_id, property_2_id, type_id, cnt, cnt_base, data)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        on conflict on constraint pp_rels_property_1_id_property_2_id_type_id_key
                        do update set cnt = $4, cnt_base = $5, data = $6`, [
              this_prop_id,
              other_prop_id,
              type_id,
              cnt,
              cnt_base,
              data2,
            ])
          } catch (err) {
            logError(err);
          }
        }
      }
    }
  }
}

const postProcessingAfterImport = async (params) => {
  logInfo('Post processing imported schema');
  logInfo('Import parameters:', params);

  try {
    const sql1 = `update ${dbSchema}.classes
            set classification_property_id = p.id
            from ${dbSchema}.properties p where p.iri = classification_property`;
    await db.none(sql1);


    // Šeit #1 un #2 ir true, ja propertija ir visas spiegošnas parametros iekš principalClassificationProperties
    //   vai classificationPropertiesWithConnectionsOnly, pretējā gadījumā #1 un #2 ir false.

    const specialPropIRIs = new Set();
    for (let p of params.principalClassificationProperties ?? []) {
      specialPropIRIs.add(p);
    }
    for (let p of params.classificationPropertiesWithConnectionsOnly ?? []) {
      specialPropIRIs.add(p)
    }
    logInfo(specialPropIRIs);
    // const specialPropIds = [];
    // for (let p of specialPropIRIs) {
    //     let id = (await db.one(`select id from ${dbSchema}.properties where iri = $1`, [ p ])).id;
    //     specialPropIds.push(id);
    // }
    // logInfo(specialPropIds);

    // vispirms visiem atbilstošajiem uz false
    const sql2a = `update ${dbSchema}.properties
        set is_classifier = true,
            use_in_class = false,
            values_have_cp = false
        where id in (select classification_property_id from ${dbSchema}.classes)`;
    await db.none(sql2a);

    // un tad dažiem vēl vairāk atbilstošajiem nomainām uz true
    for (const specialPropIRI of specialPropIRIs) {
      const sql2b = `update ${dbSchema}.properties
            set is_classifier = true,
                use_in_class = true,
                values_have_cp = true
            where id in (select classification_property_id from ${dbSchema}.classes)
                and iri = $1`;
      await db.none(sql2b, [specialPropIRI]);

    }


    // Šeit #3 ir iri galvenajai (pirmajai) klasifikācijas propertijai, meklējot vispirms pa
    //  principalClassificationProperties un tad ja neatrod, tad pa classificationPropertiesWithConnectionsOnly
    //  (simpleClassificationProperties nebūtu jāskatās);
    //
    // katrā no šīm grupām: ja ir rdf:type, tad ņem to; ja rdf:type nav, bet ir cita(s), tad ņem no saraksta pirmo.

    const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
    let n3iri;
    const p1 = params.principalClassificationProperties ?? [];
    if (p1.length > 0) {
      if (p1.includes(RDF_TYPE)) {
        n3iri = RDF_TYPE;
      } else {
        n3iri = p[0];
      }
    }

    // ko darīt, ja n3iri joprojām nav?
    if (!n3iri) {
      n3iri = RDF_TYPE;
    }

    const sql3 = `update ${dbSchema}.properties
            set classif_prefix = local_name
            where id in (select classification_property_id from ${dbSchema}.classes)
                and not (iri = $1)`;
    await db.none(sql3, [n3iri]);


    const sql4 = `update ${dbSchema}.classes
            set classification_adornment = p.classif_prefix
            from ${dbSchema}.properties p
            where p.id = classification_property_id
                and p.classif_prefix is not null`;

    await db.none(sql4);

    // papildinājumi atbilstoši vēlmēm rocket chat 2025-02-21

    // shēmas importierī šādām klasēm, kas atbilst simpleClassificationProperties ir jāuzstāda
    // self_cp_rels = false, kā arī jāuzliek atbilstošais principal_super_class_id (ja iespējams),
    // to dara, atrodot mazāko no virsklasēm (ja tāda ir), kas ir šai klasei, un kas ir virsklase
    // šai "nestandarta" klasei (ja neatrod, tad paliek tukšs lauks)

    let sql5 = `
          update ${dbSchema}.classes
          set self_cp_rels = false
          from ${dbSchema}.properties pp
          where classification_property_id = pp.id and values_have_cp = false`;

    await db.none(sql5);

    // situācijā, ja klasei self_cp_rels=false, klasei saistītās propertijas tiek ņemtas
    // no klases ar principal_super_class_id (ja tas norādīts), vai arī no klases klasifikācijas
    // propertijas incoming (ienākošajām saitēm) un following (izejošajām saitēm) pp_rels

    let sql6 = `
          update ${dbSchema}.classes cc
          set principal_super_class_id = (
            select ss.id
            from ${dbSchema}.classes ss, ${dbSchema}.cc_rels subrel
             	where subrel.class_1_id = cc.id
                and subrel.class_2_id = ss.id
                and subrel.type_id in (1,2)
             		and ss.classification_property_id in (
                  select id
                  from ${dbSchema}.properties
                  where values_have_cp = true
                )
              order by ss.cnt
              limit 1
            )
          where self_cp_rels = false`;

    await db.none(sql6);

  } catch (err) {
    logError('Error while post processing imported schema');
    logError(err);
  }

}

const getPropertyId = iri => {
  let id = PROPS_ID_BY_IRI.get(iri);
  if (!id) {
    logError(`Could not find id for the property ${iri}`);
  }
  return id;
}

const getPropertyById = id => {
  let obj = PROPS_OBJ_BY_ID.get(id);
  if (!obj) {
    logError(`Could not find property object for the id ${id}`);
  }
  return obj;
}

const setDefaultNS = async prefixValue => {
  await db.none(`UPDATE ${dbSchema}.ns SET is_local = false`);
  let localId = (await db.one(`INSERT INTO ${dbSchema}.ns (name, value, is_local) VALUES ('', $1, true)
        ON CONFLICT ON CONSTRAINT ns_value_key
        DO UPDATE SET name = '', value = $1, is_local = true
        RETURNING id`, [prefixValue])).id;
  rememberPrefix(localId, '', prefixValue);
}

const addPrefixAbbr = async (prefixValue, prefixName) => {
  // namespace: "https://creativecommons.org/ns#""
  // shortcut: "cc" (vai "cc:") vai ":"

  if (!prefixName) {
    logError(`Missing prefix name`);
    return;
  }
  if (!prefixValue) {
    logError(`Missing prefix value`);
    return;
  }

  if (!/^(\w[a-z0-9]*)?:?$/.test(prefixName)) {
    logError(`Bad prefix name ${prefixName}`);
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
        await db.none(`delete from ${dbSchema}.ns where id = $1`, [idName]);
        await db.none(`update ${dbSchema}.ns set name = $1, is_local = false where id = $2`, [normalizedName, idValue]);
        rememberPrefix(idValue, normalizedName, prefixValue);
      }
    } else if (idName && !idValue) {
      // update idName set idValue
      await db.none(`update ${dbSchema}.ns set name = $1, is_local = false where id = $2`, [normalizedName, idName]);
      rememberPrefix(idName, normalizedName, prefixValue);
    } else if (!idName && idValue) {
      // update idValue set idName
      await db.none(`update ${dbSchema}.ns set name = $1, is_local = false where id = $2`, [normalizedName, idValue]);
      rememberPrefix(idValue, normalizedName, prefixValue);
    } else { // not name, not value
      // insert idName, idValue
      let newId = (await db.one(`insert into ${dbSchema}.ns (name, value, is_local) values ($1, $2, false)
        on conflict on constraint ns_name_key
        do update set value = $2
        returning id`,
        [
          normalizedName, prefixValue
        ])).id;
      rememberPrefix(newId, normalizedName, prefixValue);
    }

  } catch (err) {
    logError(err);
  }
}

const postponedPrefixes = [];
const postponePrefixAbbr = (value, name) => {
  postponedPrefixes.push({ value, name });
  // TODO: re-check these at the end of import
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
      logInfo(`not a JSON value for parameter ${col.yellow(name)}; will be stored as text`);
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
    logError(err);
  }

}

const findDefaultTreeProfileName = async () => {
  try {
    let defaultTreeProfileName = (await db.one(`SELECT id FROM ${registrySchema}.tree_profiles WHERE is_default`, [])).profile_name;
    return defaultTreeProfileName;
  } catch {
    logError(`could not read the default tree profile name; using default`);
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
    extraction_start_datetime: params.extraction_start_datetime,
    extraction_end_datetime: params.extraction_end_datetime,
  }

  const pp_rels_count = Number.parseInt((await db.one(`SELECT COUNT(*) FROM ${dbSchema}.pp_rels`)).count, 10);
  if (pp_rels_count > 0) {
    parameters.use_pp_rels = true;
  }

  for (let key in parameters) {
    logInfo(`Adding parameter ${col.yellow(key)} with value ${col.yellow(parameters[key])}`);
    await addOneParameter(key, parameters[key]);
  }

  return parameters;
}

const printStats = async () => {
  try {
    const TABLES = ['classes', 'properties', 'datatypes', 'cc_rels', 'cp_rels', 'pd_rels', 'pp_rels', 'cpd_rels', 'cpc_rels', 'ns', 'class_annots', 'property_annots'];
    let stats = {}
    for (let tn of TABLES) {
      let n = Number.parseInt((await db.one(`select count(*) from ${dbSchema}.${tn}`)).count, 10);
      stats[tn] = n;
    }

    logInfo(col.blue('\n=== Imported schema stats ==='));
    logInfo(JSON.stringify(stats, null, 2));

  } catch (err) {
    logError('error obtaining schema stats');
    logError(err);
  }
}

async function dumpMap(map, filename) {
  fs.writeFile(`${filename}.json`, JSON.stringify(Object.fromEntries(map), null, 2), { encoding: 'utf-8' })
}

const saveDumps = async () => {
  const dumpFolder = path.join(__dirname, '..', '_dump')
  await fs.mkdir(dumpFolder, { recursive: true })
  const getDumpFilePath = fn => path.join(dumpFolder, `${fn}.json`)

  // await dumpMap(NS_VALUE_TO_ID, getDumpFilePath('NS_VALUE_TO_ID')); // prefix --> ns_id
  // await dumpMap(NS_ID_TO_VALUE, getDumpFilePath('NS_ID_TO_VALUE')); // ns_id --> prefix
  // await dumpMap(NS_NAME_TO_ID, getDumpFilePath('NS_NAME_TO_ID')); // abbr --> ns_id
  // await dumpMap(NS_ID_TO_NAME, getDumpFilePath('NS_ID_TO_NAME')); // ns_id -> abbr
  // await dumpMap(NS_NAME_TO_VALUE, getDumpFilePath('NS_NAME_TO_VALUE')); // abbr --> prefix
  // await dumpMap(NS_VALUE_TO_NAME, getDumpFilePath('NS_VALUE_TO_NAME')); // prefix --> abbr
  await dumpMap(DATATYPES_BY_IRI, getDumpFilePath('DATATYPES_BY_IRI')); // iri -> datatype_id
  await dumpMap(DATATYPES_BY_SHORT_IRI, getDumpFilePath('DATATYPES_BY_SHORT_IRI')); // abbr:localName -> datatype_id
  await dumpMap(CLASSES, getDumpFilePath('CLASSES')); // iri -> class_id
  // await dumpMap(ANNOT_TYPES, getDumpFilePath('ANNOT_TYPES')); // iri -> annot_type_id
  await dumpMap(PROPS_ID_BY_IRI, getDumpFilePath('PROPS_ID_BY_IRI')); // iri -> property_id
  await dumpMap(PROPS_OBJ_BY_ID, getDumpFilePath('PROPS_OBJ_BY_ID')); // id -> property
}

const init = async () => {
  try {
    const nsData = await db.many(`SELECT * FROM ${dbSchema}.ns`);
    logInfo(`${col.yellow(nsData.length)} ns entries loaded`);
    for (let row of nsData) {
      rememberPrefix(row.id, row.name, row.value);
    }

    const atData = await db.many(`SELECT * FROM ${dbSchema}.annot_types`);
    logInfo(`${col.yellow(atData.length)} annotation types loaded`);
    for (let row of atData) {
      ANNOT_TYPES.set(row.iri, row.id);
    }

  } catch (err) {
    logError(err);
    logError('cannot init; exiting');
    process.exit(1);
  }
}

const importFromJSON = async data => {
  logInfo(`=== start importing JSON from ${INPUT_FILE} ===\n\n`, true);

  await init();

  // prefixes
  if (data.Prefixes) {
    for (const pref of data.Prefixes) {
      if (/^n\d+$/.test(pref.prefix)) {
        postponePrefixAbbr(pref.namespace, pref.prefix);
      } else {
        await addPrefixAbbr(pref.namespace, pref.prefix);
      }
    }
  }

  // classes
  if (data.Classes) {
    let classBar = new ProgressBar(`classes pass 1 [:bar] ( :current classes of :total, :percent)`, { total: data.Classes.length, width: 100, incomplete: '.' });
    for (const c of data.Classes) {
      await addClass(c);
      await addClassLabels(c);
      classBar.tick();
    }
    // 2nd pass because sub may appear before super
    let superClassBar = new ProgressBar(`classes pass 2 [:bar] ( :current classes for superclasses of :total, :percent)`, { total: data.Classes.length, width: 100, incomplete: '.' });
    for (const c of data.Classes) {
      await addClassSuperclasses(c);
      superClassBar.tick();
    }
  }

  // properties
  if (data.Properties) {
    // calculate max of tripleCount
    let maxTripleCount = 0
    for (const p of data.Properties) {
      if (p.tripleCount) maxTripleCount = Math.max(maxTripleCount, p.tripleCount)
    }
    const maxTripleCountRounded = roundUpToSingleDigitPower(maxTripleCount)
    // end calculate max of tripleCount

    let propsBar = new ProgressBar(`props pass 1 [:bar] ( :current props of :total, :percent)`, { total: data.Properties.length, width: 100, incomplete: '.' });
    for (const p of data.Properties) {
      await addProperty(p, { maxTripleCountRounded });
      await addPropertyLabels(p);
      propsBar.tick();
    }
    // 2nd pass because ref may appear before def
    let propsPairsBar = new ProgressBar(`props pass 2 [:bar] ( :current prop pairs of :total, :percent)`, { total: data.Properties.length, width: 100, incomplete: '.' });
    for (const p of data.Properties) {
      await addPropertyPairs(p);
      propsPairsBar.tick();
    }
    // 3rd pass - adding pp_rels counts from reverse, if needed
    let propsReverse = new ProgressBar(`props pass 3 [:bar] ( :current prop pairs of :total, :percent)`, { total: data.Properties.length, width: 100, incomplete: '.' });
    for (const p of data.Properties) {
      await addCountsFromReversePP(p);
      propsReverse.tick();
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

  printBadDatatypeIrisIfExist()

  let jsonParams = typeof data.Parameters === 'object'
    ? Array.isArray(data.Parameters)
      ? Object.fromEntries(data.Parameters.map(x => [x.name, x.value]))
      : data.Parameters
    : {}

  if (data.StartDateTime) {
    jsonParams.extraction_start_datetime = data.StartDateTime
  }

  if (data.EndDateTime) {
    jsonParams.extraction_end_datetime = data.EndDateTime
  }

  const effectiveParams = await addParameters(jsonParams);

  await postProcessingAfterImport(jsonParams);

  await printStats();

  if (process.env.SAVE_DUMPS) {
    await saveDumps();
  }

  logInfo(`=== end importing JSON from ${INPUT_FILE} ===\n\n`, true);

  return effectiveParams;
}

module.exports = {
  importFromJSON,
}
