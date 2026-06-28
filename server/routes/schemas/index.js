const express = require('express');
const router = express.Router();
const debug = require('debug')('dss:api')
const c = require('ansi-colors')

// const util = require('./utilities')

const db = require('../db')

const SCHEMA_NAME_REGEX = /^[a-z0-9_]+$/

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

    const topNclasses = await db.query(`select id, iri, display_name, cnt from ${schemaName}.classes order by cnt desc limit 10`)
    const topNprops = await db.query(`select id, iri, display_name, cnt from ${schemaName}.properties order by cnt desc limit 10`)

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
  const thisClass = await db.query(`select * from ${schemaName}.classes where id = $1`, classId)

  const cc1 = await db.query(`select * from ${schemaName}.cc_rels cc join ${schemaName}.cc_rel_types t on cc.type_id = t.id where cc.class_1_id = $1 order by cc.cnt desc limit 5`, classId)
  const cc2 = await db.query(`select * from ${schemaName}.cc_rels cc join ${schemaName}.cc_rel_types t on cc.type_id = t.id where cc.class_2_id = $1 order by cc.cnt desc limit 5`, classId)

  const cp = await db.query(`select * from ${schemaName}.cp_rels cp join ${schemaName}.cp_rel_types t on cp.type_id = t.id where cp.class_id = $1 order by cp.cnt desc limit 5`, classId)

  return { thisClass, cc1, cc2, cp }
}

router.get('/:schema/classes/:id', async (req, res, next) => {
  const schemaName = getSchemaName(req.params.schema)
  const classId = getId(req.params.id)

  const classInfo = await getClassInfo(schemaName, classId)
  const className = classInfo.display_name

  res.render('class', { schemaName, className, classInfo })
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
