import requests #Dependency used for HTTP connections
import html
import json
from configparser import ConfigParser
import psycopg2 #Dependency used for connection to postgreSql database
import time
import math
import logging

#List used for keeping track of number of queries in the last minute
LAST_MINUTE_EVENTS = list()
#Wikidata used prefix list, hardcoded here, taking information from 'https://www.wikidata.org/wiki/EntitySchema:E49'
#Didn't find an easy way to get this list automatically, but a thing that could be looked into
WD_PREFIXES = {
    "http://www.bigdata.com/rdf#": "bd",
    "http://creativecommons.org/ns#": "cc",
    "http://purl.org/dc/terms/": "dct",
    "http://www.opengis.net/ont/geosparql#": "geo",
    "http://www.w3.org/ns/lemon/ontolex#": "ontolex",
    "http://www.w3.org/2002/07/owl#": "owl",
    "http://www.wikidata.org/prop/": "p",
    "http://www.wikidata.org/prop/qualifier/": "pq",
    "http://www.wikidata.org/prop/qualifier/value-normalized/": "pqn",
    "http://www.wikidata.org/prop/qualifier/value/": "pqv",
    "http://www.wikidata.org/prop/reference/": "pr",
    "http://www.wikidata.org/prop/reference/value-normalized/": "prn",
    "http://www.w3.org/ns/prov#": "prov",
    "http://www.wikidata.org/prop/reference/value/": "prv",
    "http://www.wikidata.org/prop/statement/": "ps",
    "http://www.wikidata.org/prop/statement/value-normalized/": "psn",
    "http://www.wikidata.org/prop/statement/value/": "psv",
    "http://www.w3.org/1999/02/22-rdf-syntax-ns#": "rdf",
    "http://www.w3.org/2000/01/rdf-schema#": "rdfs",
    "http://schema.org/": "schema",
    "http://www.w3.org/2004/02/skos/core#": "skos",
    "http://www.wikidata.org/entity/": "wd",
    "http://www.wikidata.org/wiki/Special:EntityData/": "wdata",
    "http://www.wikidata.org/prop/novalue/": "wdno",
    "http://www.wikidata.org/reference/": "wdref",
    "http://www.wikidata.org/entity/statement/": "wds",
    "http://www.wikidata.org/prop/direct/": "wdt",
    "http://www.wikidata.org/prop/direct-normalized/": "wdtn",
    "http://www.wikidata.org/value/": "wdv",
    "http://wikiba.se/ontology#": "wikibase",
    "http://www.w3.org/2001/XMLSchema#": "xsd",
}

def parseIri(iri):
    # Parse iri, to extract prefix and local name if applicable
    lastSymbol = iri.rfind("#")
    if lastSymbol == -1:
        lastSymbol = iri.rfind("/")
    baseIri = iri[:lastSymbol+1]
    localName = ""
    prefix = WD_PREFIXES.get(baseIri, "")
    # if iri.find("http://www.wikidata.org/") != -1:
    if iri.startswith("http://") or iri.startswith("https://"):
        localName = iri[lastSymbol+1:]
    return prefix, localName

def insertWikidataPrefixes(connection):
    # Just in case insert the prefix list into target database, if they are not already there
    baseSql = """INSERT INTO {schema}.ns(name, value, priority, is_local) VALUES('{name}','{value}',0,false)
                 ON CONFLICT (name)
                 DO NOTHING;"""
    cur = connection.cursor()
    logging.info("Adding {} prefixes to ns".format(len(WD_PREFIXES)))
    for key, value in WD_PREFIXES.items():
        sql = baseSql.format(schema=SCHEMA, name=value, value=key)
        try:
            cur.exec(sql)
        except:
            pass
    connection.commit()
    cur.close()

def countPastQueries():
    # Function used to go over the last event list and cut off the list after finding the first expired event
    global LAST_MINUTE_EVENTS
    TIME_WINDOW = 60
    tim=time.time()  # called only once
    for idx in range(len(LAST_MINUTE_EVENTS)-1,-1,-1):
        if LAST_MINUTE_EVENTS[idx]+TIME_WINDOW<= tim:
            LAST_MINUTE_EVENTS[:idx+1]=""
            break
    return len(LAST_MINUTE_EVENTS)

def config(section, filename='properties.ini'):
    parser = ConfigParser()
    parser.read(filename)

    # Read specific section from config into a python dictionary
    conf = {}
    if parser.has_section(section):
        params = parser.items(section)
        for param in params:
            conf[param[0]] = param[1]
    else:
        return False
        # raise Exception('Section {0} not found in the {1} file'.format(section, filename))
    # Returns config as a dict
    return conf

SCHEMA = 'sample'
def setSchemaName():
    global SCHEMA
    schemaConfig = config('databaseSchema')
    if schemaConfig:
        SCHEMA = schemaConfig['schema']

LOG_LEVEL = logging.WARNING
def setLogLevel():
    global LOG_LEVEL
    loggingConfig = config('logLevel')
    logLevelMap = {
        'DEBUG': logging.DEBUG,
        'INFO': logging.INFO,
        'WARNING': logging.WARNING,
        'ERROR': logging.ERROR,
        'CRITICAL': logging.CRITICAL
    }
    if loggingConfig:
        LOG_LEVEL = logLevelMap.get(loggingConfig['level'], 'Invalid')
        if LOG_LEVEL == 'Invalid':
            raise Exception("Invalid log level({}), valid log levels(DEBUG,INFO,WARNING,ERROR,CRITICAL)".format(loggingConfig['level']))
    print("Set LOG_LEVEL = {}".format(loggingConfig['level']))

