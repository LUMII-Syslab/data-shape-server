# TO-DO List
List of requirements and general improvements to do

* ~~Logging - logging to file with timestamps,  
logging general info (time taken, retrieved entities, error handling) <- already logged in console.  
Logging also queries (failed queries with reason in normal logging, and logging all queries in detailed log level)~~
* ~~Configurable targe database schema name -  
Currently hardcoded to "sample", but should be configurable in config file besides db info~~
* ~~Property prefixes + Local name(Wikidata P31, P67 etc. identifiers) - 
Extract prefixes and local name from property IRIs(Wikidata properties, not external ones)~~
* ~~Class prefixes - Already extracted from IRI, just have to be properly saved in the database~~
* Class-property relations for larger classes - As the largest classes timeout while retrieving their property relations,
they should be handled seperately. Already tried multiple approaches, that failes, neither we can go over properties  
in one class context or instances in one class context, because for classes with over 3-4 mil instances,  
we can't retrieve full instance list in the time limit.
* ~~Count proprty object count~~