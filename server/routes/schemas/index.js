const express = require('express');
const router = express.Router();
const debug = require('debug')('dss:api')
const c = require('ansi-colors')

// const util = require('./utilities')

const db = require('../db')

const SCHEMA_NAME_REGEX = /^[a-z0-9_]+$/

const TOP_N_NODES = 12
const TOP_N_EDGES = 7

function getSchemaName(param) {
  if (!param) throw new Error("Bad schema name")
  if (typeof param !== 'string') throw new Error("Bad schema name")
  if (!SCHEMA_NAME_REGEX.test(param)) throw new Error("Bad schema name")
  return param
}

function getId(id) {
  if (!id) throw new Error("Bad Id");
  return Number.parseInt(id)
}

async function getSchemaInfo(schemaName) {
  try {
    let info = await db.one(`select * from public.schemata where db_schema_name = $1`, [ schemaName ])

    let classCount = (await db.one(`select count(*) from ${schemaName}.classes`)).count
    let propertyCount = (await db.one(`select count(*) from ${schemaName}.properties`)).count

    let metaProperties = await db.any(`select * from ${schemaName}.parameters`)

    let metaPropertiesProcessed = Object.fromEntries(metaProperties.map(p => [p.name, p.textvalue ?? p.jsonvalue]).filter(p => p[1]).filter(p => !['order_inx'].includes(p[0])))

    const topNclasses = await db.query(`select id, iri, display_name, cnt from ${schemaName}.classes order by cnt desc limit ${TOP_N_NODES}`)
    const topNprops = await db.query(`select id, iri, display_name, cnt from ${schemaName}.properties order by cnt desc limit ${TOP_N_NODES}`)

    let schemaInfo = Object.assign({ schemaName, classCount, propertyCount, topNclasses, topNprops }, info, metaPropertiesProcessed, )

    delete schemaInfo.id
    delete schemaInfo.endpoint_id
    delete schemaInfo.order_inx

    return schemaInfo

  } catch(err) {
    console.error(err)
    return null
  }
}

async function getClassInfo(schemaName, classId) {
  const thisClass = (await db.query(`select * from ${schemaName}.classes where id = $1`, classId))[0]

  const cc1_1 = await db.query(`select cc.cnt, c2.iri, c2.display_name from ${schemaName}.cc_rels cc join ${schemaName}.cc_rel_types t on cc.type_id = t.id join ${schemaName}.classes c2 on cc.class_2_id = c2.id where cc.class_1_id = $1 and cc.type_id = 1 order by cc.cnt desc limit ${TOP_N_EDGES}`, classId)

  const cc2_1 = await db.query(`select cc.cnt, c2.iri, c2.display_name from ${schemaName}.cc_rels cc join ${schemaName}.cc_rel_types t on cc.type_id = t.id join ${schemaName}.classes c2 on cc.class_1_id = c2.id where cc.class_2_id = $1 and cc.type_id = 1 order by cc.cnt desc limit ${TOP_N_EDGES}`, classId)

  const cp_1 = await db.query(`select p.iri, p.display_name, cp.cnt from ${schemaName}.cp_rels cp join ${schemaName}.cp_rel_types t on cp.type_id = t.id join ${schemaName}.properties p on cp.property_id = p.id where cp.class_id = $1 and cp.type_id = 1 order by cp.cnt desc limit ${TOP_N_EDGES}`, classId)
  const cp_2 = await db.query(`select p.iri, p.display_name, cp.cnt from ${schemaName}.cp_rels cp join ${schemaName}.cp_rel_types t on cp.type_id = t.id join ${schemaName}.properties p on cp.property_id = p.id where cp.class_id = $1 and cp.type_id = 2 order by cp.cnt desc limit ${TOP_N_EDGES}`, classId)

  return { thisClass, cc: { subclasses: cc1_1, superclasses: cc2_1 }, cp: { incoming: cp_1, outgoing: cp_2 } }
}