DB_CON = None
def getDbCon():
    params = config('postgreSqlConnection')
    if not params:
        raise Exception("Properties file missing postgreSqlConnection section")
    # Get a connection to sparSql database using given parameters
    global DB_CON
    if DB_CON is None:
        try:
            logging.info('Connecting to the PostgreSQL database...')
            DB_CON = psycopg2.connect(**params)
        except (Exception, psycopg2.DatabaseError) as error:
            raise Exception("Failed to connect to PostgreSQL database - {}".format(error))
    return DB_CON

def queryWikiData(query, retries=0):
    global LAST_MINUTE_EVENTS
    # Make POST request to wikidata sparsql service
    lastMinuteEvents = countPastQueries()
    if lastMinuteEvents > 10:
        # If more than 10 queries been made in the last minute wait for a while, not to fail
        # Limit is not really 10, but from testing seems between 10-20
        # This was added to avoid endless error loops, which haven't been seen in later times, maybe fixed
        # Can be disabled if neccessary
        logging.info("More than 10 queries in the last minute, waiting for 60s")
        # time.sleep(61)
        pass

    if retries == 3:
        # TODO - Currently there is a problem, that a failing query even if it was because of too many requests,
        # the failing query will go into an endless fail loop
        logging.warning("Bad requests loop skipping query for now - {}".format(query))
        # return {}
        return None, -1
    url = 'https://query.wikidata.org/sparql'
    body = {'query': query,
            'format': 'json',}
    # Proper user-agent to identify the caller as specified by WikiData query API specification
    headers = { 'User-Agent': 'Wikidata schema extraction Bot/2.0 (https://github.com/LUMII-Syslab/dses-wikidata, vehiginters@gmail.com)'}
    LAST_MINUTE_EVENTS.append(time.time())
    response = requests.post(url, headers = headers, data = body)
    if response.ok:
        logging.debug("Succesful query - {}".format(query))
        try:
            responseJson = json.loads(response.text)['results']['bindings']
        except json.decoder.JSONDecodeError as error:
            logging.debug("Bad JSON received - {}".format(response.text))
            responseJson = None
        return responseJson, 200
        # return json.loads(response.text)['results']['bindings']
    elif response.status_code == 429 or response.status_code == 503 : # To many requests in the last minute, let's wait some time till we make a new one
        sleepTime = 60
        if "Retry-After" in response.headers:
            sleepTime = int(response.headers["Retry-After"])
        logging.info("Query Limit reached. Retrying after {}s".format(sleepTime))
        time.sleep(sleepTime+1)
        if retries > 2:
            return None, response.status_code
        return queryWikiData(query, retries+1)
    elif response.status_code == 502: # Bad gateway server, let's just retry the query
        logging.info("Got bad gateway server in response, retrying query...")
        time.sleep(30)
        if retries > 2:
            return None, response.status_code
        return queryWikiData(query, retries+1)
    elif response.status_code == 500: # Query timeout, can't do much about this besides skipping
        logging.warning("Query timed out, skipping query - {}".format(query))
        # return {}
        return None, response.status_code
    else:
        logging.warning("WikiData returned response code - {}".format(response.status_code))
        logging.warning("Failed query - {}".format(query))
        return None, response.status_code

def insertClasses(connection, dict):
    # Insert classes from given dictionary into target database
    logging.info("insertClasses: {}".format(len(dict)))
    cur = connection.cursor()
    # Subclasses used while developing, just to see how many subclasses for relevant classes are there
    baseSql = '''
        INSERT INTO {schema}.classes(ns_id, iri, cnt, display_name, local_name, is_unique)
        SELECT (SELECT id FROM {schema}.ns WHERE name = '{prefix}') AS ns_id,
        '{iri}', {instances}, '{label}', '{localName}', true;\n'''
    totalSql = ""
    i = 0
    totalClasses = len(dict)
    for key, value in dict.items():
        i = i + 1
        labelValue = value['label']
        if "'" in labelValue:
            # " ' " needs to be escaped for postgresql
            labelValue = labelValue.replace("'", "''")
        prefix, localName = parseIri(key)
        totalSql = totalSql + baseSql.format(schema=SCHEMA, iri=key, prefix=prefix,
            instances=value['instances'], label=labelValue, localName=localName)
        if ((i % 50000) == 0) or (i == totalClasses):
            cur.execute(totalSql)
            totalSql = ""
    connection.commit()
    cur.close()
    logging.info("insertClasses done.")

CLASS_ID_MAP = {}
PROP_ID_MAP = {}

def loadClassIdMap(connection):
    global CLASS_ID_MAP
    baseSql = '''
        SELECT id, iri FROM {schema}.classes
    '''
    sql = baseSql.format(schema=SCHEMA)
    with connection.cursor() as curs:
        curs.execute(sql)
        for row in curs:
            CLASS_ID_MAP[row[1]] = row[0]
            # print(row)
    print(len(CLASS_ID_MAP))

def loadPropIdMap(connection):
    global PROP_ID_MAP
    baseSql = '''
        SELECT id, iri FROM {schema}.properties
    '''
    sql = baseSql.format(schema=SCHEMA)
    with connection.cursor() as curs:
        curs.execute(sql)
        for row in curs:
            PROP_ID_MAP[row[1]] = row[0]
            # print(row)
    print(len(PROP_ID_MAP))

def insertProperties(connection, dict):
    # Insert properties from given dictionary into target database
    logging.info("insertProperties: {}".format(len(dict)))
    cur = connection.cursor()
    baseSql = '''
        INSERT INTO {schema}.properties(ns_id, iri, cnt, display_name, local_name, object_cnt)
        SELECT (SELECT id FROM {schema}.ns WHERE name = '{prefix}') AS ns_id,
        '{iri}', {cnt}, '{label}', '{localName}', {objCount};\n'''
    totalSql = ""
    i = 0
    totalProperties = len(dict)
    for key, value in dict.items():
        i = i + 1
        useCount = value['useCount']
        if useCount > 2100000000:
            # There is one property with more than 2'100'000'000, which goes out of properties table 'cnt' column integer range, so just put it at limit
            useCount = 2100000000
        labelValue = value['label']
        if "'" in labelValue:
            # Same as for classes " ' " needs to be escaped for postgresql
            labelValue = labelValue.replace("'", "''")
        prefix, localName = parseIri(key)
        totalSql = totalSql + baseSql.format(schema=SCHEMA, prefix=prefix, iri=key,
         cnt=useCount, label=labelValue, localName=localName, objCount=value['objCount'])
        if ((i % 50000) == 0) or (i == totalProperties):
            cur.execute(totalSql)
            totalSql = ""
    connection.commit()
    cur.close()

