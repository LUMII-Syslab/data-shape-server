const debug = require('debug')('display-name')
const col = require('ansi-colors')
const _ = require('lodash')
const ProgressBar = require('progress')

const c = require('../config');
const { DB_CONFIG, db, DRY_RUN } = c
const dbSchema = process.env.DB_SCHEMA;

// let LL = [ 'en', 'de', 'lv' ]
let LL = (process.env.ANNOT_LANG_PRIORITIES ?? '').split(',').map(x=>x.trim().toLowerCase()).filter(x=>!!x)
if (!LL.includes('en')) LL.push('en')

console.log('effective annot language order:', LL)

/*
    annot_types (id, iri, ns_id, local_name
    class_annots (id, class_id, type_id, annotatio::text, language_code)
    classes (id, iri, ..., local_name, display_name, ...)
    property_annots
    properties
 
Shēmas pēcapstrāde ielasīšanā / pēc ielasīšanas
Divi darbi: 
Saturīgu namespace prefix piedāvāšana (šobrīd neatrastos apzīmē ar n1, n2, ..)
Lasāmu vārdu pievienošana klasēm un propertijām

p.2 ir vienkāršāks:
Skriptam var tikt padota (config failā ierakstīta) valodu secība, piemēram: lv,en,de . Ja secība tukša, vai tajā nav iekšā en, en tiek pierakstīts secības galā. Sākumā valodu saraksta parametru neapskatām un pieņemam, ka tas ir vienkārši ‘en’.

Ja klases vai propertijas local_name=display_name un šis display_name ir mnemonisks, tad display_name pārveido šādā formā:
[<label_fragment> (<local_name>)]

Šeit <label_fragment> tiek iegūts no tabulas class_annots vai property_annots atbilstošajiem rakstiem, skatoties šādas anotācijas:
rdfs:label -> skos:prefLabel -> skos:altLabel -> cita anotācija pirmajā saraksta valodā
rdfs:label -> skos:prefLabel -> skos:altLabel -> cita anotācija otrajā saraksta valodā
…
rdfs:label -> skos:prefLabel -> skos:altLabel -> cita anotācija bez valodas
Iegūtā anotācija tiek īsināta līdz 50 simboliem (ja tā ir garāka, tad atstāj pirmos 48 un pieliek ‘..’)

Ko nozīmē mnemonisks nosaukums: skatāmies atsevišķi teksta daļu un ciparu daļu. Nosaukums ir mnemonisks, ja izpildās viens no šiem nosacījumiem (pagaidām viens, varbūt, ka kādi piemēri liks ieviest vēl kādu):
Rakstu skaits tabulā, kam ir šī teksta daļa, ir lielāks par teksta daļas garumu, vai

Papildus vēl klāt: ja anotācija neatrodas, tad display_name paliek tāds, kāds bija.

 */

const langPrio = a => {
    let pos =  LL.indexOf(a.language_code)
    return pos >= 0 ? pos : 99
}

const annotTypePrio = a => {
    if (a.type_id === 1) return 1
    else if (a.type_id === 3) return 3
    else if (a.type_id === 4) return 4
    else return 99
}

const nameIsTechnical = async (row, baseTable) => {
    let dn = row.display_name
    let tailPos = dn.search(/[\d_]/)
    if (tailPos === -1) return false

    let head = dn.slice(0, tailPos)
    let similarCount = (await db.any(`select count(*) 
        from ${dbSchema}.${baseTable}  
        where display_name like $1`, [ `${head}%` ])
    ).count
    
    return Number.parseInt(similarCount, 10) > tailPos
}

const PARAMS = [
    [ 'classes', 'class_annots', 'class_id' ],
    [ 'properties', 'property_annots', 'property_id' ],
]

async function calculateDisplayNames() {
    if (DRY_RUN) console.log('running in dry mode')

    for (const [ baseTable, annotTable, fkColumn ] of PARAMS) {
        const rows = await db.any(`
            select * from ${dbSchema}.${baseTable} 
            where display_name = local_name;`);

        console.log(`${rows.length} rename candidates in ${dbSchema}.${baseTable}`)

        const bar = new ProgressBar(`${baseTable} :bar (:current of :total)`, { total: rows.length, width: 100 })

        for (const row of rows) {
            bar.tick()

            let isTechnical = await nameIsTechnical(row, baseTable)
            if (!isTechnical) continue

            // vajag jaunu d_n
            let annotations = await db.any(`select type_id, language_code, annotation 
                from ${dbSchema}.${annotTable}
                -- join annot_types t on a.type_id = t.id
                where ${fkColumn} = $1`, [ row.id ])
                
            // console.log(`${annotations.length} annotations found for ${baseTable} ${row.display_name}`)

            if (annotations.length === 0) continue

            _.sortBy(annotations, [langPrio, annotTypePrio])

            let bestAnnot = annotations[0].annotation

            if (bestAnnot === row.local_name) {
                // annot the same as local_name => don't change
                continue
            }

            if (bestAnnot.length > 50) bestAnnot = bestAnnot.slice(0, 48) + '..'

            let newDisplayName = `[${bestAnnot} (${row.local_name})]`
            if (!DRY_RUN) {
                await db.none(`update ${dbSchema}.${baseTable} 
                    set display_name = $2
                    where id = $1`, [ row.id, newDisplayName ])
            }
            // console.log(`new d_n in ${baseTable} is ${newDisplayName}`)
        }
    }

    return 'done'
}

if (!module.parent) {
    calculateDisplayNames().then(console.log).catch(console.error)
}

module.exports = {
    calculateDisplayNames,
}