async function getPropertyInfo(schemaName, propertyId) {
  const thisProperty = (await db.query(`select * from ${schemaName}.properties where id = $1`, propertyId))[0]

  const pp1_1 = await db.query(`select pp.cnt, p2.iri, p2.display_name from ${schemaName}.pp_rels pp join ${schemaName}.pp_rel_types t on pp.type_id = t.id join ${schemaName}.properties p2 on pp.property_2_id = p2.id where pp.property_1_id = $1 and pp.type_id = 1 order by pp.cnt desc limit ${TOP_N_EDGES}`, propertyId)
  const pp2_1 = await db.query(`select pp.cnt, p2.iri, p2.display_name from ${schemaName}.pp_rels pp join ${schemaName}.pp_rel_types t on pp.type_id = t.id join ${schemaName}.properties p2 on pp.property_1_id = p2.id where pp.property_2_id = $1 and pp.type_id = 1 order by pp.cnt desc limit ${TOP_N_EDGES}`, propertyId)

  const pp_2 = await db.query(`select pp.cnt, p2.iri, p2.display_name from ${schemaName}.pp_rels pp join ${schemaName}.pp_rel_types t on pp.type_id = t.id join ${schemaName}.properties p2 on pp.property_2_id = p2.id where pp.property_1_id = $1 and pp.type_id = 2 order by pp.cnt desc limit ${TOP_N_EDGES}`, propertyId)
  const pp_3 = await db.query(`select pp.cnt, p2.iri, p2.display_name from ${schemaName}.pp_rels pp join ${schemaName}.pp_rel_types t on pp.type_id = t.id join ${schemaName}.properties p2 on pp.property_2_id = p2.id where pp.property_1_id = $1 and pp.type_id = 3 order by pp.cnt desc limit ${TOP_N_EDGES}`, propertyId)

  const cp_1 = await db.query(`select c.iri, c.display_name, cp.cnt from ${schemaName}.cp_rels cp join ${schemaName}.cp_rel_types t on cp.type_id = t.id join ${schemaName}.classes c on cp.class_id = c.id where cp.property_id = $1 and cp.type_id = 1 order by cp.cnt desc limit ${TOP_N_EDGES}`, propertyId)
  const cp_2 = await db.query(`select c.iri, c.display_name, cp.cnt from ${schemaName}.cp_rels cp join ${schemaName}.cp_rel_types t on cp.type_id = t.id join ${schemaName}.classes c on cp.class_id = c.id where cp.property_id = $1 and cp.type_id = 2 order by cp.cnt desc limit ${TOP_N_EDGES}`, propertyId)

  return { thisProperty, pp: { followed_by: pp1_1, follows: pp2_1, common_subject: pp_2, common_object: pp_3}, cp: { goes_to: cp_1, comes_from: cp_2 } }
}

router.get('/:schema/classes/:id', async (req, res, next) => {
  const schemaName = getSchemaName(req.params.schema)
  const classId = getId(req.params.id)

  const classInfo = await getClassInfo(schemaName, classId)
  const className = classInfo.thisClass.display_name

  res.render('class', { schemaName, className, classInfo })
})

router.get('/:schema/properties/:id', async (req, res, next) => {
  const schemaName = getSchemaName(req.params.schema)
  const propertyId = getId(req.params.id)

  const propertyInfo = await getPropertyInfo(schemaName, propertyId)
  const propertyName = propertyInfo.thisProperty.display_name

  res.render('property', { schemaName, propertyName, propertyInfo })
})

router.get('/:schema', async (req, res, next) => {
  const schemaName = getSchemaName(req.params.schema)
  let schemaInfo = await getSchemaInfo(schemaName)
  if (schemaInfo) {
    res.render('schema', { schemaInfo, schemaName })
  } else {
    res.render('error', { message: 'not found' })
  }
})

router.get('/', async (req, res, next) => {
  const tag = req.query?.tag?.trim()
  let where = ''
  if (tag && /^[a-z0-9]+$/.test(tag)) {
    console.log('OK tag', tag)
    where = `where '${tag}' = any(tags)`
  } else {
    console.log('tag NOK', tag)
  }
  const schemaList = await db.query(`select * from public.schemata ${where} order by display_name`)
  res.render('schema-list', { schemaList })
})

module.exports = router