def insertClassPropertyRelationsOld(cursor, relationList, outgoingRelations):
    # As the Python script has no idea about IDs of the classes, just tell the SQL to select them based on class and property iri's
    # Should watch out, as the iri technically could not be unique, as that could brake this SQL
    baseSql = '''
        INSERT INTO {schema}.cp_rels(class_id, property_id, type_id, cnt, object_cnt)
        SELECT (SELECT id from {schema}.classes WHERE iri = '{classIri}') AS cl_id,
        (SELECT id from {schema}.properties WHERE iri = '{propIri}') AS pr_id,
        (SELECT id from {schema}.cp_rel_types WHERE name = '{propertyDirection}'),
        {cnt},
        {objectCnt}
        HAVING (SELECT id from {schema}.classes WHERE iri = '{classIri}') IS NOT NULL
        AND (SELECT id from {schema}.properties WHERE iri = '{propIri}') IS NOT NULL;
    '''
    propertyDirectionString = "outgoing" if outgoingRelations else "incoming"
    totalSql = ""
    totalRelations = len(relationList)
    logging.info("Inserting {} {} property relations into target database...".format(totalRelations, propertyDirectionString))
    i = 0
    for class1, propery, cnt, objectCnt  in relationList:
        i = i + 1
        totalSql = totalSql + baseSql.format(schema = SCHEMA, classIri = class1, propIri = propery, propertyDirection = propertyDirectionString, cnt = cnt, objectCnt = objectCnt)
        if ((i % 50000) == 0) or (i == totalRelations):
            cursor.execute(totalSql)
            totalSql = ""
    logging.info("Inserted {} {} property relations into target database...".format(i, propertyDirectionString))

def verbalizeCpRelType(type_id):
    if type_id == 1:
        return 'incoming'
    elif type_id == 2:
        return 'outgoing'
    elif type_id == 3:
        return ''
    elif type_id == 4:
        return ''
    else:
        return 'unk'

def insertClassPropertyRelations(cursor, relationList, outgoingRelations):
    baseSql = '''
        INSERT INTO {schema}.cp_rels(class_id, property_id, type_id, cnt, object_cnt)
        VALUES {valuesString};
    '''
    propertyDirectionString = "outgoing" if outgoingRelations else "incoming"
    # propertyDirectionString = verbalizeCpRelType()
    typeId = 2 if outgoingRelations else 1
    totalRelations = len(relationList)
    valuesList = []
    logging.info("Inserting {} {} property relations into target database...".format(totalRelations, propertyDirectionString))
    i = 0
    for class1, property, cnt, objectCnt  in relationList:
        i = i + 1
        try:
            classId = CLASS_ID_MAP[class1]
            propId = PROP_ID_MAP[property]
        except:
            # care for the situation where new properties have been added to the endpoint since the property fetching
            continue
        valuesItem = f'({classId}, {propId}, {typeId}, {cnt}, {objectCnt})'
        valuesList.append(valuesItem)
        if ((i % 5000) == 0) or (i == totalRelations):
            finalSql = baseSql.format(schema = SCHEMA, valuesString = ', '.join(valuesList))
            cursor.execute(finalSql)
            valuesList = []
    logging.info("Inserted {} {} property relations into target database...".format(i, propertyDirectionString))

def updateClassPropertyRelations(cursor, relationList):
    baseSql = '''
        UPDATE {schema}.cp_rels
        SET object_cnt = {objectCnt}
        WHERE class_id = (SELECT id from {schema}.classes WHERE iri = '{classIri}')
        AND property_id = (SELECT id from {schema}.properties WHERE iri = '{propIri}')
        AND type_id = (SELECT id from {schema}.cp_rel_types WHERE name = 'outgoing');
    '''
    totalSql = ""
    totalRelations = len(relationList)
    logging.info("Updating {} property relations into target database...".format(totalRelations))
    i = 0
    for class1, prop, objectCnt  in relationList:
        i = i + 1
        totalSql = totalSql + baseSql.format(schema = SCHEMA, classIri = class1, propIri = prop, objectCnt = objectCnt)
        if ((i % 50000) == 0) or (i == totalRelations):
            cursor.execute(totalSql)
            totalSql = ""

def insertClassClassRelations(cursor, relationList):
    logging.info("InsertClassClassRelations: {}".format(len(relationList)))
    # As the Python script has no idea about IDs of the classes, just tell the SQL to select them based on class and property iri's
    # Should watch out, as the iri technically could not be unique, as that could brake this SQL
    baseSql = '''
        INSERT INTO {schema}.cc_rels(class_1_id, class_2_id, type_id)
        SELECT (SELECT id from {schema}.classes WHERE iri = '{class1Iri}') AS cl_id,
        (SELECT id from {schema}.classes WHERE iri = '{class2Iri}') AS cl2_id,
        (SELECT id from {schema}.cc_rel_types WHERE name = 'sub_class_of')
        HAVING (SELECT id from {schema}.classes WHERE iri = '{class1Iri}') IS NOT NULL
        AND (SELECT id from {schema}.classes WHERE iri = '{class2Iri}') IS NOT NULL;
    '''
    totalSql = ""
    totalRelations = len(relationList)
    i = 0
    for class1, class2  in relationList:
        totalSql = totalSql + baseSql.format(schema = SCHEMA, class1Iri = class1, class2Iri = class2)
        if ((i % 50000) == 0) or (i == totalRelations):
            cursor.execute(totalSql)
            totalSql = ""
    # Don't commit transaction just yet, because these relations are inserted in batches and not all at once

def insertConstraintRelations(cursor, constraintList):
    relTypeSql = '''
        INSERT INTO {schema}.cp_rel_types(name) VALUES('{name}')
             ON CONFLICT ON CONSTRAINT cp_rel_types_name_unique
             DO NOTHING;
    '''
    # Make sure that type_constraint and value_type_constraint cp_rel_types are in database
    cursor.execute(relTypeSql.format(schema = SCHEMA, name='type_constraint'))
    cursor.execute(relTypeSql.format(schema = SCHEMA, name='value_type_constraint'))

    # Insert class and property constraint relations into target database
    baseSql = '''
        INSERT INTO {schema}.cp_rels(class_id, property_id, type_id, cnt, object_cnt)
        SELECT (SELECT id from {schema}.classes WHERE iri = '{classIri}') AS cl_id,
        (SELECT id from {schema}.properties WHERE iri = '{propIri}') AS pr_id,
        (SELECT id from {schema}.cp_rel_types WHERE name = '{constraintType}'),
        {cnt},
        {objectCnt}
        HAVING (SELECT id from {schema}.classes WHERE iri = '{classIri}') IS NOT NULL
        AND (SELECT id from {schema}.properties WHERE iri = '{propIri}') IS NOT NULL
        ON CONFLICT DO NOTHING;
    '''
    totalSql = ""
    totalConstraints = len(constraintList)
    logging.info("Inserting {} constraint relations into target database...".format(totalConstraints))
    i = 0
    for cl, prop, constrType in constraintList:
        logging.info(f'{cl}, {prop}, {constrType}')
        i = i + 1
        # constr = 'type_constraint' if constrType == 3 else 'value_type_constraint'
        totalSql = totalSql + baseSql.format(schema = SCHEMA, classIri = cl, propIri = prop, constraintType = constrType, cnt = 0, objectCnt = 0)
        if ((i % 50000) == 0) or (i == totalConstraints):
            cursor.execute(totalSql)
            totalSql = ""

def insertPropObjCount(connection, propObjCountDict):
    # Update property object count in target database
    baseSql = '''
        UPDATE {schema}.properties
        SET object_cnt = {objectCnt}
        WHERE iri = '{propIri}';
    '''
    cur = connection.cursor()
    totalSql = ""
    totalProps = len(propObjCountDict)
    logging.info("Updating property object count into target database...")
    i = 0
    for key, value in propObjCountDict.items():
        i = i + 1
        totalSql = totalSql + baseSql.format(schema = SCHEMA, propIri = key, objectCnt = int(value))
        if ((i % 30000) == 0) or (i == totalProps):
            cur.execute(totalSql)
            totalSql = ""
    connection.commit()
    cur.close()
    logging.info("Property object count in target database updated.")

def getProperties():
    logging.info("Getting list of properties...")
    query = """
        SELECT DISTINCT ?property (COUNT(?item) as ?useCount) WHERE {{
           ?item ?property ?propValue
        }}
        GROUP BY ?property
        ORDER BY DESC(?useCount)
    """
    responseDict, responseStatus = queryWikiData(query)
    resultDict = {}
    if responseDict is not None:
        for i in responseDict:
            resultDict[i['property']['value']] = {'useCount':int(i['useCount']['value']), 'label': "", 'objCount': 0}
    return resultDict

def getPropertyLabels(propertiesDict):
    # Get labels for classes in a given dictionary
    totalProps = len(propertiesDict)
    logging.info("Getting property labels for {} properties...".format(totalProps))
    query = """
        SELECT DISTINCT ?property ?propLabel WHERE {{
          VALUES ?property {{ {} }}
          SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
          ?prop ( wikibase:directClaim | wikibase:claim | wikibase:novalue | wikibase:qualifier | wikibase:qualifierValue | wikibase:qualifierValueNormalized | wikibase:reference | wikibase:referenceValue | wikibase:referenceValueNormalized | wikibase:statementProperty | wikibase:statementValue | wikibase:statementValueNormalized | wikibase:directClaimNormalized ) ?property
        }}
    """
    i = 0
    k = 0
    propertyList = ""
    for key in propertiesDict:
        i = i + 1
        if not key.startswith("http://www.wikidata.org/"):
            prefix, localName = parseIri(key)
            propertiesDict[key]['label'] = localName
        else:
            k = k + 1
            propertyList = propertyList + " <" + key + ">"

        # Query wikidata in batches of 15000 to maximize query time and minimize amount of queries
        # Can't query in much bigger batches as then queries start to reach payload limit
        if ((k % 15000) == 0) or (i == totalProps):
            responseDict, responseStatus = queryWikiData(query.format(propertyList))
            if responseDict is not None:
                for j in responseDict:
                    if j['property']['value'] in propertiesDict and j['propLabel']['value'] is not None and len(j['propLabel']['value']) > 0:
                        propertiesDict[j['property']['value']]['label'] = j['propLabel']['value']
            propertyList = ""
            logging.info("{:.1%} done...".format(i/float(totalProps)))
    logging.info("Property labels done.")

def processClassClassRelations(connection, classDict):
    logging.info("Getting Class-Class relations...")
    # A little complicated function, that gets all subclass relations between all relevant classes
    query = """
        SELECT DISTINCT ?class ?subclass WHERE {{
          ?subclass wdt:P279 ?class.
          VALUES ?class {{ {} }}
        }}
    """
    i = 0
    relationsCounter = 0
    totalClasses = len(classDict)
    classList = ""
    relationList = []
    collectedClasses = 0
    cur = connection.cursor()
    totalInsertedRelations = 0
    # Iteration logic: for first iteration just take the class values and continue, for rest first check if to many subclasses collected and only after query collect the current class
    # This is done so that we can kinda look at the number of subclasses for next class in dictionary
    for key, value in classDict.items():
        i = i + 1
        if i == 1 or i == totalClasses:
            collectedClasses = collectedClasses + 1
            classList = classList + " <" + key + ">"
            relationsCounter = relationsCounter + int(value['subclasses'])
            if i == 1:
                continue
        # First check if either the max number of subclasses for collected classes go over 1mil, a total of 15000 classes is collected or if its the last class
        if ((relationsCounter + int(value['subclasses'])) > 1000000) or (collectedClasses  == 15000) or (i == totalClasses):
            # If either check is true, query wikidata to get related classes for batch of the collected classes
            responseDict, responseStatus = queryWikiData(query.format(classList))
            # It was a bit heavy to check if the subclass is relevant on wikidata, so it is done within Python
            # But then again we get max 1mil of result rows in response, which can take up to 1GB RAM for a few secs, while the response is processed
            if responseDict is not None:
                for j in responseDict:
                    if j['subclass']['value'] in classDict:
                        relationList.append((j['class']['value'], j['subclass']['value']))
                responseDict.clear() # Clear the response dict as fast as we can, to free up used memory
            classList = ""
            relationsCounter = 0
            collectedClasses = 0
            currentRelations = len(relationList)
            logging.info("Relations for {}/{} classes done...".format(i, totalClasses))
            # After we collect more then 50k relations, or we are at the end, insert the class relations, but dont commit the transaction yet
            if (currentRelations > 50000) or (i == totalClasses):
                insertClassClassRelations(cur, relationList)
                totalInsertedRelations = totalInsertedRelations + currentRelations
                logging.info("{} Class relations collected".format(totalInsertedRelations))
                relationList.clear()
        collectedClasses = collectedClasses + 1
        classList = classList + " <" + key + ">"
        relationsCounter = relationsCounter + int(value['subclasses'])
    connection.commit()
    cur.close()

def processClassPropertyRelations(connection, classDict, outgoingRelations=True):
    # Implements a very similar algorithm as for class-class relations, but just collecting classes based on instance count
    # Outgoing properties - 400k instance limit, otherwise timeouts
    # Incoming properties - 2mil instance limit, otherwise timeouts
    # This goes on for quite a while, taking up to 4 hours to get the outgoing and incoming properties

    classInstanceLimit_outgoing = 400000
    classInstanceLimit_incoming = 2000000

    propertyLine = "?x ?property ?y \n" if outgoingRelations else "?y ?property ?x. \n"
    propertyDirectionString = "Outgoing" if outgoingRelations else "Incoming"
    classInstanceLimit = classInstanceLimit_outgoing if outgoingRelations else classInstanceLimit_incoming

    # classInstanceLimitBatch = 200000
    # classAmountLimitBatch = 5000
    classInstanceLimitBatch = 100000
    classAmountLimitBatch = 2000

    # For Incoming relations we can't batch together too many classes, as class instance amount doesn't perfectly correlate to query time 

    query = """
        SELECT ?property ?class (COUNT(?y) AS ?propertyInstances) WHERE {{
           ?x wdt:P31 ?class.""" + propertyLine + """ VALUES ?class {{ {} }}
        }}
        GROUP BY ?property ?class
    """
    i = 0
    k = 0
    instanceCounter = 0
    totalClasses = len(classDict)
    # classList = ""
    classList = []
    skippedClassList = []
    relationList = []
    collectedClasses = 0
    cur = connection.cursor()
    totalInsertedRelations = 0
    logging.info("Getting {} class-property relations for {} classes...".format(propertyDirectionString, totalClasses))
    for key, value in classDict.items():
        logging.debug("=== klase {} ===".format(key))

        i = i + 1
        if int(value['instances']) > classInstanceLimit:
            logging.warning("Class {} has too many instances, query will timeout, so skipping for now".format(key))
            skippedClassList.append(value)
            continue

        # K: Counter to know which is the first processed class, can't use i for this, as we need also way to tell if it's the last class overall
        k = k + 1
        if k == 1 or i == totalClasses:
            collectedClasses = collectedClasses + 1
            # classList = classList + " <" + key + ">"
            classList.append(value)
            instanceCounter = instanceCounter + int(value['instances'])
            if k == 1:
                continue
        if not outgoingRelations:
            # Calculate batch limits, so that for smaller classes as many classes are batched together, query doesn't time out. Problematic only for incoming relations
            power = math.floor(math.log(i, 10))
            classInstanceLimitBatch = 1000000/pow(2, power)
            classAmountLimitBatch = pow(10, power) if power < 4 else 1000

        if ((instanceCounter + int(value['instances'])) > classInstanceLimitBatch) or (collectedClasses  == classAmountLimitBatch) or (i == totalClasses):
            classIriList = " ".join(f'<{x["iri"]}>' for x in classList)
            responseDict, responseStatus = queryWikiData(query.format(classIriList))
            if responseDict is not None:
                for j in responseDict:
                    objectCnt = 0
                    if not outgoingRelations:
                        objectCnt = int(j['propertyInstances']['value'])
                    relationList.append((j['class']['value'], j['property']['value'], int(j['propertyInstances']['value']), objectCnt))
                responseDict.clear() # Clear the response dict as fast as we can, to free up used memory
            else:
                logging.warning("error {} while getting {} cp_rels; class list ({}) {}, pass 1, fallin back to one class per req".format(responseStatus, propertyDirectionString, collectedClasses, classIriList))
                for c in classList:
                    responseDict, responseStatus = queryWikiData(query.format(f'<{c["iri"]}>'))
                    if responseDict is not None:
                        for j in responseDict:
                            objectCnt = 0
                            if not outgoingRelations:
                                objectCnt = int(j['propertyInstances']['value'])
                            relationList.append((j['class']['value'], j['property']['value'], int(j['propertyInstances']['value']), objectCnt))
                        responseDict.clear() # Clear the response dict as fast as we can, to free up used memory
                    else:
                        logging.error("error {} while getting {} cp_rels; class ({}) {}, pass 2, falling back to large class mode".format(responseStatus, propertyDirectionString, collectedClasses, f'<{c["iri"]}>'))
                        skippedClassList.append(c)
                # skippedClassList.extend(classList)
            classList = []
            instanceCounter = 0
            collectedClasses = 0
            currentRelations = len(relationList)
            logging.debug("{} property relations for {}/{} classes done...".format(propertyDirectionString, i, totalClasses))
            if (currentRelations > 50000) or (i == totalClasses):
                insertClassPropertyRelations(cur, relationList, outgoingRelations)
                totalInsertedRelations = totalInsertedRelations + currentRelations
                logging.info("{} {} relations collected".format(propertyDirectionString, totalInsertedRelations))
                relationList.clear()
                logging.info("{:.1%} done...".format(i/float(totalClasses)))

        collectedClasses = collectedClasses + 1
        # classList = classList + " <" + key + ">"
        classList.append(value)
        instanceCounter = instanceCounter + int(value['instances'])
    connection.commit()
    cur.close()
    logging.info("processClassPropertyRelations done. {} classes skipped as large".format(len(skippedClassList)))
    return skippedClassList

def processClassPropertyObjCount(connection, classDict):
    query = """
        SELECT ?property ?class (COUNT(?y) AS ?objectCnt) WHERE {{
           ?x wdt:P31 ?class.
           ?x ?property ?y.
           FILTER  isIRI(?y)
           VALUES ?class {{ {} }}
        }}
        GROUP BY ?property ?class
    """
    i = 0
    k = 0
    instanceCounter = 0
    totalClasses = len(classDict)
    # classList = ""
    classList = []
    skippedClassList = []
    relationList = []
    collectedClasses = 0
    cur = connection.cursor()
    totalUpdatedRelations = 0
    logging.info("Updating outgoing class-property relation object count for {} classes...".format(totalClasses))
    for key, value in classDict.items():
        i = i + 1
        if int(value['instances']) > 400000:
            logging.warning("Class {} has too many instances, query will timeout, so skipping for now".format(key))
            skippedClassList.append(value)
            continue

        # K: Counter to know which is the first processed class, can't use i for this, as we need also way to tell if it's the last class overall
        k = k + 1
        if k == 1 or i == totalClasses:
            collectedClasses = collectedClasses + 1
            # classList = classList + " <" + key + ">"
            classList.append(value)
            instanceCounter = instanceCounter + int(value['instances'])
            if k == 1:
                continue
        if ((instanceCounter + int(value['instances'])) > 400000) or (collectedClasses  == 5000) or (i == totalClasses):
            classIriList = " ".join(f'<{x["iri"]}>' for x in classList)
            responseDict, responseStatus = queryWikiData(query.format(classIriList))
            if responseDict is not None:
                for j in responseDict:
                    relationList.append((j['class']['value'], j['property']['value'], int(j['objectCnt']['value'])))
                responseDict.clear() # Clear the response dict as fast as we can, to free up used memory
            else:
                logging.error("error while getting outgoing cp_rels objCount; class list ({}) {}".format(collectedClasses, classList))
                skippedClassList.extend(classList)
            classList = []
            instanceCounter = 0
            collectedClasses = 0
            currentRelations = len(relationList)
            logging.info("Outgoing class-property relation object count for {}/{} updated...".format(i, totalClasses))
            if (currentRelations > 50000) or (i == totalClasses):
                updateClassPropertyRelations(cur, relationList)
                totalUpdatedRelations = totalUpdatedRelations + currentRelations
                logging.info("{} outgoing relations updated".format(totalUpdatedRelations))
                relationList.clear()
        collectedClasses = collectedClasses + 1
        # classList = classList + " <" + key + ">"
        classList.append(value)
        instanceCounter = instanceCounter + int(value['instances'])
    connection.commit()
    cur.close()
    logging.info("processClassPropertyObjCount done. {} classes skipped as large".format(len(skippedClassList)))
    return skippedClassList

def getPropertyObjCount(propDict):
    # Update object count for properties
    # For properties with over 2mil uses in triples, we just take an estimate for 2mil
    # and calculate estimate for total uses for property
    logging.info("Getting property object count...")
    limitQuery = '''
    SELECT (count(?y) as ?objCount) WHERE {{
        {{select ?y where {{?x {property} ?y.}} LIMIT 2000000}}.
        FILTER isIRI(?y).
    }}
    '''
    query = '''
    SELECT ?property (COUNT(?y) AS ?objectCnt) WHERE {{
        ?x ?property ?y.
        FILTER  isIRI(?y)
        VALUES ?property {{ {propertyList} }}
    }}
    GROUP BY ?property
    '''
    # Algorithm works the same as for 'updateClassPropertyObjCount' and 'getClassPropertyRelations'
    # To put it simply group multiple properties based on use count, to minimize queries against wikidata
    totalProperties = len(propDict)
    i = 0
    k = 0
    propList = ""
    collectedProps = 0
    propCounter = 0
    resultDict = {}
    LARGE_PROP_THRESHOLD = 2000000
    for key, value in propDict.items():
        i = i + 1
        if int(value['useCount']) > LARGE_PROP_THRESHOLD:
            responseDict, responseStatus = queryWikiData(limitQuery.format(property=" <" + key + ">"))
            if responseDict is not None:
                for j in responseDict:
                    proportion =  int(j['objCount']['value']) / LARGE_PROP_THRESHOLD
                    resultDict[key] = int(value['useCount']) * proportion
                    logging.warning("<{}> property is too big, getting estimate obj count : {}".format(key, int(value['useCount']) * proportion))
                responseDict.clear() # Clear the response dict as fast as we can, to free up used memory
            if (i == totalProperties): # Here let's catch the case, where last prop is large and we get obj count for props left in list
                responseDict, responseStatus = queryWikiData(query.format(propertyList=propList))
                if responseDict is not None:
                    for j in responseDict:
                        resultDict[j['property']['value']] = j['objectCnt']['value']
                    responseDict.clear() # Clear the response dict as fast as we can, to free up used memory
        else:
            k = k + 1
            if k == 1 or i == totalProperties:
                collectedProps = collectedProps + 1
                propList = propList + " <" + key + ">"
                propCounter = propCounter + int(value['useCount'])
                if k == 1:
                    continue
            if ((propCounter + int(value['useCount'])) > 2 * LARGE_PROP_THRESHOLD) or (collectedProps  == 5000) or (i == totalProperties):
                responseDict, responseStatus = queryWikiData(query.format(propertyList=propList))
                if responseDict is not None:
                    for j in responseDict:
                        resultDict[j['property']['value']] = j['objectCnt']['value']
                    responseDict.clear() # Clear the response dict as fast as we can, to free up used memory
                propList = ""
                propCounter = 0
                collectedProps = 0
            collectedProps = collectedProps + 1
            propList = propList + " <" + key + ">"
            propCounter = propCounter + int(value['useCount'])
    return resultDict

def getClasses():
    # Get all of the relevant classes from WikiData with at least 1 instance
    # First get the classes with their instance count
    logging.info("Getting list of classes...")
    query = """
        SELECT ?class (COUNT(?y) as ?instances) WHERE {{
           ?y wdt:P31 ?class.
        }}
        GROUP BY ?class
        ORDER BY DESC(?instances)
    """
    responseDict, responseStatus = queryWikiData(query)
    classDict = {}
    if responseDict is not None:
        for i in responseDict:
            classDict[i['class']['value']] = {'iri':i['class']['value'], 'instances':int(i['instances']['value']), 'label': "", 'subclasses': 0}
    logging.info("{} classes retrieved".format(len(classDict)))
    # Then count the number of subclasses for each class, later used for getting class relations
    logging.info("Counting class subclasses...")
    query = """
        SELECT ?class (COUNT(?y) as ?subclasses) where {{
           ?y wdt:P279 ?class.
        }}
        GROUP BY ?class
        ORDER BY DESC(?subclasses)
    """
    responseDict, responseStatus = queryWikiData(query)
    if responseDict is not None:
        for i in responseDict:
            if i['class']['value'] in classDict:
                classDict[i['class']['value']]['subclasses'] = int(i['subclasses']['value'])
    return classDict

def getClassLabels(classDict):
    # Get labels for classes in a given dictionary
    totalClasses = len(classDict)
    logging.info("Getting class labels for {} classes...".format(totalClasses))
    query = """
        SELECT ?class ?classLabel WHERE {{
           VALUES ?class {{ {} }}
           SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en". }}
        }}
    """
    i = 0
    classList = ""
    for key in classDict:
        i = i + 1
        classList = classList + " <" + key + ">"
        # Query wikidata in batches of 15000 to maximize query time and minimize amount of queries
        if ((i % 15000) == 0) or (i == totalClasses):
            responseDict, responseStatus = queryWikiData(query.format(classList))
            if responseDict is not None:
                for j in responseDict:
                    if j['class']['value'] in classDict:
                        classDict[j['class']['value']]['label'] = j['classLabel']['value']
            classList = ""
            logging.info("{:.1%} done...".format(i/float(totalClasses)))
    logging.info("Class labels done.")

def processClassPropertyRelations_large_Incoming(connection, classList):
    logging.info("Processing large class property relations - incoming ({}) ...".format(len(classList)))
    # Process the largest class property relations which had too many instances
    # Get the property relations only for first 500k class instances and calculate aproximate property use count
    incomingPropsQuery = '''
    SELECT ?property (COUNT(?x) AS ?useCount)
        {{SELECT ?property ?x WHERE
            {{?instance wdt:P31 <{classIri}>.
            ?x ?property ?instance.}}
        LIMIT 500000
    }}
    GROUP BY ?property'''
    incomingRelationList = []
    cur = connection.cursor()
    # Iterate through all the classes ignoring classes with < 400k instances
    # Getting incoming property relations only for classes with > 2mil instances
    for value in classList:
        key = value['iri']
        logging.info("Retrieving incoming class property relations for class ({})".format(key))
        responseDict, responseStatus = queryWikiData(incomingPropsQuery.format(classIri=key))
        if responseDict is not None:
            for j in responseDict:
                useCount = int((float(j['useCount']['value']) / 500000) * int(value['instances']))
                incomingRelationList.append((key, j['property']['value'], useCount , useCount))

    insertClassPropertyRelations(cur, incomingRelationList, False)
    connection.commit()
    cur.close()

def processClassPropertyRelations_large_Outgoing(connection, classList):
    logging.info("Processing large class property relations - outgoing ({}) ...".format(len(classList)))
    # Process the largest class property relations which had too many instances
    # Get the property relations only for first 500k class instances and calculate aproximate property use count
    outgoingPropsQuery = '''
    SELECT ?property (COUNT(?x) AS ?useCount)
        {{SELECT ?property ?x WHERE
            {{?instance wdt:P31 <{classIri}>.
            ?instance ?property ?x.}}
        LIMIT 500000
    }}
    GROUP BY ?property'''
    outgoingRelationList = []
    cur = connection.cursor()
    # Iterate through all the classes ignoring classes with < 400k instances
    # Getting incoming property relations only for classes with > 2mil instances
    for value in classList:
        key = value['iri']
        logging.info("Retrieving outgoing class property relations for class ({})".format(key))
        responseDict, responseStatus = queryWikiData(outgoingPropsQuery.format(classIri=key))
        if responseDict is not None:
            for j in responseDict:
                useCount = int((float(j['useCount']['value']) / 500000) * int(value['instances']))
                outgoingRelationList.append((key, j['property']['value'], useCount, 0))
    insertClassPropertyRelations(cur, outgoingRelationList, True)
    connection.commit()
    cur.close()

def processClassPropertyRelations_large_ObjCount(connection, classList):
    logging.info("Processing large class property relations - outgoing objCount ({}) ...".format(len(classList)))
    # Process the largest class property relations which had too many instances
    # Get the property relations only for first 500k class instances and calculate aproximate property use count
    outgoingPropsObjCount = '''
    SELECT ?property (COUNT(?x) AS ?objectCnt) {{
      SELECT ?property ?x WHERE {{
        ?instance wdt:P31 <{classIri}>.
        ?instance ?property ?x.
        FILTER  isIRI(?x)
      }}
      LIMIT 500000
    }}
    GROUP BY ?property
    '''
    outgoingObjCountList = []
    cur = connection.cursor()
    # Iterate through all the classes ignoring classes with < 400k instances
    # Getting incoming property relations only for classes with > 2mil instances
    for value in classList:
        key = value['iri']
        logging.info("Getting outgoing class property relation object count for class ({})".format(key))
        responseDict, responseStatus = queryWikiData(outgoingPropsObjCount.format(classIri=key))
        if responseDict is not None:
            for j in responseDict:
                objCount = int((float(j['objectCnt']['value']) / 500000) * int(value['instances']))
                outgoingObjCountList.append((key, j['property']['value'], objCount))
    updateClassPropertyRelations(cur, outgoingObjCountList)
    connection.commit()
    cur.close()

def processClassPropertyConstraints(connection, classDict):
    logging.info("Getting Class-Property constraints...")
    query = """
        SELECT DISTINCT ?class ?property ?constraint {{
          ?prop p:P2302 [ ps:P2302 ?constraint ; pq:P2308 ?class ; pq:P2309 wd:Q21503252 ].
          ?prop wikibase:directClaim ?property.
          VALUES ?class {{ {classList} }}.
          VALUES ?constraint {{ wd:Q21503250 wd:Q21510865 }}.
        }}
    """
    i = 0
    cur = connection.cursor()
    classIriList = ""
    totalClasses = len(classDict)
    constraintList = []
    classLimit = 500 # For first largest classes take only 500 classes, as constraints are mostly just used for the largest classes
    for key in classDict:
        i = i + 1
        classIriList = classIriList + " <" + key + ">"
        if ((i % classLimit) == 0) or (i == totalClasses):
            # classLimit = 10000 # For the rest of the classes group them up by 10k
            classLimit = 4000 # For the rest of the classes group them up by4k
            responseDict, responseStatus = queryWikiData(query.format(classList=classIriList))
            if responseDict is not None:
                for j in responseDict:
                    constraintType = 'type_constraint' if j['constraint']['value'] == 'http://www.wikidata.org/entity/Q21503250' else 'value_type_constraint'
                    constraintList.append((key, j['property']['value'], constraintType))
            classIriList = ""
            logging.info("{:.1%} done...".format(i/float(totalClasses)))
    insertConstraintRelations(cur, constraintList)
    connection.commit()
    cur.close()

if __name__ == '__main__':
    databaseCon = getDbCon()

    setSchemaName()
    setLogLevel()
    tNow = time.localtime()
    logging.basicConfig(
        format='%(asctime)s %(levelname)-8s %(message)s',
        filename=time.strftime("%Y%m%d%H%M", tNow) + '_export.log',
        level=LOG_LEVEL,
        force=True,
        datefmt='%Y-%m-%d %H:%M:%S'
    )

    # The schema extraction is modular, divided into parts by all of these functions
    # There are dependencies for some functions on classes list and for some on property list
    # Otherwise the unnecessary functions can be commented out, to extract only a part of the schema or debug

    # insertWikidataPrefixes(databaseCon)

    # propDict = getProperties()
    # getPropertyLabels(propDict)
    # insertProperties(databaseCon, propDict)
    # propObjCountDict = getPropertyObjCount(propDict)
    # propDict.clear() # Clear the massive dictionary, to not take up RAM space
    # insertPropObjCount(databaseCon, propObjCountDict)
    # propObjCountDict.clear()

    loadPropIdMap(databaseCon)

    classDict = getClasses()
    # getClassLabels(classDict)
    # insertClasses(databaseCon, classDict)

    loadClassIdMap(databaseCon)

    # largeIncomingList = processClassPropertyRelations(databaseCon, classDict, outgoingRelations=False)
    # processClassPropertyRelations_large_Incoming(databaseCon, largeIncomingList)
    # largeIncomingList.clear()

    # largeOutgoingList = processClassPropertyRelations(databaseCon, classDict, outgoingRelations=True)
    # processClassPropertyRelations_large_Outgoing(databaseCon, largeOutgoingList)
    # largeOutgoingList.clear()

    largeOutgoingObjCountList = processClassPropertyObjCount(databaseCon, classDict)
    processClassPropertyRelations_large_ObjCount(databaseCon, largeOutgoingObjCountList)
    largeOutgoingObjCountList.clear()

    # processLargeClasses(databaseCon, classDict)

    # processClassClassRelations(databaseCon, classDict)
    
    # processClassPropertyConstraints(databaseCon, classDict)
    classDict.clear()

    logging.info("Finished")
    databaseCon.close()
