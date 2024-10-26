--
-- PostgreSQL database dump
--

-- Dumped from database version 14.13 (Ubuntu 14.13-0ubuntu0.22.04.1)
-- Dumped by pg_dump version 14.13 (Ubuntu 14.13-0ubuntu0.22.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE IF EXISTS ONLY public.schemata DROP CONSTRAINT IF EXISTS schemata_endpoint_fk;
DROP INDEX IF EXISTS public.idx_endpoints_url_graph;
ALTER TABLE IF EXISTS ONLY public.tree_profiles DROP CONSTRAINT IF EXISTS tree_profiles_name_unique;
ALTER TABLE IF EXISTS ONLY public.tree_profiles DROP CONSTRAINT IF EXISTS tree_profile_pkey;
ALTER TABLE IF EXISTS ONLY public.schemata_tags DROP CONSTRAINT IF EXISTS schemata_tags_pkey;
ALTER TABLE IF EXISTS ONLY public.schemata_tags DROP CONSTRAINT IF EXISTS schemata_tags_name_unique;
ALTER TABLE IF EXISTS ONLY public.schemata_tags DROP CONSTRAINT IF EXISTS schemata_tags_display_name_unique;
ALTER TABLE IF EXISTS ONLY public.schemata DROP CONSTRAINT IF EXISTS schemata_pkey;
ALTER TABLE IF EXISTS ONLY public.schemata DROP CONSTRAINT IF EXISTS schemata_display_name_unique;
ALTER TABLE IF EXISTS ONLY public.ns_prefixes DROP CONSTRAINT IF EXISTS ns_prefixes_pkey;
ALTER TABLE IF EXISTS ONLY public.endpoints DROP CONSTRAINT IF EXISTS endpoints_pkey;
DROP VIEW IF EXISTS public.v_configurations;
DROP TABLE IF EXISTS public.tree_profiles;
DROP TABLE IF EXISTS public.schemata_tags;
DROP TABLE IF EXISTS public.schemata;
DROP TABLE IF EXISTS public.ns_prefixes;
DROP TABLE IF EXISTS public.endpoints;
DROP PROCEDURE IF EXISTS public.register_schemata();
DROP PROCEDURE IF EXISTS public.register_one_schema(IN schema text);
DROP SCHEMA IF EXISTS public;
--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: register_one_schema(text); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.register_one_schema(IN schema text)
    LANGUAGE plpgsql
    AS $$
    -- version 2024-10-25
	declare
	pline empty.parameters%rowtype;

	schema_exists boolean;
	ptable_exists boolean;
	schema_already_registered boolean;
    display_name_collision boolean;
    endpoint_already_used boolean;

    p_db_schema_name text;
    p_display_name text;
    p_schema_description text;

	p_endpoint_url text;
    p_named_graph text;
    p_endpoint_public_url text;
    p_endpoint_type text;

	v_endpoint_id integer;

	BEGIN

	-- TODO: sanitize schema name

	raise notice '';
	raise notice 'registering schema %', schema;

	-- check if schema not exists
	SELECT EXISTS (
	    SELECT FROM 
        	information_schema.schemata 
	    WHERE 
        	schema_name = schema
    ) into schema_exists;	
	if not schema_exists then
		raise notice 'schema % does not exist', schema;
		return;
	end if;

    -- check if not already registered
	select exists (
		select from public.schemata s
		where s.db_schema_name = schema
	) into schema_already_registered;
	if schema_already_registered then
		raise notice 'schema % is already registered', schema;
		return;
	end if;

    -- check if has the 'parameters' table
	SELECT EXISTS (
   		SELECT FROM 
	        information_schema.tables 
 	   	WHERE 
        	table_schema = schema 
	        and table_type = 'BASE TABLE'
    	    and table_name = 'parameters'
    ) into ptable_exists;
	if not ptable_exists then
		raise notice 'schema % does not have parameter table; skipping', schema;
		return;
	end if;


	-- the real work begins here
	-- gather data from parameters
	execute format('select * from %I.parameters where name = %L', schema, 'db_schema_name')  into pline;
	p_db_schema_name = pline.textvalue;
	raise notice 'db_schema_name is %', schema;
    if p_db_schema_name <> schema then
        raise notice 'provided schema name % differs from the real name %; real name will be used', p_db_schema_name, schema;
    end if;

	execute format('select * from %I.parameters where name = %L', schema, 'display_name_default')  into pline;
	p_display_name = coalesce(pline.textvalue, p_db_schema_name, schema);
	raise notice 'display_name_default is %', p_display_name;

	execute format('select * from %I.parameters where name = %L', schema, 'schema_description')  into pline;
	p_schema_description = pline.textvalue;
	raise notice 'schema_description is %', p_schema_description;


	execute format('select * from %I.parameters where name = %L', schema, 'endpoint_url')  into pline;
	p_endpoint_url = pline.textvalue;
	raise notice 'endpoint_url is %', p_endpoint_url;

	execute format('select * from %I.parameters where name = %L', schema, 'named_graph')  into pline;
	p_named_graph = pline.textvalue;
	raise notice 'named_graph is %', p_named_graph;

	execute format('select * from %I.parameters where name = %L', schema, 'endpoint_public_url')  into pline;
	p_endpoint_public_url = pline.textvalue;
	raise notice 'endpoint_public_url is %', p_endpoint_public_url;

	execute format('select * from %I.parameters where name = %L', schema, 'endpoint_type')  into pline;
	p_endpoint_type = coalesce(pline.textvalue, 'generic');
	raise notice 'endpoint_type is %', p_endpoint_type;


    -- ensure that the display name does not collide
    select exists (
        select from public.schemata
        where display_name = p_display_name
    ) into display_name_collision;
    if display_name_collision then
        raise notice 'display name % is already used; using uuid instead', p_display_name;
        p_display_name := gen_random_uuid()::text;
    end if;


	-- find or insert endpoint
    insert into public.endpoints (sparql_url, public_url, named_graph, endpoint_type) 
        values (p_endpoint_url, p_endpoint_public_url, p_named_graph, p_endpoint_type) 
        on conflict (coalesce(sparql_url, '@@'), coalesce(named_graph, '@@'))
            DO UPDATE
            SET public_url = p_endpoint_public_url, endpoint_type = p_endpoint_type
        returning id into v_endpoint_id;

    -- check if endpoint already used
    select exists (
        select from public.schemata
        where endpoint_id = v_endpoint_id
    ) into endpoint_already_used;
    

	-- insert into schemata
    insert into public.schemata (display_name, db_schema_name, description, endpoint_id, is_active, is_default_for_endpoint, tags) 
        values(p_display_name, schema, p_schema_description, v_endpoint_id, true, not endpoint_already_used, '{}');

	raise notice 'schema % has been successfully registered', schema;	

	END;
$$;


--
-- Name: register_schemata(); Type: PROCEDURE; Schema: public; Owner: -
--

CREATE PROCEDURE public.register_schemata()
    LANGUAGE plpgsql
    AS $$
    -- version 2024-10-25
	declare
		one_schema text;
	BEGIN
	for one_schema in
		SELECT schema_name 
		FROM information_schema.schemata 
		WHERE schema_name !~ '^pg_' 
			AND schema_name <> 'information_schema'
			AND schema_name !~ '^empty'
			AND schema_name <> 'public'
		EXCEPT
		SELECT db_schema_name
		FROM public.schemata
	loop
		call public.register_one_schema(one_schema);	
	end loop;

    raise notice 'all schemata are in the schema reqistry';

    for one_schema in
        SELECT db_schema_name
        FROM public.schemata
        EXCEPT
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name !~ '^pg_' 
            AND schema_name <> 'information_schema'
            AND schema_name !~ '^empty'
            AND schema_name <> 'public'
    loop
        raise notice '';
        raise notice 'orphan registry entry for missing schema % found', one_schema;
    end loop;

	END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: endpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.endpoints (
    id integer NOT NULL,
    sparql_url text,
    public_url text,
    named_graph text,
    endpoint_type text DEFAULT 'generic'::text NOT NULL
);


--
-- Name: endpoints_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.endpoints ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.endpoints_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ns_prefixes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ns_prefixes (
    id integer NOT NULL,
    abbr text NOT NULL,
    prefix text NOT NULL
);


--
-- Name: TABLE ns_prefixes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.ns_prefixes IS 'saīsinājumi un prefiksi no vietnes prefix.cc';


--
-- Name: ns_prefixes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.ns_prefixes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ns_prefixes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: schemata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schemata (
    id integer NOT NULL,
    display_name text,
    db_schema_name text,
    description text,
    endpoint_id integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_default_for_endpoint boolean DEFAULT false NOT NULL,
    order_inx integer DEFAULT 101 NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL
);


--
-- Name: schemata_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.schemata ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.schemata_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: schemata_tags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schemata_tags (
    id integer NOT NULL,
    name text NOT NULL,
    display_name text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: schemata_tags_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.schemata_tags ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.schemata_tags_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tree_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tree_profiles (
    id integer NOT NULL,
    profile_name text NOT NULL,
    data jsonb,
    is_default boolean DEFAULT false NOT NULL
);


--
-- Name: tree_profile_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.tree_profiles ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tree_profile_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: v_configurations; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_configurations AS
 SELECT s.id,
    s.display_name,
    s.db_schema_name,
    s.description,
    s.endpoint_id,
    s.is_active,
    s.is_default_for_endpoint,
    s.order_inx,
    s.tags,
    e.sparql_url,
    e.public_url,
    e.named_graph,
    e.endpoint_type
   FROM public.schemata s,
    public.endpoints e
  WHERE (e.id = s.endpoint_id)
  ORDER BY s.order_inx, s.id;


--
-- Data for Name: endpoints; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.endpoints (id, sparql_url, public_url, named_graph, endpoint_type) FROM stdin;
\.


--
-- Data for Name: ns_prefixes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.ns_prefixes (id, abbr, prefix) FROM stdin;
1	madsrdf	http://www.loc.gov/mads/rdf/v1#
2	bflc	http://id.loc.gov/ontologies/bflc/
3	rdf	http://www.w3.org/1999/02/22-rdf-syntax-ns#
4	foaf	http://xmlns.com/foaf/0.1/
5	yago	http://yago-knowledge.org/resource/
6	rdfs	http://www.w3.org/2000/01/rdf-schema#
7	dbo	http://dbpedia.org/ontology/
8	ex	http://example.org/
9	dbp	http://dbpedia.org/property/
10	dc	http://purl.org/dc/elements/1.1/
11	owl	http://www.w3.org/2002/07/owl#
12	gr	http://purl.org/goodrelations/v1#
13	spacerel	http://data.ordnancesurvey.co.uk/ontology/spatialrelations/
14	skos	http://www.w3.org/2004/02/skos/core#
15	geo	http://www.opengis.net/ont/geosparql#
16	schema	http://schema.org/
17	xsd	http://www.w3.org/2001/XMLSchema#
18	dcat	http://www.w3.org/ns/dcat#
19	bf	http://id.loc.gov/ontologies/bibframe/
20	search	http://sindice.com/vocab/search#
21	sd	http://www.w3.org/ns/sparql-service-description#
22	qb	http://purl.org/linked-data/cube#
23	org	http://www.w3.org/ns/org#
24	dct	http://purl.org/dc/terms/
25	frbr	http://purl.org/vocab/frbr/core#
26	dcterms	http://purl.org/dc/terms/
27	prov	http://www.w3.org/ns/prov#
28	sioc	http://rdfs.org/sioc/ns#
29	xtypes	http://purl.org/xtypes/
30	ont	http://purl.org/net/ns/ontology-annot#
31	dbpedia	http://dbpedia.org/resource/
32	commerce	http://search.yahoo.com/searchmonkey/commerce/
33	void	http://rdfs.org/ns/void#
34	onto	http://www.ontotext.com/
35	rss	http://purl.org/rss/1.0/
36	bibo	http://purl.org/ontology/bibo/
37	gldp	http://www.w3.org/ns/people#
38	vcard	http://www.w3.org/2006/vcard/ns#
39	dbr	http://dbpedia.org/resource/
40	geonames	http://www.geonames.org/ontology#
41	event	http://purl.org/NET/c4dm/event.owl#
42	fb	http://rdf.freebase.com/ns/
43	pto	http://www.productontology.org/id/
44	wd	http://www.wikidata.org/entity/
45	dcmit	http://purl.org/dc/dcmitype/
46	cc	http://creativecommons.org/ns#
47	oo	http://purl.org/openorg/
48	md	http://www.w3.org/ns/md#
49	doap	http://usefulinc.com/ns/doap#
50	sc	http://purl.org/science/owl/sciencecommons/
51	rr	http://www.w3.org/ns/r2rml#
52	swrc	http://swrc.ontoware.org/ontology#
53	prog	http://purl.org/prog/
54	gen	http://purl.org/gen/0.1#
55	dbpprop	http://dbpedia.org/property/
56	vann	http://purl.org/vocab/vann/
57	content	http://purl.org/rss/1.0/modules/content/
58	nie	http://www.semanticdesktop.org/ontologies/2007/01/19/nie#
59	http	http://www.w3.org/2011/http#
60	ma	http://www.w3.org/ns/ma-ont#
61	sio	http://semanticscience.org/resource/
62	wot	http://xmlns.com/wot/0.1/
63	tl	http://purl.org/NET/c4dm/timeline.owl#
64	ov	http://open.vocab.org/terms/
65	akt	http://www.aktors.org/ontology/portal#
66	fn	http://www.w3.org/2005/xpath-functions#
67	aiiso	http://purl.org/vocab/aiiso/schema#
68	dcterm	http://purl.org/dc/terms/
69	swc	http://data.semanticweb.org/ns/swc/ontology#
70	vs	http://www.w3.org/2003/06/sw-vocab-status/ns#
71	cv	http://rdfs.org/resume-rdf/
72	obo	http://purl.obolibrary.org/obo/
73	ical	http://www.w3.org/2002/12/cal/ical#
74	marcrel	http://id.loc.gov/vocabulary/relators/
75	crm	http://www.cidoc-crm.org/cidoc-crm/
76	earl	http://www.w3.org/ns/earl#
77	xhtml	http://www.w3.org/1999/xhtml#
78	dbowl	http://ontology.cybershare.utep.edu/dbowl/relational-to-ontology-mapping-primitive.owl#
79	mo	http://purl.org/ontology/mo/
80	rel	http://purl.org/vocab/relationship/
81	prop	http://dbpedia.org/property/
82	bio	http://purl.org/vocab/bio/0.1/
83	daia	http://purl.org/ontology/daia/
84	dcam	http://purl.org/dc/dcam/
85	xmp	http://ns.adobe.com/xap/1.0/
86	ad	http://schemas.talis.com/2005/address/schema#
87	cs	http://purl.org/vocab/changeset/schema#
88	rdfg	http://www.w3.org/2004/03/trix/rdfg-1/
89	dc11	http://purl.org/dc/elements/1.1/
90	bill	http://www.rdfabout.com/rdf/schema/usbill/
91	test2	http://this.invalid/test2#
92	dv	http://rdf.data-vocabulary.org/#
93	factbook	http://wifo5-04.informatik.uni-mannheim.de/factbook/ns#
94	co	http://purl.org/ontology/co/core#
95	xhv	http://www.w3.org/1999/xhtml/vocab#
96	og	http://ogp.me/ns#
97	musim	http://purl.org/ontology/similarity/
98	air	http://dig.csail.mit.edu/TAMI/2007/amord/air#
99	d2rq	http://www.wiwiss.fu-berlin.de/suhl/bizer/D2RQ/0.1#
100	log	http://www.w3.org/2000/10/swap/log#
101	pc	http://purl.org/procurement/public-contracts#
102	xs	http://www.w3.org/2001/XMLSchema#
103	book	http://purl.org/NET/book/vocab#
104	afn	http://jena.hpl.hp.com/ARQ/function#
105	admin	http://webns.net/mvcb/
106	ir	http://www.ontologydesignpatterns.org/cp/owl/informationrealization.owl#
107	media	http://search.yahoo.com/searchmonkey/media/
108	mu	http://mu.semte.ch/vocabularies/core/
109	xfn	http://gmpg.org/xfn/11#
110	ctag	http://commontag.org/ns#
111	biblio	http://purl.org/net/biblio#
112	days	http://ontologi.es/days#
113	tzont	http://www.w3.org/2006/timezone#
114	time	http://www.w3.org/2006/time#
115	botany	http://purl.org/NET/biol/botany#
116	xf	http://www.w3.org/2002/xforms/
117	sism	http://purl.oclc.org/NET/sism/0.1/
118	reco	http://purl.org/reco#
119	cal	http://www.w3.org/2002/12/cal/ical#
120	dcq	http://purl.org/dc/qualifiers/1.0/
121	tag	http://www.holygoat.co.uk/owl/redwood/0.1/tags/
122	osag	http://www.ordnancesurvey.co.uk/ontology/AdministrativeGeography/v2.0/AdministrativeGeography.rdf#
123	cyc	http://sw.opencyc.org/concept/
124	dir	http://schemas.talis.com/2005/dir/schema#
125	con	http://www.w3.org/2000/10/swap/pim/contact#
126	af	http://purl.org/ontology/af/
127	rif	http://www.w3.org/2007/rif#
128	cld	http://purl.org/cld/terms/
129	myspace	http://purl.org/ontology/myspace#
130	ome	http://purl.org/ontomedia/core/expression#
131	sr	http://www.openrdf.org/config/repository/sail#
132	cmp	http://www.ontologydesignpatterns.org/cp/owl/componency.owl#
133	memo	http://ontologies.smile.deri.ie/2009/02/27/memo#
134	sdmx	http://purl.org/linked-data/sdmx#
135	rev	http://purl.org/stuff/rev#
136	jdbc	http://d2rq.org/terms/jdbc/
137	ok	http://okkam.org/terms#
138	unit	http://qudt.org/vocab/unit/
139	math	http://www.w3.org/2000/10/swap/math#
140	giving	http://ontologi.es/giving#
141	swande	http://purl.org/swan/1.2/discourse-elements/
142	oa	http://www.w3.org/ns/oa#
143	swanq	http://purl.org/swan/1.2/qualifiers/
144	lomvoc	http://ltsc.ieee.org/rdf/lomv1p0/vocabulary#
145	dcn	http://www.w3.org/2007/uwa/context/deliverycontext.owl#
146	owlim	http://www.ontotext.com/trree/owlim#
147	gn	http://www.geonames.org/ontology#
148	sdmxdim	http://purl.org/linked-data/sdmx/2009/dimension#
149	as	https://www.w3.org/ns/activitystreams#
150	cfp	http://sw.deri.org/2005/08/conf/cfp.owl#
151	qudt	http://qudt.org/schema/qudt/
152	photoshop	http://ns.adobe.com/photoshop/1.0/
153	wfs	http://schemas.opengis.net/wfs/
154	omn	http://open-multinet.info/ontology/omn#
155	exif	http://www.w3.org/2003/12/exif/ns#
156	sdmxa	http://purl.org/linked-data/sdmx/2009/attribute#
157	lyou	http://purl.org/linkingyou/
158	om	http://opendata.caceres.es/def/ontomunicipio#
159	xsi	http://www.w3.org/2001/XMLSchema-instance#
160	adms	http://www.w3.org/ns/adms#
161	type	https://webiomed.ai/blog/obzor-rossiiskikh-sistem-podderzhki-priniatiia-vrachebnykh-reshenii/
162	dul	http://www.ontologydesignpatterns.org/ont/dul/DUL.owl#
163	lemon	http://lemon-model.net/lemon#
164	swrl	http://www.w3.org/2003/11/swrl#
165	cert	http://www.w3.org/ns/auth/cert#
166	ontology	http://dbpedia.org/ontology/
167	swrcfe	http://www.morelab.deusto.es/ontologies/swrcfe#
168	cnt	http://www.w3.org/2011/content#
169	swrlb	http://www.w3.org/2003/11/swrlb#
170	isbd	http://iflastandards.info/ns/isbd/elements/
171	ore	http://www.openarchives.org/ore/terms/
172	db	http://dbpedia.org/
173	edm	http://www.europeana.eu/schemas/edm/
174	eat	http://www.eat.rl.ac.uk/#
175	openlinks	http://www.openlinksw.com/schemas/virtrdf#
176	nfo	http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#
177	aat	http://vocab.getty.edu/aat/
178	fabio	http://purl.org/spar/fabio/
179	nif	http://persistence.uni-leipzig.org/nlp2rdf/ontologies/nif-core#
180	voaf	http://purl.org/vocommons/voaf#
181	ac	http://umbel.org/umbel/ac/
182	sf	http://www.opengis.net/ont/sf#
183	skosxl	http://www.w3.org/2008/05/skos-xl#
184	gtfs	http://vocab.gtfs.org/terms#
185	sioct	http://rdfs.org/sioc/types#
186	scovo	http://purl.org/NET/scovo#
187	siocserv	http://rdfs.org/sioc/services#
188	prism	http://prismstandard.org/namespaces/basic/2.0/
189	gvp	http://vocab.getty.edu/ontology#
190	eg	http://www.example.org/
191	tgn	http://vocab.getty.edu/tgn/
192	geoes	http://geo.linkeddata.es/resource/
193	room	http://vocab.deri.ie/rooms#
194	ldp	http://www.w3.org/ns/ldp#
195	drugbank	http://www4.wiwiss.fu-berlin.de/drugbank/resource/drugbank/
196	coref	http://www.rkbexplorer.com/ontologies/coref#
197	test	http://test2.example.com/
198	ulan	http://vocab.getty.edu/ulan/
199	pmlj	http://inference-web.org/2.0/pml-justification.owl#
200	uniprot	http://purl.uniprot.org/core/
201	core	http://vivoweb.org/ontology/core#
202	ptr	http://www.w3.org/2009/pointers#
203	lv	http://purl.org/lobid/lv#
204	ssn	http://www.w3.org/ns/ssn/
205	dbc	http://dbpedia.org/resource/Category:
206	acc	http://purl.org/NET/acc#
207	gold	http://purl.org/linguistics/gold/
208	georss	http://www.georss.org/georss/
209	go	http://purl.org/obo/owl/GO#
210	nsogi	http://prefix.cc/nsogi:
211	doc	http://www.w3.org/2000/10/swap/pim/doc#
212	dbprop	http://dbpedia.org/property/
213	bif	http://www.openlinksw.com/schemas/bif#
214	dce	http://purl.org/dc/elements/1.1/
215	movie	http://data.linkedmdb.org/resource/movie/
216	whois	http://www.kanzaki.com/ns/whois#
217	space	http://purl.org/net/schemas/space/
218	rsa	http://www.w3.org/ns/auth/rsa#
219	am	http://vocab.deri.ie/am#
220	geosparql	http://www.opengis.net/ont/geosparql#
221	rec	http://purl.org/ontology/rec/core#
222	music	http://musicontology.com/
223	cerif	http://spi-fm.uca.es/neologism/cerif#
224	java	http://www.w3.org/2007/uwa/context/java.owl#
225	akts	http://www.aktors.org/ontology/support#
226	wn	http://xmlns.com/wordnet/1.6/
227	ceo	https://linkeddata.cultureelerfgoed.nl/vocab/def/ceo#
228	sh	http://www.w3.org/ns/shacl#
229	lexinfo	http://www.lexinfo.net/ontology/2.0/lexinfo#
230	itsrdf	http://www.w3.org/2005/11/its/rdf#
231	lgd	http://linkedgeodata.org/triplify/
232	cco	http://www.ontologyrepository.com/CommonCoreOntologies/
233	dblp	http://dblp.uni-trier.de/rdf/schema-2015-01-26#
234	nmo	http://www.semanticdesktop.org/ontologies/2007/03/22/nmo#
235	loc	http://www.w3.org/2007/uwa/context/location.owl#
236	ro	http://purl.org/obo/owl/ro#
237	sider	http://www4.wiwiss.fu-berlin.de/sider/resource/sider/
238	sparql	http://www.w3.org/ns/sparql#
239	imm	http://schemas.microsoft.com/imm/
240	wdt	http://www.wikidata.org/prop/direct/
241	gndo	http://d-nb.info/standards/elementset/gnd#
242	ti	http://www.ontologydesignpatterns.org/cp/owl/timeinterval.owl#
243	sec	https://w3id.org/security#
244	nao	http://www.semanticdesktop.org/ontologies/2007/08/15/nao#
245	httph	http://www.w3.org/2007/ont/httph#
246	mods	http://www.loc.gov/mods/v3#
247	acl	http://www.w3.org/ns/auth/acl#
248	cdm	http://publications.europa.eu/ontology/cdm#
249	cito	http://purl.org/spar/cito/
250	po	http://purl.org/ontology/po/
251	service	http://purl.org/ontology/service#
252	acm	http://www.rkbexplorer.com/ontologies/acm#
253	wn20schema	http://www.w3.org/2006/03/wn/wn20/schema/
254	pat	http://purl.org/hpi/patchr#
255	sp	http://spinrdf.org/sp#
256	dbpediaowl	http://dbpedia.org/owl/
257	ping	https://namso-gen.com/
258	gd	http://rdf.data-vocabulary.org/#
259	kb	http://deductions.sf.net/ontology/knowledge_base.owl#
260	zoology	http://purl.org/NET/biol/zoology#
261	organism	http://eulersharp.sourceforge.net/2003/03swap/organism#
262	atom	http://www.w3.org/2005/Atom/
263	lode	http://linkedevents.org/ontology/
264	cro	http://rhizomik.net/ontologies/copyrightonto.owl#
265	umbelrc	http://umbel.org/umbel/rc/
266	product	http://purl.org/commerce/product#
267	wdrs	http://www.w3.org/2007/05/powder-s#
268	list	http://www.w3.org/2000/10/swap/list#
269	ecs	http://rdf.ecs.soton.ac.uk/ontology/ecs#
270	prv	http://purl.org/net/provenance/ns#
271	opm	https://w3id.org/opm#
272	fise	http://fise.iks-project.eu/ontology/
273	formats	http://www.w3.org/ns/formats/
274	ignf	http://data.ign.fr/def/ignf#
275	xml	http://www.w3.org/XML/1998/namespace/
276	chebi	http://bio2rdf.org/chebi:
277	swid	http://semanticweb.org/id/
278	meta	https://krr.triply.cc/krr/sameas-meta/def/
279	sesame	http://www.openrdf.org/schema/sesame#
280	bd	http://www.bigdata.com/rdf#
281	ndl	http://schemas.ogf.org/nml/2013/05/base#
282	ya	http://blogs.yandex.ru/schema/foaf/
283	wikidata	http://www.wikidata.org/entity/
284	pr	http://purl.org/ontology/prv/core#
285	nco	http://www.semanticdesktop.org/ontologies/2007/03/22/nco#
286	abc	http://www.metadata.net/harmony/ABCSchemaV5Commented.rdf#
287	olia	http://purl.org/olia/olia.owl#
288	spin	http://spinrdf.org/spin#
289	web	http://www.w3.org/2007/uwa/context/web.owl#
290	daml	http://www.daml.org/2001/03/daml+oil#
291	video	http://purl.org/ontology/video#
292	mf	http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#
293	up	http://purl.uniprot.org/core/
294	resist	http://www.rkbexplorer.com/ontologies/resist#
295	irw	http://www.ontologydesignpatterns.org/ont/web/irw.owl#
296	site	http://ns.ontowiki.net/SysOnt/Site/
297	gnd	http://d-nb.info/gnd/
298	xlink	https://es.scribd.com/doc/79794476/05-Ejercicios-Resueltos-Caja-Negra-y-Recapitulacion/
299	sit	http://www.ontologydesignpatterns.org/cp/owl/situation.owl#
300	wo	http://purl.org/ontology/wo/
301	penn	http://purl.org/olia/penn.owl#
302	protege	http://protege.stanford.edu/system#
303	link	http://www.w3.org/2006/link#
304	smf	http://topbraid.org/sparqlmotionfunctions#
305	geof	http://www.opengis.net/def/function/geosparql/
306	scot	http://rdfs.org/scot/ns#
307	admingeo	http://data.ordnancesurvey.co.uk/ontology/admingeo/
308	pext	http://www.ontotext.com/proton/protonext#
309	ms	http://purl.org/obo/owl/MS#
310	hydra	http://www.w3.org/ns/hydra/core#
311	biocore	http://bio2rdf.org/core#
312	cgov	http://reference.data.gov.uk/def/central-government/
313	biol	http://purl.org/NET/biol/ns#
314	omt	http://purl.org/ontomedia/ext/common/trait#
315	postcode	http://data.ordnancesurvey.co.uk/id/postcodeunit/
316	bp	http://www.biopax.org/release/biopax-level3.owl#
317	fresnel	http://www.w3.org/2004/09/fresnel#
318	hg	http://rdf.histograph.io/
319	myspo	http://purl.org/ontology/myspace#
320	pmt	http://tipsy.googlecode.com/svn/trunk/vocab/pmt#
321	politico	http://www.rdfabout.com/rdf/schema/politico/
322	cpa	http://www.ontologydesignpatterns.org/schemas/cpannotationschema.owl#
323	leaks	https://cuzin.com/
324	user	http://schemas.talis.com/2005/user/schema#
325	example	http://www.example.org/rdf#
326	granatum	http://chem.deri.ie/granatum/
327	rdfsharp	https://rdfsharp.codeplex.com/
328	omb	http://purl.org/ontomedia/ext/common/being#
329	leak	http://data.ontotext.com/resource/leak/
330	xkos	http://rdf-vocabulary.ddialliance.org/xkos#
331	food	http://purl.org/foodontology#
332	rnews	http://iptc.org/std/rNews/2011-10-07#
333	label	http://purl.org/net/vocab/2004/03/label#
334	climb	http://climb.dataincubator.org/vocabs/climb/
335	mit	http://purl.org/ontology/mo/mit#
336	ontolex	http://www.w3.org/ns/lemon/ontolex#
337	dctype	http://purl.org/dc/dcmitype/
338	wgs84	http://www.w3.org/2003/01/geo/wgs84_pos#
339	pav	http://purl.org/pav/
340	disco	http://rdf-vocabulary.ddialliance.org/discovery#
341	oc	http://opencoinage.org/rdf/
342	lfn	http://www.dotnetrdf.org/leviathan#
343	ddc	http://purl.org/NET/decimalised#
344	ass	http://uptheasset.org/ontology#
345	nt	http://ns.inria.fr/nicetag/2010/09/09/voc#
346	cidoc	http://www.cidoc-crm.org/cidoc-crm/
347	acco	http://purl.org/acco/ns#
348	wgs	http://www.w3.org/2003/01/geo/wgs84_pos#
349	lx	http://purl.org/NET/lx#
350	umbel	http://umbel.org/umbel#
351	bibtex	http://purl.org/net/nknouf/ns/bibtex#
352	oauth	http://demiblog.org/vocab/oauth#
353	npg	http://ns.nature.com/terms/
354	fec	http://www.rdfabout.com/rdf/schema/usfec/
355	sdl	http://purl.org/vocab/riro/sdl#
356	meteo	http://purl.org/ns/meteo#
357	spl	http://spinrdf.org/spl#
358	gso	http://www.w3.org/2006/gen/ont#
359	wv	http://vocab.org/waiver/terms/
360	conv	http://purl.org/twc/vocab/conversion/
361	rdau	http://rdaregistry.info/Elements/u/
362	taxo	http://purl.org/rss/1.0/modules/taxonomy/
363	doac	http://ramonantonio.net/doac/0.1/#
364	purl	http://www.purl.org/
365	agg	http://purl.org/twc/health/vocab/aggregate/
366	opensearch	http://a9.com/-/spec/opensearch/1.1/
367	inno	http://purl.org/innovation/ns#
368	dbnary	http://kaiko.getalp.org/dbnary#
369	contact	http://www.w3.org/2000/10/swap/pim/contact#
370	compass	http://purl.org/net/compass#
371	omc	http://purl.org/ontomedia/ext/common/bestiary#
372	pim	http://www.w3.org/ns/pim/space#
373	sdo	https://schema.org/
374	lime	http://www.w3.org/ns/lemon/lime#
375	atomix	http://buzzword.org.uk/rdf/atomix#
376	ps	https://w3id.org/payswarm#
377	ocd	http://dati.camera.it/ocd/
378	fed	http://www.openrdf.org/config/sail/federation#
379	st	http://ns.inria.fr/sparql-template/
380	bag	https://bag2.basisregistraties.overheid.nl/bag/def/
381	powder	http://www.w3.org/2007/05/powder#
382	eu	http://eulersharp.sourceforge.net/2003/03swap/log-rules#
383	xro	http://purl.org/xro/ns#
384	ngeo	http://geovocab.org/geometry#
385	lang	http://ontologi.es/lang/core#
386	bio2rdf	http://bio2rdf.org/
387	rdac	http://rdaregistry.info/Elements/c/
388	interval	http://reference.data.gov.uk/def/intervals/
389	tmo	http://www.semanticdesktop.org/ontologies/2008/05/20/tmo#
390	efo	http://www.ebi.ac.uk/efo/
391	es	http://eulersharp.sourceforge.net/2003/03swap/log-rules#
392	prj	http://purl.org/stuff/project/
393	rep	http://www.openrdf.org/config/repository#
394	rdrel	http://rdvocab.info/RDARelationshipsWEMI/
395	xen	http://buzzword.org.uk/rdf/xen#
396	profiling	http://ontologi.es/profiling#
397	audio	http://purl.org/media/audio#
398	gpt	http://purl.org/vocab/riro/gpt#
399	sco	http://purl.org/ontology/sco#
400	sim	http://purl.org/ontology/similarity/
401	xhe	http://buzzword.org.uk/rdf/xhtml-elements#
402	game	http://data.totl.net/game/
403	ref	http://purl.org/vocab/relationship/
404	courseware	http://courseware.rkbexplorer.com/ontologies/courseware#
405	rei	http://www.w3.org/2004/06/rei#
406	gsp	http://www.opengis.net/ont/geosparql#
407	ire	http://www.ontologydesignpatterns.org/cpont/ire.owl#
408	code	http://telegraphis.net/ontology/measurement/code#
409	soft	http://www.w3.org/2007/uwa/context/software.owl#
410	iot	http://iotschema.org/
411	awol	http://bblfish.net/work/atom-owl/2006-06-06/#
412	money	http://purl.org/net/rdf-money/
413	uco	http://purl.org/uco/ns#
414	isothes	http://purl.org/iso25964/skos-thes#
415	doclist	http://www.junkwork.net/xml/DocumentList#
416	tdb	http://jena.hpl.hp.com/2008/tdb#
417	phil	http://philosurfical.open.ac.uk/ontology/philosurfical.owl#
418	string	http://www.w3.org/2000/10/swap/string#
419	usgov	http://www.rdfabout.com/rdf/schema/usgovt/
420	sede	http://eventography.org/sede/0.1/
421	tio	http://purl.org/tio/ns#
422	name	http://example.org/name#
423	lom	http://ltsc.ieee.org/rdf/lomv1p0/lom#
424	omm	http://purl.org/ontomedia/core/media#
425	cordis	http://cordis.europa.eu/projects/
426	os	http://www.w3.org/2000/10/swap/os#
427	so	http://purl.org/ontology/symbolic-music/
428	overheid	http://standaarden.overheid.nl/owms/
429	hlisting	http://sindice.com/hlisting/0.1/
430	hard	http://www.w3.org/2007/uwa/context/hardware.owl#
431	omp	http://purl.org/ontomedia/ext/common/profession#
432	push	http://www.w3.org/2007/uwa/context/push.owl#
433	sv	http://schemas.talis.com/2005/service/schema#
434	cycann	http://sw.cyc.com/CycAnnotations_v1#
435	dailymed	http://www4.wiwiss.fu-berlin.de/dailymed/resource/dailymed/
436	wiki	http://en.wikipedia.org/wiki/
437	lfm	http://purl.org/ontology/last-fm/
438	swp	http://www.w3.org/2004/03/trix/swp-2/
439	worldbank	http://worldbank.270a.info/dataset/
440	chord	http://purl.org/ontology/chord/
441	rdagr1	http://rdvocab.info/Elements/
442	rdfa	http://www.w3.org/ns/rdfa#
443	nrl	http://www.semanticdesktop.org/ontologies/2007/08/15/nrl#
444	seas	https://w3id.org/seas/
445	spc	http://purl.org/ontomedia/core/space#
446	airport	http://www.daml.org/2001/10/html/airport-ont#
447	sport	http://www.bbc.co.uk/ontologies/sport/
448	custom	http://www.openrdf.org/config/sail/custom#
449	edam	http://edamontology.org/
450	affy	http://www.affymetrix.com/community/publications/affymetrix/tmsplice#
451	biopax	http://www.biopax.org/release/biopax-level3.owl#
452	xl	http://langegger.at/xlwrap/vocab#
453	ero	http://purl.obolibrary.org/obo/
454	library	http://purl.org/library/
455	sysont	http://ns.ontowiki.net/SysOnt/
456	rov	http://www.w3.org/ns/regorg#
457	vote	http://www.rdfabout.com/rdf/schema/vote/
458	crypto	http://www.w3.org/2000/10/swap/crypto#
459	icaltzd	http://www.w3.org/2002/12/cal/icaltzd#
460	swivt	http://semantic-mediawiki.org/swivt/1.0#
461	exterms	http://www.example.org/terms/
462	lgdo	http://linkedgeodata.org/ontology/
463	frir	http://purl.org/twc/ontology/frir.owl#
464	p3p	http://www.w3.org/2002/01/p3prdfv1#
465	res	http://dbpedia.org/resource/
466	opo	http://online-presence.net/opo/ns#
467	rail	http://ontologi.es/rail/vocab#
468	ub	http://www.lehigh.edu/~zhp2/2004/0401/univ-bench.owl#
469	wordnet	http://wordnet-rdf.princeton.edu/ontology#
470	ui	http://www.w3.org/ns/ui#
471	vivo	http://vivoweb.org/ontology/core#
472	obj	http://www.openrdf.org/rdf/2009/object#
473	ct	http://data.linkedct.org/resource/linkedct/
474	dady	http://purl.org/NET/dady#
475	ao	http://purl.org/ontology/ao/core#
476	conversion	http://purl.org/twc/vocab/conversion/
477	greg	http://kasei.us/about/foaf.xrdf#
478	mysql	http://web-semantics.org/ns/mysql/
479	swh	http://plugin.org.uk/swh-plugins/
480	tags	http://www.holygoat.co.uk/owl/redwood/0.1/tags/
481	net	http://www.w3.org/2007/uwa/context/network.owl#
482	blt	http://www.bl.uk/schemas/bibliographic/blterms#
483	scv	http://purl.org/NET/scovo#
484	person	http://www.w3.org/ns/person#
485	like	http://ontologi.es/like#
486	muto	http://purl.org/muto/core#
487	pbo	http://purl.org/ontology/pbo/core#
488	oat	http://openlinksw.com/schemas/oat/
489	common	http://www.w3.org/2007/uwa/context/common.owl#
490	ist	http://purl.org/ontology/is/types/
491	api	http://purl.org/linked-data/api/vocab#
492	gob	http://purl.org/ontology/last-fm/
493	resource	http://purl.org/vocab/resourcelist/schema#
494	moat	http://moat-project.org/ns#
495	sail	http://www.openrdf.org/config/sail#
496	aifb	http://www.aifb.kit.edu/id/
497	pgterms	http://www.gutenberg.org/2009/pgterms/
498	cogs	http://vocab.deri.ie/cogs#
499	swandr	http://purl.org/swan/1.2/discourse-relationships/
500	iswc	http://annotation.semanticweb.org/2004/iswc#
501	bib	http://zeitkunst.org/bibtex/0.1/bibtex.owl#
502	pmlr	http://inference-web.org/2.0/pml-relation.owl#
503	pmlp	http://inference-web.org/2.0/pml-provenance.owl#
504	ttl	http://www.w3.org/2008/turtle#
505	irrl	http://www.ontologydesignpatterns.org/cp/owl/informationobjectsandrepresentationlanguages.owl#
506	lt	http://diplomski.nelakolundzija.org/LTontology.rdf#
507	states	http://www.w3.org/2005/07/aaa#
508	lu	http://www.ontologydesignpatterns.org/ont/framenet/abox/lu/
509	faldo	http://biohackathon.org/resource/faldo#
510	role	https://w3id.org/role/
511	meetup	http://www.lotico.com/meetup/
512	lastfm	http://purl.org/ontology/last-fm/
513	xforms	http://www.w3.org/2002/xforms/
514	puc	http://purl.org/NET/puc#
515	nexif	http://www.semanticdesktop.org/ontologies/2007/05/10/nexif#
516	lotico	http://www.lotico.com/resource/
517	act	http://www.w3.org/2007/rif-builtin-action#
518	anca	http://users.utcluj.ro/~raluca/rdf_ontologies_ralu/ralu_modified_ontology_pizzas2_0#
519	viaf	http://viaf.org/viaf/
520	lifecycle	http://purl.org/vocab/lifecycle/schema#
521	locn	http://www.w3.org/ns/locn#
522	dcmitype	http://purl.org/dc/dcmitype/
523	com	http://purl.org/commerce#
524	ne	http://umbel.org/umbel/ne/
525	kwijibo	http://kwijibo.talis.com/
526	play	http://uriplay.org/spec/ontology/#
632	zem	http://s.zemanta.com/ns#
527	pom	http://maven.apache.org/POM/4.0.0#
528	ddl	http://purl.org/vocab/riro/ddl#
529	swanco	http://purl.org/swan/1.2/swan-commons/
530	hcterms	http://purl.org/uF/hCard/terms/
531	cube	https://cube.link/
532	dwc	http://rs.tdwg.org/dwc/terms/
533	eco	http://www.ebusiness-unibw.org/ontologies/eclass/5.1.4/#
534	resex	http://resex.rkbexplorer.com/ontologies/resex#
535	sm	http://topbraid.org/sparqlmotion#
536	wdr	http://www.w3.org/2007/05/powder#
537	coin	http://purl.org/court/def/2009/coin#
538	wordmap	http://purl.org/net/ns/wordmap#
539	copyright	http://rhizomik.net/ontologies/copyrightonto.owl#
540	sml	http://topbraid.org/sparqlmotionlib#
541	swanqs	http://purl.org/swan/1.2/qualifiers/
542	prissma	http://ns.inria.fr/prissma/v1#
543	nid3	http://www.semanticdesktop.org/ontologies/2007/05/10/nid3#
544	gml	http://www.opengis.net/ont/gml#
545	muo	http://purl.oclc.org/NET/muo/muo#
546	pimo	http://www.semanticdesktop.org/ontologies/2007/11/01/pimo#
547	phss	http://ns.poundhill.com/phss/1.0/
548	dnr	http://www.dotnetrdf.org/configuration#
549	freebase	http://rdf.freebase.com/ns/
550	wnschema	http://www.cogsci.princeton.edu/~wn/schema/
551	conserv	http://conserv.deri.ie/ontology#
552	pobo	http://purl.obolibrary.org/obo/
553	grddl	http://www.w3.org/2003/g/data-view#
554	cpm	http://catalogus-professorum.org/cpm/2/
555	vsr	http://purl.org/twc/vocab/vsr#
556	smiley	http://www.smileyontology.com/ns#
557	is	http://purl.org/ontology/is/core#
558	dgtwc	http://data-gov.tw.rpi.edu/2009/data-gov-twc.rdf#
559	places	http://purl.org/ontology/places#
560	dummy	http://hello.com/
561	payment	http://reference.data.gov.uk/def/payment#
562	osoc	http://web-semantics.org/ns/opensocial#
563	cheminf	http://www.semanticweb.org/ontologies/cheminf.owl#
564	human	http://eulersharp.sourceforge.net/2003/03swap/human#
565	pdo	http://ontologies.smile.deri.ie/pdo#
566	apivc	http://purl.org/linked-data/api/vocab#
567	isq	http://purl.org/ontology/is/quality/
568	txn	http://lod.taxonconcept.org/ontology/txn.owl#
569	asn	http://purl.org/ASN/schema/core/
570	datafaqs	http://purl.org/twc/vocab/datafaqs#
571	ibis	http://purl.org/ibis#
572	ezcontext	http://ontologies.ezweb.morfeo-project.org/ezcontext/ns#
573	mei	http://www.music-encoding.org/ns/mei/
574	evset	http://dsnotify.org/vocab/eventset/0.1/
575	bibframe	http://bibframe.org/vocab/
576	plink	http://buzzword.org.uk/rdf/personal-link-types#
577	prot	http://www.proteinontology.info/po.owl#
578	rulz	http://purl.org/NET/rulz#
579	mime	https://www.iana.org/assignments/media-types/
580	trackback	http://madskills.com/public/xml/rss/module/trackback/
581	psych	http://purl.org/vocab/psychometric-profile/
582	olo	http://purl.org/ontology/olo/core#
583	eztag	http://ontologies.ezweb.morfeo-project.org/eztag/ns#
584	posh	http://poshrdf.org/ns/posh/
585	rdaa	http://rdaregistry.info/Elements/a/
586	httpvoc	http://www.w3.org/2006/http#
587	ludo	http://ns.inria.fr/ludo/v1#
588	lingvoj	http://www.lingvoj.org/ontology#
589	arpfo	http://vocab.ouls.ox.ac.uk/projectfunding#
590	sioca	http://rdfs.org/sioc/actions#
591	ldap	http://purl.org/net/ldap/
592	won	https://w3id.org/won/core#
593	enc	http://www.w3.org/2001/04/xmlenc#
594	session	http://redfoot.net/2005/session#
595	yoda	http://purl.org/NET/yoda#
596	tripfs	http://purl.org/tripfs/2010/02#
597	isi	http://purl.org/ontology/is/inst/
598	qdoslf	http://foaf.qdos.com/lastfm/schema/
599	lvont	http://lexvo.org/ontology#
600	ean	http://openean.kaufkauf.net/id/
601	kontakt	http://richard.cyganiak.de/
602	nsa	http://multimedialab.elis.ugent.be/organon/ontologies/ninsuna#
603	soc	http://purl.org/net/hdlipcores/ontology/soc#
604	eli	http://data.europa.eu/eli/ontology#
605	arch	http://purl.org/archival/vocab/arch#
606	c4n	http://vocab.deri.ie/c4n#
607	lp	http://launchpad.net/rdf/launchpad#
608	h5	http://buzzword.org.uk/rdf/h5#
609	b2bo	http://purl.org/b2bo#
610	address	http://schemas.talis.com/2005/address/schema#
611	coo	http://purl.org/coo/ns#
612	bsbm	http://www4.wiwiss.fu-berlin.de/bizer/bsbm/v01/vocabulary/
613	dt	http://dbpedia.org/datatype/
614	pml	http://provenanceweb.org/ns/pml#
615	urn	http://fliqz.com/
616	ic	http://imi.go.jp/ns/core/rdf#
617	rooms	http://vocab.deri.ie/rooms#
618	wikipedia	http://wikipedia.no/rdf/
619	geospecies	http://rdf.geospecies.org/ont/geospecies#
620	aos	http://rdf.muninn-project.org/ontologies/appearances#
621	dbpp	http://dbpedia.org/property/
622	ncal	http://www.semanticdesktop.org/ontologies/2007/04/02/ncal#
623	swanpav	http://purl.org/swan/1.2/pav/
624	cpv	http://purl.org/weso/cpv/
625	bte	http://purl.org/twc/vocab/between-the-edges/
626	drug	http://www.agfa.com/w3c/2009/drugTherapy#
627	pro	http://purl.org/hpi/patchr#
628	vso	http://purl.org/vso/ns#
629	tarot	http://data.totl.net/tarot/card/
630	arg	http://rdfs.org/sioc/argument#
631	xhtmlvocab	http://www.w3.org/1999/xhtml/vocab/
633	geographis	http://telegraphis.net/ontology/geography/geography#
634	iso	http://purl.org/iso25964/skos-thes#
635	oslc	http://open-services.net/ns/core#
636	sl	http://www.semanlink.net/2001/00/semanlink-schema#
637	opus	http://lsdis.cs.uga.edu/projects/semdis/opus#
638	calli	http://callimachusproject.org/rdf/2009/framework#
639	timeline	http://purl.org/NET/c4dm/timeline.owl#
640	teach	http://linkedscience.org/teach/ns#
641	lex	http://purl.org/lex#
642	uri	http://purl.org/NET/uri#
643	card	http://www.ashutosh.com/test/
644	deo	http://purl.org/spar/deo/
645	fab	http://purl.org/fab/ns#
646	muni	http://vocab.linkeddata.es/urbanismo-infraestructuras/territorio#
647	zbwext	http://zbw.eu/namespaces/zbw-extensions/
648	eprints	http://eprints.org/ontology/
649	wairole	http://www.w3.org/2005/01/wai-rdf/GUIRoleTaxonomy#
650	okkam	http://models.okkam.org/ENS-core-vocabulary#
651	voag	http://voag.linkedmodel.org/schema/voag#
652	cex	http://purl.org/weso/computex/ontology#
653	agents	http://eulersharp.sourceforge.net/2003/03swap/agent#
654	lark1	http://users.utcluj.ro/~raluca/ontology/Ontology1279614123500.owl#
655	osgb	http://data.ordnancesurvey.co.uk/id/
656	oad	http://lod.xdams.org/reload/oad/
657	br	http://vocab.deri.ie/br#
658	status	http://www.w3.org/2003/06/sw-vocab-status/ns#
659	bookmark	http://www.w3.org/2002/01/bookmark#
660	np	http://www.nanopub.org/nschema#
661	bing	http://bing.com/schema/media/
662	ann	http://www.w3.org/2000/10/annotation-ns#
663	frbre	http://purl.org/vocab/frbr/extended#
664	vitro	http://vitro.mannlib.cornell.edu/ns/vitro/public#
665	wlp	http://weblab-project.org/core/model/property/processing/
666	wai	http://purl.org/wai#
667	hospital	http://www.agfa.com/w3c/2009/hospital#
668	prvtypes	http://purl.org/net/provenance/types#
669	dive	http://scubadive.networld.to/dive.rdf#
670	dita	http://purl.org/dita/ns#
671	marl	http://www.gsi.dit.upm.es/ontologies/marl/ns#
672	eclap	http://www.eclap.eu/schema/eclap/
673	aapi	http://rdf.alchemyapi.com/rdf/v1/s/aapi-schema#
674	omv	http://omv.ontoware.org/2005/05/ontology#
675	pos	http://www.w3.org/2003/01/geo/wgs84_pos#
676	ogp	http://ogp.me/ns#
677	dcm	http://purl.org/dc/dcmitype/
678	mm	http://linkedmultimedia.org/sparql-mm/ns/2.0.0/function#
679	aair	http://xmlns.notu.be/aair#
680	xds	http://www.w3.org/2001/XMLSchema#
681	geodata	http://sws.geonames.org/
682	odrl	http://www.w3.org/ns/odrl/2/
683	mygrid	http://www.mygrid.org.uk/ontology#
684	sawsdl	http://www.w3.org/ns/sawsdl#
685	webtlab	http://webtlab.it.uc3m.es/
686	derecho	http://purl.org/derecho#
687	care	http://eulersharp.sourceforge.net/2003/03swap/care#
688	languages	http://eulersharp.sourceforge.net/2003/03swap/languages#
689	ospost	http://data.ordnancesurvey.co.uk/ontology/postcode/
690	cos	http://www.inria.fr/acacia/corese#
691	fea	http://vocab.data.gov/def/fea#
692	wisski	http://wiss-ki.eu/
693	stanford	http://purl.org/olia/stanford.owl#
694	dso	http://purl.org/ontology/dso#
695	gv	http://rdf.data-vocabulary.org/#
696	cmo	http://purl.org/twc/ontologies/cmo.owl#
697	remus	http://www.semanticweb.org/ontologies/2010/6/Ontology1279614123500.owl#
698	algo	http://securitytoolbox.appspot.com/securityAlgorithms#
699	opwn	http://www.ontologyportal.org/WordNet.owl#
700	wp	http://vocabularies.wikipathways.org/wp#
701	rdam	http://rdaregistry.info/Elements/m/
702	pmlt	http://inference-web.org/2.0/pml-trust.owl#
703	r2r	http://www4.wiwiss.fu-berlin.de/bizer/r2r/
704	tcga	http://purl.org/tcga/core#
705	tr	http://www.thomsonreuters.com/
706	osn	http://spatial.ucd.ie/lod/osn/
707	life	http://life.deri.ie/schema/
708	fd	http://foodable.co/ns/
709	pay	http://reference.data.gov.uk/def/payment#
710	xesam	http://freedesktop.org/standards/xesam/1.0/core#
711	req	http://purl.org/req/
712	agetec	http://www.agetec.org/
713	ncbitaxon	http://purl.org/obo/owl/NCBITaxon#
714	city	http://datos.localidata.com/def/City#
715	odp	http://ontologydesignpatterns.org/
716	provenir	http://knoesis.wright.edu/provenir/provenir.owl#
717	bbc	http://www.bbc.co.uk/ontologies/news/
718	nndsr	http://semanticdiet.com/schema/usda/nndsr/
719	hemogram	http://www.agfa.com/w3c/2009/hemogram#
720	prefix	http://prefix.cc/
721	imreg	http://www.w3.org/2004/02/image-regions#
722	bne	http://datos.bne.es/resource/
723	wi	http://purl.org/ontology/wi/core#
724	out	http://ontologies.hypios.com/out#
725	un	http://www.w3.org/2007/ont/unit#
726	qa	http://www.mit.jyu.fi/ai/TRUST_Ontologies/QA.owl#
727	quak	http://dev.w3.org/cvsweb/2000/quacken/vocab#
728	xfnv	http://vocab.sindice.com/xfn#
729	dbkwik	http://dbkwik.webdatacommons.org/
730	swanci	http://purl.org/swan/1.2/citations/
731	aneo	http://akonadi-project.org/ontologies/aneo#
732	dcr	http://www.isocat.org/ns/dcr.rdf#
733	visit	http://purl.org/net/vocab/2004/07/visit#
734	ppo	http://vocab.deri.ie/ppo#
735	lr	http://linkedrecipes.org/schema/
736	linkedct	http://data.linkedct.org/vocab/
737	nuts	http://dd.eionet.europa.eu/vocabulary/common/nuts/
738	oboe	http://ecoinformatics.org/oboe/oboe.1.0/oboe-core.owl#
739	dco	http://info.deepcarbon.net/schema#
740	organiz	http://eulersharp.sourceforge.net/2003/03swap/organization#
741	premis	http://www.loc.gov/premis/rdf/v1#
742	rdo	http://purl.org/rdo/ns#
743	toby	http://tobyinkster.co.uk/#
744	rda	http://www.rdaregistry.info/
745	sindice	http://vocab.sindice.net/
746	bmo	http://collection.britishmuseum.org/id/ontology/
747	gridworks	http://purl.org/net/opmv/types/gridworks#
748	wao	http://webtlab.it.uc3m.es/2010/10/WebAppsOntology#
749	sem	http://semanticweb.cs.vu.nl/2009/11/sem/
750	dayta	http://dayta.me/resource#
751	fls	http://lukasblaho.sk/football_league_schema#
752	spatial	http://geovocab.org/spatial#
753	comm	http://vocab.resc.info/communication#
754	dnb	http://d-nb.info/gnd/
755	gc	http://www.oegov.org/core/owl/gc#
756	skip	http://skipforward.net/skipforward/resource/
757	span	http://www.ifomis.org/bfo/1.1/span#
758	re	http://www.w3.org/2000/10/swap/reason#
759	xsl	http://www.w3.org/1999/XSL/Transform#
760	emotion	http://ns.inria.fr/emoca#
761	igeo	http://rdf.insee.fr/def/geo#
762	dsp	http://purl.org/metainfo/terms/dsp#
763	rlog	http://persistence.uni-leipzig.org/nlp2rdf/ontologies/rlog#
764	dbpo	http://dbpedia.org/ontology/
765	kdo	http://kdo.render-project.eu/kdo#
766	linkedmdb	http://data.linkedmdb.org/sparql/
767	opmv	http://purl.org/net/opmv/ns#
768	countries	http://eulersharp.sourceforge.net/2003/03swap/countries#
769	fowl	http://www.w3.org/TR/2003/PR-owl-guide-20031209/food#
770	esd	http://def.esd.org.uk/
771	units	http://eulersharp.sourceforge.net/2003/03swap/units#
772	ccom	http://purl.org/ontology/cco/mappings#
773	iao	http://purl.obolibrary.org/obo/iao.owl#
774	c4o	http://purl.org/spar/c4o/
775	scsv	http://purl.org/NET/schema-org-csv#
776	dis	http://stanbol.apache.org/ontology/disambiguation/disambiguation#
777	ens	http://models.okkam.org/ENS-core-vocabulary.owl#
778	bsb	http://opacplus.bsb-muenchen.de/title/
779	metalex	http://www.metalex.eu/schema/1.0#
780	prvr	http://purl.org/ontology/prv/rules#
781	prf	http://www.openmobilealliance.org/tech/profiles/UAPROF/ccppschema-20021212#
782	vra	http://purl.org/vra/
783	ple	http://pleiades.stoa.org/places/
784	sql	http://ns.inria.fr/ast/sql#
785	pf	http://jena.hpl.hp.com/ARQ/property#
786	wbc	http://worldbank.270a.info/classification/
787	article	http://ogp.me/ns/article#
788	san	http://www.irit.fr/recherches/MELODI/ontologies/SAN#
789	jita	http://aims.fao.org/aos/jita/
790	events	http://eulersharp.sourceforge.net/2003/03swap/event#
791	agent	http://eulersharp.sourceforge.net/2003/03swap/agent#
792	commons	http://commons.psi.enakting.org/def/
793	open	http://open.vocab.org/terms/
794	cao	http://purl.org/makolab/caont/
795	orca	http://geni-orca.renci.org/owl/topology.owl#
796	sig	http://purl.org/signature#
797	theatre	http://purl.org/theatre#
798	gelo	http://krauthammerlab.med.yale.edu/ontologies/gelo#
799	arecipe	http://purl.org/amicroformat/arecipe/
800	wbp	http://worldbank.270a.info/property/
801	agrelon	http://d-nb.info/standards/elementset/agrelon#
802	xch	http://oanda2rdf.appspot.com/xch/
803	evopat	http://ns.aksw.org/Evolution/
804	recipe	http://linkedrecipes.org/schema/
805	bioskos	http://eulersharp.sourceforge.net/2003/03swap/bioSKOSSchemes#
806	elog	http://eulersharp.sourceforge.net/2003/03swap/log-rules#
807	oper	http://sweet.jpl.nasa.gov/2.0/mathOperation.owl#
808	vaem	http://www.linkedmodel.org/schema/vaem#
809	swpo	http://sw-portal.deri.org/ontologies/swportal#
810	geom	http://data.ign.fr/def/geometrie#
811	tmpl	http://purl.org/restdesc/http-template#
812	hxl	http://hxl.humanitarianresponse.info/ns/#
813	health	http://purl.org/twc/health/vocab/
814	enhancer	http://stanbol.apache.org/ontology/enhancer/enhancer#
815	atomowl	http://bblfish.net/work/atom-owl/2006-06-06/#
816	aims	http://aims.fao.org/aos/common/
817	gazetteer	http://data.ordnancesurvey.co.uk/ontology/50kGazetteer/
818	reve	http://data.eurecom.fr/ontology/reve#
819	transit	http://vocab.org/transit/terms/
820	semtweet	http://semantictweet.com/
821	decl	http://www.linkedmodel.org/1.0/schema/decl#
822	xbrli	http://www.xbrl.org/2003/instance#
823	dgfoaf	http://west.uni-koblenz.de/ontologies/2010/07/dgfoaf.owl#
824	mte	http://nl.ijs.si/ME/owl/
825	uni	http://purl.org/weso/uni/uni.html#
826	cidoccrm	http://purl.org/NET/cidoc-crm/core#
827	infosys	http://www.infosys.com/
828	oboro	http://obofoundry.org/ro/ro.owl#
829	oboso	http://purl.org/obo/owl/SO#
830	swanag	http://purl.org/swan/1.2/agents/
831	admssw	http://purl.org/adms/sw/
832	pna	http://data.press.net/ontology/asset/
833	rv	http://wifo-ravensburg.de/semanticweb.rdf#
834	fbgeo	http://rdf.freebase.com/ns/location/geocode/
835	rad	http://www.w3.org/ns/rad#
836	nocal	http://vocab.deri.ie/nocal#
837	protons	http://proton.semanticweb.org/2005/04/protons#
838	htir	http://www.w3.org/2011/http#
839	dbt	http://dbpedia.org/resource/Template:
840	frapo	http://purl.org/cerif/frapo/
841	vocab	http://rdf.ontology2.com/vocab#
842	pol	http://escience.rpi.edu/ontology/semanteco/2/0/pollution.owl#
843	ends	http://labs.mondeca.com/vocab/endpointStatus#
844	place	http://purl.org/ontology/places/
845	fl	http://eulersharp.sourceforge.net/2003/03swap/fl-rules#
846	w3p	http://prov4j.org/w3p/
847	pccz	http://purl.org/procurement/public-contracts-czech#
848	coun	http://www.daml.org/2001/09/countries/iso-3166-ont#
849	wgspos	http://www.w3.org/2003/01/geo/wgs84_pos#
850	hp	http://purl.org/voc/hp/
851	wl	http://www.wsmo.org/ns/wsmo-lite#
852	genab	http://eulersharp.sourceforge.net/2003/03swap/genomeAbnormality#
853	sgv	http://www.w3.org/TR/SVG/
854	xt	http://purl.org/twc/vocab/cross-topix#
855	italy	http://data.kasabi.com/dataset/italy/schema/
856	idemo	http://rdf.insee.fr/def/demo#
857	set	http://www.w3.org/2000/10/swap/set#
858	shv	http://ns.aksw.org/spatialHierarchy/
859	clineva	http://www.agfa.com/w3c/2009/clinicalEvaluation#
860	rating	http://www.tvblob.com/ratings/#
861	mp	http://jicamaro.info/mp#
862	loticoowl	http://www.lotico.com/ontology/
863	govtrackus	http://www.rdfabout.com/rdf/usgov/geo/us/
864	spif	http://spinrdf.org/spif#
865	cb	http://cbasewrap.ontologycentral.com/vocab#
866	eseduc	http://www.purl.org/ontologia/eseduc#
867	pns	http://data.press.net/ontology/stuff/
868	rlno	http://rdflivenews.aksw.org/ontology/
869	visko	http://trust.utep.edu/visko/ontology/visko-operator-v3.owl#
870	doco	http://purl.org/spar/doco/
871	penis	http://penis.to/#
872	bfo	http://purl.obolibrary.org/obo/
873	kupkb	http://www.e-lico.eu/data/kupkb/
874	aigp	http://swat.cse.lehigh.edu/resources/onto/aigp.owl#
875	ecb	http://ecb.270a.info/class/1.0/
876	dtype	http://www.linkedmodel.org/schema/dtype#
877	myprefix	http://myprefix.org/
878	prolog	http://eulersharp.sourceforge.net/2003/03swap/prolog#
879	nyt	http://data.nytimes.com/
880	tei	http://www.tei-c.org/ns/1.0/
881	fcm	http://eulersharp.sourceforge.net/2006/02swap/fcm#
882	wapp	http://ns.rww.io/wapp#
883	rdaw	http://rdaregistry.info/Elements/w/
884	oax	http://www.w3.org/ns/openannotation/extensions/
885	csvw	http://www.w3.org/ns/csvw#
886	hgnc	http://bio2rdf.org/hgnc:
887	taxon	http://purl.org/biodiversity/taxon/
888	pne	http://data.press.net/ontology/event/
889	carfo	http://purl.org/carfo#
890	oboinowl	http://www.geneontology.org/formats/oboInOwl#
891	sdgp	http://stats.data-gov.ie/property/
892	func	http://www.w3.org/2007/rif-builtin-function#
893	ipad	http://www.padinthecity.com/
894	oj	http://ontojob.at/
895	owls	http://www.daml.org/services/owl-s/1.2/Service.owl#
896	coeus	http://bioinformatics.ua.pt/coeus/
897	artstor	http://simile.mit.edu/2003/10/ontologies/artstor#
898	xmls	http://www.w3.org/2001/XMLSchema#
899	intervals	http://reference.data.gov.uk/def/intervals/
900	aersv	http://aers.data2semantics.org/vocab/
901	wfm	http://purl.org/net/wf-motifs#
902	lctr	http://data.linkedct.org/vocab/resource/
903	flow	http://www.w3.org/2005/01/wf/flow#
904	geofla	http://data.ign.fr/ontologies/geofla#
905	ufmedia	http://purl.org/microformat/hmedia/
906	ccard	http://purl.org/commerce/creditcard#
907	rdfdf	http://www.openlinksw.com/virtrdf-data-formats#
908	kw	http://kwantu.net/kw/
909	nxp	http://purl.org/nxp/schema/v1/
910	dl	http://ontology.ip.rm.cnr.it/ontologies/DOLCE-Lite#
911	scowt	http://purl.org/weso/ontologies/scowt#
912	wfdesc	http://purl.org/wf4ever/wfdesc#
913	wsc	http://www.openk.org/wscaim.owl#
914	osmsemnet	http://spatial.ucd.ie/2012/08/osmsemnet/
915	ogorg	http://opengraph.org/schema/
916	dssn	http://purl.org/net/dssn/
917	fc	http://www.freeclass.eu/freeclass_v1#
918	genea	http://www.owl-ontologies.com/generations.owl#
919	emp	http://purl.org/ctic/empleo/oferta#
920	owltime	http://www.w3.org/TR/owl-time#
921	httpm	http://www.w3.org/2011/http-methods#
922	saxon	http://saxon.sf.net/
923	eye	http://jena.hpl.hp.com/Eyeball#
924	gxa	http://www.ebi.ac.uk/gxa/
925	osr	http://dati.senato.it/osr/
926	wf	http://www.w3.org/2005/01/wf/flow#
927	healthcare	http://www.agfa.com/w3c/2009/healthCare#
928	osp	http://data.lirmm.fr/ontologies/osp#
929	cold	http://purl.org/configurationontology#
930	telix	http://purl.org/telix#
931	orges	http://datos.gob.es/def/sector-publico/organizacion#
932	govwild	http://govwild.org/0.6/GWOntology.rdf/
933	centrifuge	http://purl.org/twc/vocab/centrifuge#
934	meb	http://rdf.myexperiment.org/ontologies/base/
935	soap	http://www.w3.org/2003/05/soap-envelope/
936	npgd	http://ns.nature.com/datasets/
937	poder	http://poderopedia.com/vocab/
938	p20	http://zbw.eu/beta/p20/vocab/
939	rpubl	http://rinfo.lagrummet.se/ns/2008/11/rinfo/publ#
940	mtecore	http://purl.org/olia/mte/multext-east.owl#
941	sad	http://vocab.deri.ie/sad#
942	crtv	http://open-services.net/ns/crtv#
943	pkmn	http://pokedex.dataincubator.org/pkm/
944	nytimes	http://data.nytimes.com/elements/
945	vcardx	http://buzzword.org.uk/rdf/vcardx#
946	qu	http://purl.oclc.org/NET/ssnx/qu/qu#
947	category	http://dbpedia.org/resource/Category:
948	goef	http://purl.org/twc/vocab/goef#
949	ngeoi	http://vocab.lenka.no/geo-deling#
950	fct	http://openlinksw.com/services/facets/1.0/
951	pronom	http://reference.data.gov.uk/technical-registry/
952	ecpo	http://purl.org/ontology/ecpo#
953	humanbody	http://eulersharp.sourceforge.net/2003/03swap/humanBody#
954	rso	http://www.researchspace.org/ontology/
955	oac	http://www.openannotation.org/ns/
956	fingal	http://vocab.deri.ie/fingal#
957	malignneo	http://www.agfa.com/w3c/2009/malignantNeoplasm#
958	s4ac	http://ns.inria.fr/s4ac/v2#
959	diseasome	http://www4.wiwiss.fu-berlin.de/diseasome/resource/diseasome/
960	environ	http://eulersharp.sourceforge.net/2003/03swap/environment#
961	ql	http://www.w3.org/2004/ql#
962	daiaserv	http://purl.org/ontology/daia/Service/
963	lod2	http://lod2.eu/schema/
964	moby	http://www.mygrid.org.uk/mygrid-moby-service#
965	npgg	http://ns.nature.com/graphs/
966	d2r	http://sites.wiwiss.fu-berlin.de/suhl/bizer/d2r-server/config.rdf#
967	mohammad	http://manesht.ir/
968	dctypes	http://purl.org/dc/dcmitype/
969	wm	http://ns.inria.fr/webmarks#
970	ling	http://purl.org/voc/ling/
971	rich	http://rdf.data-vocabulary.org/
972	str	http://nlp2rdf.lod2.eu/schema/string/
973	nsl	http://purl.org/ontology/storyline/
974	lgv	http://linkedgeodata.org/ontology/
975	ec	http://eulergui.sourceforge.net/contacts.owl.n3#
976	identity	http://purl.org/twc/ontologies/identity.owl#
977	l4a	http://labels4all.info/ns/
978	atomrdf	http://atomowl.org/ontologies/atomrdf#
979	bridge	http://purl.org/vocommons/bridge#
980	ekaw	http://data.semanticweb.org/conference/ekaw/2012/complete/
981	pam	http://prismstandard.org/namespaces/pam/2.0/
982	itsmo	http://ontology.it/itsmo/v1#
983	clinproc	http://www.agfa.com/w3c/2009/clinicalProcedure#
984	parl	https://id.parliament.uk/schema/
985	no	http://km.aifb.kit.edu/projects/numbers/number#
986	oecd	http://oecd.270a.info/dataset/
987	grs	http://www.georss.org/georss/
988	marshall	http://sites.google.com/site/xgmaitc/
989	archdesc	http://archdesc.info/archEvent#
990	aerols	http://xmlns.com/aerols/0.1/
991	frad	http://iflastandards.info/ns/fr/frad/
992	wkd	http://schema.wolterskluwer.de/
993	okg	http://openknowledgegraph.org/ontology/
994	iron	http://purl.org/ontology/iron#
995	wfprov	http://purl.org/wf4ever/wfprov#
996	rs	http://rightsstatements.org/vocab/
997	r2rml	http://www.w3.org/ns/r2rml#
998	hcard	http://purl.org/uF/hCard/terms/
999	camelot	http://vocab.ox.ac.uk/camelot#
1000	ru	http://purl.org/imbi/ru-meta.owl#
1001	puelia	http://kwijibo.talis.com/vocabs/puelia#
1002	biordf	http://purl.org/net/biordfmicroarray/ns#
1003	tvc	http://www.essepuntato.it/2012/04/tvc/
1004	gesis	http://lod.gesis.org/lodpilot/ALLBUS/vocab.rdf#
1005	geovocab	http://geovocab.org/
1006	tripfs2	http://purl.org/tripfs/2010/06#
1007	hartigprov	http://purl.org/net/provenance/ns#
1008	s2s	http://escience.rpi.edu/ontology/sesf/s2s/4/0/
1009	wscaim	http://www.openk.org/wscaim.owl#
1010	va	http://code-research.eu/ontology/visual-analytics#
1011	occult	http://data.totl.net/occult/
1012	mpeg7	http://rhizomik.net/ontologies/2005/03/Mpeg7-2001.owl#
1013	lh	http://vocab.inf.ed.ac.uk/library/holdings#
1014	namespaces	https://vg.no/
1015	l4lod	http://ns.inria.fr/l4lod/v2/
1016	openskos	http://openskos.org/xmlns#
1017	protegedc	http://protege.stanford.edu/plugins/owl/dc/protege-dc.owl#
1018	opmw	http://www.opmw.org/ontology/
1019	te	http://www.w3.org/2006/time-entry#
1020	bcncon	http://datos.bcn.cl/ontologies/bcn-congress#
1021	gfo	http://www.onto-med.de/ontologies/gfo.owl#
1022	cdtype	http://purl.org/cld/cdtype/
1023	b2rpubchem	http://bio2rdf.org/ns/ns/ns/pubchem#
1024	bm	http://bio2rdf.org/
1025	gbv	http://purl.org/ontology/gbv/
1026	dbyago	http://dbpedia.org/class/yago/
1027	laposte	http://data.lirmm.fr/ontologies/laposte#
1028	mil	http://rdf.muninn-project.org/ontologies/military#
1029	bcnnorms	http://datos.bcn.cl/ontologies/bcn-norms#
1030	vsto	http://escience.rpi.edu/ontology/vsto/2/0/vsto.owl#
1031	kbp	http://tackbp.org/2013/ontology#
1032	campsite	http://www.openlinksw.com/campsites/schema#
1033	cis	http://purl.org/NET/cloudisus#
1034	prism21	http://prismstandard.org/namespaces/basic/2.1/
1035	geop	http://aims.fao.org/aos/geopolitical.owl#
1036	odcs	http://opendata.cz/infrastructure/odcleanstore/
1037	skos08	http://www.w3.org/2008/05/skos#
1038	cf	http://mmisw.org/ont/cf/parameter/
1039	skiresort	http://www.openlinksw.com/ski_resorts/schema#
1040	c4dm	http://purl.org/NET/c4dm/event.owl#
1041	zoomaterms	http://rdf.ebi.ac.uk/vocabulary/zooma/
1042	frbrcore	http://purl.org/vocab/frbr/core#
1043	rec54	http://www.w3.org/2001/02pd/rec54.rdf#
1044	nex	http://www.nexml.org/2009/
1045	transmed	http://www.w3.org/2001/sw/hcls/ns/transmed/
1046	cmd	http://clarin.eu/cmd#
1047	msr	http://www.telegraphis.net/ontology/measurement/measurement#
1048	stac	http://securitytoolbox.appspot.com/stac#
1049	tisc	http://observedchange.com/tisc/ns#
1050	osukdt	http://www.ordnancesurvey.co.uk/ontology/Datatypes.owl#
1051	csm	http://purl.org/csm/1.0#
1052	opl	http://openlinksw.com/schema/attribution#
1053	psh	http://psh.techlib.cz/skos/
1054	ptop	http://www.ontotext.com/proton/protontop#
1055	ebu	http://semantic.eurobau.com/eurobau-utility.owl#
1056	gastro	http://www.ebsemantics.net/gastro#
1057	scms	http://ns.aksw.org/scms/annotations/
1058	sci	http://data.scientology.org/ns/
1059	sioctypes	http://rdfs.org/sioc/types#
1060	germplasm	http://purl.org/germplasm/terms#
1061	quantities	http://eulersharp.sourceforge.net/2003/03swap/quantitiesExtension#
1062	osspr	http://data.ordnancesurvey.co.uk/ontology/spatialrelations/
1063	curr	https://w3id.org/cc#
1064	dpl	http://dbpedialite.org/things/
1065	rssynd	http://web.resource.org/rss/1.0/modules/syndication/
1066	harrisons	http://harrisons.cc/
1067	qvoc	http://mlode.nlp2rdf.org/quranvocab#
1068	luc	http://www.ontotext.com/owlim/lucene#
1069	gist	https://ontologies.semanticarts.com/gist/
1070	dawgt	http://www.w3.org/2001/sw/DataAccess/tests/test-dawg#
1071	fos	http://futurios.org/fos/spec/
1072	mads	http://www.loc.gov/mads/rdf/v1#
1073	crv	http://purl.org/twc/vocab/datacarver#
1074	dcndl	http://ndl.go.jp/dcndl/terms/
1075	hints2005	http://purl.org/twc/cabig/model/HINTS2005-1.owl#
1076	sso	http://nlp2rdf.lod2.eu/schema/sso/
1077	oarj	http://opendepot.org/reference/linked/1.0/
1078	frame	http://www.ontologydesignpatterns.org/ont/framenet/abox/frame/
1079	esdir	http://vocab.linkeddata.es/datosabiertos/def/urbanismo-infraestructuras/direccion-postal#
1080	ds	http://purl.org/ctic/dcat#
1081	steel	http://ontorule-project.eu/resources/steel-30#
1082	disease	http://www.agfa.com/w3c/2009/humanDisorder#
1083	seq	http://www.ontologydesignpatterns.org/cp/owl/sequence.owl#
1084	spt	http://spitfire-project.eu/ontology/ns/
1085	prvt	http://purl.org/net/provenance/types#
1086	paia	http://purl.org/ontology/paia#
1087	sw	http://linkedwidgets.org/statisticalwidget/ontology/
1088	pizza	http://www.co-ode.org/ontologies/pizza/pizza.owl#
1089	pso	http://purl.org/spar/pso/
1090	qrl	http://www.aifb.kit.edu/project/ld-retriever/qrl#
1091	hifm	http://purl.org/net/hifm/data#
1092	conf	http://richard.cyganiak.de/2007/pubby/config.rdf#
1093	li	http://def.seegrid.csiro.au/isotc211/iso19115/2003/lineage#
1094	fe	http://www.ontologydesignpatterns.org/ont/framenet/abox/fe/
1095	pubmed	http://bio2rdf.org/pubmed_vocabulary:
1096	cdt	https://w3id.org/cdt/
1097	bihap	http://bihap.kb.gov.tr/ontology/
1098	wno	http://wordnet-rdf.princeton.edu/ontology#
1099	tblcard	http://www.w3.org/People/Berners-Lee/card#
1100	part	http://purl.org/vocab/participation/schema#
1101	wsl	http://www.wsmo.org/ns/wsmo-lite#
1102	rdae	http://rdaregistry.info/Elements/e/
1103	elec	http://purl.org/ctic/sector-publico/elecciones#
1104	onyx	http://www.gsi.dit.upm.es/ontologies/onyx/ns#
1105	bv	http://purl.org/vocommons/bv#
1106	eumida	http://data.kasabi.com/dataset/eumida/terms/
1107	stream	http://dbpedia.org/ontology/Stream/
1108	refe	http://orion.tw.rpi.edu/~xgmatwc/refe/
1109	infor	http://www.ontologydesignpatterns.org/cp/owl/informationrealization.owl#
1110	alchemy	http://rdf.alchemyapi.com/rdf/v1/s/aapi-schema#
1111	ep	http://eprints.org/ontology/
1112	water	http://escience.rpi.edu/ontology/semanteco/2/0/water.owl#
1113	vin	http://www.w3.org/TR/2003/PR-owl-guide-20031209/wine#
1114	my	http://www.mobile.com/model/
1115	vsw	http://verticalsearchworks.com/ontology/
1116	dcite	http://purl.org/spar/datacite/
1117	omnlife	http://open-multinet.info/ontology/omn-lifecycle#
1118	telmap	http://purl.org/telmap/
1119	saref	https://saref.etsi.org/core/
1120	webbox	http://webbox.ecs.soton.ac.uk/ns#
1121	ops	https://w3id.org/ops#
1122	lexvo	http://lexvo.org/ontology#
1123	vgo	http://purl.org/net/VideoGameOntology#
1124	daisy	http://www.daisy.org/z3998/2012/vocab/
1125	rdacarrier	http://rdvocab.info/termList/RDACarrierType/
1126	of	http://owlrep.eu01.aws.af.cm/fridge#
1127	qud	http://qudt.org/1.1/schema/qudt#
1128	biro	http://purl.org/spar/biro/
1129	prviv	http://purl.org/net/provenance/integrity#
1130	lc	http://semweb.mmlab.be/ns/linkedconnections#
1131	od	http://purl.org/twc/vocab/opendap#
1132	mb	http://dbtune.org/musicbrainz/resource/instrument/
1133	sor	http://purl.org/net/soron/
1134	mrel	http://id.loc.gov/vocabulary/relators/
1135	bwb	http://doc.metalex.eu/bwb/ontology/
1136	estrn	http://vocab.linkeddata.es/datosabiertos/def/urbanismo-infraestructuras/transporte#
1137	sdmxd	http://purl.org/linked-data/sdmx/2009/dimension#
1138	lldr	http://purl.oclc.org/NET/lldr/ns#
1139	cosmo	http://purl.org/ontology/cosmo#
1140	strdf	http://strdf.di.uoa.gr/ontology#
1141	npgx	http://ns.nature.com/extensions/
1142	osgeom	http://data.ordnancesurvey.co.uk/ontology/geometry/
1143	w3con	http://www.w3.org/2000/10/swap/pim/contact#
1144	lodac	http://lod.ac/ns/lodac#
1145	abs	http://abs.270a.info/dataset/
1353	nxs	http://www.neclimateus.org/
1146	op	http://environment.data.gov.au/def/op#
1147	vsws	http://verticalsearchworks.com/ontology/synset#
1148	bcnbio	http://datos.bcn.cl/ontologies/bcn-biographies#
1149	dvia	http://data.eurecom.fr/ontology/dvia#
1150	aers	http://aers.data2semantics.org/resource/
1151	eui	http://institutions.publicdata.eu/#
1152	cts2	http://schema.omg.org/spec/CTS2/1.0/
1153	mt	http://www.w3.org/2001/sw/DataAccess/tests/test-manifest#
1154	rdamedia	http://rdvocab.info/termList/RDAMediaType/
1155	fincaselaw	http://purl.org/finlex/schema/oikeus/
1156	sro	http://salt.semanticauthoring.org/ontologies/sro#
1157	mged	http://mged.sourceforge.net/ontologies/MGEDOntology.owl#
1158	who	http://www.who.int/vocab/ontology#
1159	eunis	http://eunis.eea.europa.eu/rdf/species-schema.rdf#
1160	vrank	http://purl.org/voc/vrank#
1161	wlo	http://purl.org/ontology/wo/
1162	ecos	http://kmm.lboro.ac.uk/ecos/1.0#
1163	iol	http://www.ontologydesignpatterns.org/ont/dul/IOLite.owl#
1164	fo	http://purl.org/ontology/fo/
1165	omapi	http://purl.org/omapi/0.2/#
1166	turismo	http://idi.fundacionctic.org/cruzar/turismo#
1167	situ	http://www.ontologydesignpatterns.org/cp/owl/situation.owl#
1168	dcoid	http://dx.deepcarbon.net/
1169	swperson	http://data.semanticweb.org/person/
1170	moac	http://observedchange.com/moac/ns#
1171	ox	http://vocab.ox.ac.uk/projectfunding#
1172	jjd	http://www.joshuajeeson.com/
1173	lcy	http://purl.org/vocab/lifecycle/schema#
1174	roevo	http://purl.org/wf4ever/roevo#
1175	saif	http://wwwiti.cs.uni-magdeburg.de/~srahman/
1176	gov	http://gov.genealogy.net/ontology.owl#
1177	emoca	http://ns.inria.fr/emoca#
1178	nidm	http://nidm.nidash.org/
1179	quty	http://www.telegraphis.net/ontology/measurement/quantity#
1180	r4ta	http://ns.inria.fr/ratio4ta/v1#
1181	graffle	http://purl.org/twc/vocab/vsr/graffle#
1182	coll	http://purl.org/co/
1183	rdarel	http://rdvocab.info/RDARelationshipsWEMI/
1184	wikterms	http://wiktionary.dbpedia.org/terms/
1185	ssso	http://purl.org/ontology/ssso#
1186	ldr	http://purl.oclc.org/NET/ldr/ns#
1187	lsc	http://linkedscience.org/lsc/ns#
1188	fma	http://sig.uw.edu/fma#
1189	opmo	http://openprovenance.org/model/opmo#
1190	cdc	https://w3id.org/cdc#
1191	daq	http://purl.org/eis/vocab/daq#
1192	swpatho	http://swpatho.ag-nbi.de/context/meta.owl#
1193	semio	http://www.lingvoj.org/semio#
1194	twaapi	http://purl.org/twc/vocab/aapi-schema#
1195	lso	http://linkedspending.aksw.org/ontology/
1196	poste	http://data.lirmm.fr/ontologies/poste#
1197	odo	http://ocean-data.org/schema/
1198	ordf	http://purl.org/NET/ordf/
1199	accom	http://purl.org/acco/ns#
1200	viskoo	http://trust.utep.edu/visko/ontology/visko-operator-v3.owl#
1201	fcp	http://www.newmedialab.at/fcp/
1202	vdpp	http://data.lirmm.fr/ontologies/vdpp#
1203	radion	http://www.w3.org/ns/radion#
1204	particip	http://purl.org/vocab/participation/schema#
1205	cart	http://purl.org/net/cartCoord#
1206	ecc	https://ns.eccenca.com/
1207	drm	http://vocab.data.gov/def/drm#
1208	dn	http://purl.org/datanode/ns/
1209	infection	http://www.agfa.com/w3c/2009/infectiousDisorder#
1210	cbase	http://ontologycentral.com/2010/05/cb/vocab#
1211	dr	http://purl.org/swan/2.0/discourse-relationships/
1212	lingvo	http://www.lingvoj.org/ontology#
1213	pois	http://purl.oclc.org/POIS/vcblr#
1214	pkgsrc	http://pkgsrc.co/schema#
1215	rlnr	http://rdflivenews.aksw.org/resource/
1216	finlaw	http://purl.org/finlex/schema/laki/
1217	plo	http://purl.org/net/po#
1218	pingback	http://purl.org/net/pingback/
1219	ctorg	http://purl.org/ctic/infraestructuras/organizacion#
1220	odv	http://reference.data.gov.uk/def/organogram/
1221	rdapo	http://rdaregistry.info/Elements/p/object/
1222	rdacontent	http://rdvocab.info/termList/RDAContentType/
1223	csp	http://vocab.deri.ie/csp#
1224	ipo	http://purl.org/ipo/core#
1225	dogont	http://elite.polito.it/ontologies/dogont.owl#
1226	dbpr	http://dbpedia.org/resource/
1227	onssprel	http://www.ordnancesurvey.co.uk/ontology/SpatialRelations/v0.2/SpatialRelations.owl#
1228	w3po	http://purl.org/provenance/w3p/w3po#
1229	vvo	http://purl.org/vvo/ns#
1230	gawd	http://gawd.atlantides.org/terms/
1231	geocontext	http://www.geocontext.org/publ/2013/vocab#
1232	ecrm	http://erlangen-crm.org/current/
1233	odapp	http://vocab.deri.ie/odapp#
1234	doas	http://deductions.github.io/doas.owl.ttl#
1235	guo	http://purl.org/hpi/guo#
1236	gadm	http://gadm.geovocab.org/ontology#
1237	tis	http://www.ontologydesignpatterns.org/cp/owl/timeindexedsituation.owl#
1238	viskov	http://trust.utep.edu/visko/ontology/visko-view-v3.owl#
1239	vapour	http://vapour.sourceforge.net/vocab.rdf#
1240	cl	http://advene.org/ns/cinelab/
1241	cvbase	http://purl.org/captsolo/resume-rdf/0.2/base#
1242	trait	http://contextus.net/ontology/ontomedia/ext/common/trait#
1243	rdarole	http://rdvocab.info/roles/
1244	olad	http://openlad.org/vocab#
1245	asgv	http://aims.fao.org/aos/agrovoc/
1246	ebucore	http://www.ebu.ch/metadata/ontologies/ebucore/ebucore#
1247	frbrer	http://iflastandards.info/ns/fr/frbr/frbrer/
1248	agls	http://www.agls.gov.au/agls/terms/
1249	ntag	http://ns.inria.fr/nicetag/2010/09/09/voc#
1250	roterms	http://purl.org/wf4ever/roterms#
1251	tsioc	http://rdfs.org/sioc/types#
1252	voidp	http://www.enakting.org/provenance/voidp/
1253	solid	http://www.w3.org/ns/solid/terms#
1254	gcis	http://data.globalchange.gov/gcis.owl#
1255	mvco	http://purl.oclc.org/NET/mvco.owl#
1256	tw	http://tw.rpi.edu/schema/
1257	dqm	http://purl.org/dqm-vocabulary/v1/dqm#
1258	oecc	http://www.oegov.org/core/owl/cc#
1259	uta	http://uptheasset.org/ontology#
1260	qb4o	http://purl.org/olap#
1261	evident	http://purl.org/net/evident#
1262	ses	http://lod.taxonconcept.org/ses/
1263	onc	http://www.ics.forth.gr/isl/oncm/core#
1264	frsad	http://iflastandards.info/ns/fr/frsad/
1265	pwo	http://purl.org/spar/pwo/
1266	graves	http://rdf.muninn-project.org/ontologies/graves#
1267	lio	http://purl.org/net/lio#
1268	smg	http://ns.cerise-project.nl/energy/def/cim-smartgrid#
1269	biotop	http://purl.org/biotop/biotop.owl#
1270	stats	http://purl.org/rdfstats/stats#
1271	delta	http://www.w3.org/2004/delta#
1272	ostop	http://www.ordnancesurvey.co.uk/ontology/Topography/v0.1/Topography.owl#
1273	locwd	http://purl.org/locwd/schema#
1274	shw	http://paul.staroch.name/thesis/SmartHomeWeather.owl#
1275	pnt	http://data.press.net/ontology/tag/
1276	hlygt	http://www.holygoat.co.uk/owl/redwood/0.1/tags/
1277	obsm	http://rdf.geospecies.org/methods/observationMethod#
1278	pod	https://project-open-data.cio.gov/v1.1/schema/#
1279	icane	http://www.icane.es/opendata/vocab#
1280	pattern	http://www.essepuntato.it/2008/12/pattern#
1281	lexcz	http://purl.org/lex/cz#
1282	tac	http://ns.bergnet.org/tac/0.1/triple-access-control#
1283	owlse	http://www.daml.org/services/owl-s/1.2/generic/Expression.owl#
1284	fao	http://fao.270a.info/dataset/
1285	kai	http://kai.uni-kiel.de/
1286	opllic	http://www.openlinksw.com/ontology/licenses#
1287	gnm	http://www.geonames.org/ontology/mappings/
1288	oplprod	http://www.openlinksw.com/ontology/products#
1289	geosp	http://rdf.geospecies.org/ont/geospecies#
1290	dpc	http://hospee.org/ontologies/dpc/
1291	viso	http://purl.org/viso/
1292	scufl2	http://ns.taverna.org.uk/2010/scufl2#
1293	cpant	http://purl.org/NET/cpan-uri/terms#
1294	rdafrbr	http://rdvocab.info/uri/schema/FRBRentitiesRDA/
1295	oss	http://opendata.caceres.es/def/ontosemanasanta#
1296	oslo	http://purl.org/oslo/ns/localgov#
1297	frb	http://frb.270a.info/dataset/
1298	vcard2006	http://www.w3.org/2006/vcard/ns#
1299	ogbd	http://www.ogbd.fr/2012/ontologie#
1300	rdai	http://rdaregistry.info/Elements/i/
1301	data	http://data.odw.tw/
1302	wf4ever	http://purl.org/wf4ever/wf4ever#
1303	dbtont	http://dbtropes.org/ont/
1304	amalgame	http://purl.org/vocabularies/amalgame#
1305	html	http://www.w3.org/1999/xhtml/
1306	fam	http://vocab.fusepool.info/fam#
1307	deps	http://ontologi.es/doap-deps#
1308	verb	https://w3id.org/verb/
1309	snarm	http://rdf.myexperiment.org/ontologies/snarm/
1310	sam	http://def.seegrid.csiro.au/isotc211/iso19156/2011/sampling#
1311	chembl	http://rdf.ebi.ac.uk/terms/chembl#
1312	esco	http://data.europa.eu/esco/model#
1313	wn20	http://www.w3.org/2006/03/wn/wn20/
1314	rmo	http://eatld.et.tu-dresden.de/rmo#
1315	vf	https://w3id.org/valueflows#
1316	gnvc	http://purl.org/gc/
1317	bcngeo	http://datos.bcn.cl/ontologies/bcn-geographics#
1318	ontopic	http://www.ontologydesignpatterns.org/ont/dul/ontopic.owl#
1319	mammal	http://lod.taxonconcept.org/ontology/p01/Mammalia/index.owl#
1320	gf	http://def.seegrid.csiro.au/isotc211/iso19109/2005/feature#
1321	thors	http://resource.geosciml.org/ontology/timescale/thors#
1322	mico	http://www.mico-project.eu/ns/platform/1.0/schema#
1323	gl	http://schema.geolink.org/
1324	call	http://webofcode.org/wfn/call:
1325	ost	http://w3id.org/ost/ns#
1326	opencyc	http://sw.opencyc.org/concept/
1327	rdl	http://data.posccaesar.org/rdl/
1328	mmd	http://musicbrainz.org/ns/mmd-1.0#
1329	raul	http://vocab.deri.ie/raul#
1330	date	http://contextus.net/ontology/ontomedia/misc/date#
1331	gm	http://def.seegrid.csiro.au/isotc211/iso19107/2003/geometry#
1332	rdf123	http://rdf123.umbc.edu/ns/
1333	app	http://jmvanel.free.fr/ontology/software_applications.n3#
1334	lmm1	http://www.ontologydesignpatterns.org/ont/lmm/LMM_L1.owl#
1335	rdarel2	http://metadataregistry.org/uri/schema/RDARelationshipsGR2/
1336	uis	http://uis.270a.info/dataset/
1337	sdm	https://w3id.org/okn/o/sdm#
1338	provone	http://purl.org/provone#
1339	bk	http://www.provbook.org/ns/#
1340	bgn	http://bibliograph.net/schemas/
1341	s3db	http://www.s3db.org/core#
1342	gq	http://genomequest.com/
1343	limoo	http://purl.org/LiMo/0.1/
1344	lmm2	http://www.ontologydesignpatterns.org/ont/lmm/LMM_L2.owl#
1345	fcs	http://clarin.eu/fcs/resource#
1346	bn	http://babelnet.org/rdf/
1347	lindt	https://w3id.org/lindt/voc#
1348	xlime	http://xlime-project.org/vocab/
1349	pnc	http://data.press.net/ontology/classification/
1350	goog	http://schema.googleapis.com/
1351	dbptmpl	http://dbpedia.org/resource/Template:
1352	muldicat	http://iflastandards.info/ns/muldicat#
1354	dbcat	http://dbpedia.org/resource/Category:
1355	bco	http://purl.obolibrary.org/obo/bco.owl#
1356	pproc	http://contsem.unizar.es/def/sector-publico/pproc#
1357	location	http://sw.deri.org/2006/07/location/loc#
1358	yo	http://yovisto.com/
1359	crsw	http://courseware.rkbexplorer.com/ontologies/courseware#
1360	oprovo	http://openprovenance.org/ontology#
1361	agro	http://agrinepaldata.com/vocab/
1362	edgar	http://edgarwrap.ontologycentral.com/vocab/edgar#
1363	latitude	https://www.w3.org/2006/vcard/ns#latitude#
1364	bgcat	http://bg.dbpedia.org/resource/?????????:
1365	cjr	http://vocab.linkeddata.es/datosabiertos/def/urbanismo-infraestructuras/callejero#
1366	dannet	http://www.wordnet.dk/owl/instance/2009/03/instances/
1367	dpd	http://www.kanzaki.com/ns/dpd#
1368	rdag1	http://rdvocab.info/Elements/
1369	cpsv	http://purl.org/vocab/cpsv#
1370	wro	http://purl.org/net/wf4ever/ro#
1371	geod	http://vocab.lenka.no/geo-deling#
1372	wikim	http://spi-fm.uca.es/spdef/models/genericTools/wikim/1.0#
1373	shoah	http://dati.cdec.it/lod/shoah/
1374	pvcs	http://purl.org/twc/vocab/pvcs#
1375	topo	http://data.ign.fr/def/topo#
1376	emtr	http://purl.org/NET/ssnext/electricmeters#
1377	crmdig	http://www.ics.forth.gr/isl/CRMdig/
1378	psys	http://www.ontotext.com/proton/protonsys#
1379	msm	http://iserve.kmi.open.ac.uk/ns/msm#
1380	json	https://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf#
1381	static	http://vocab-ld.org/vocab/static-ld#
1382	ext	http://def.seegrid.csiro.au/isotc211/iso19115/2003/extent#
1383	dbpedia2	http://dbpedia.org/property/
1384	oan	http://data.lirmm.fr/ontologies/oan/
1385	scoro	http://purl.org/spar/scoro/
1386	osadm	http://data.ordnancesurvey.co.uk/ontology/admingeo/
1387	mv	http://schema.mobivoc.org/
1388	fno	https://w3id.org/function/ontology#
1389	bbcprov	http://www.bbc.co.uk/ontologies/provenance/
1390	limo	http://www.purl.org/limo-ontology/limo#
1391	pni	http://data.press.net/ontology/identifier/
1392	form	http://deductions-software.com/ontologies/forms.owl.ttl#
1393	defns	http://www.openarchives.org/OAI/2.0/
1394	oh	http://semweb.mmlab.be/ns/oh#
1395	mds	http://doc.metalex.eu/id/
1396	cmdm	http://infra.clarin.eu/cmd/
1397	oplcert	http://www.openlinksw.com/schemas/cert#
1398	rdamt	http://rdaregistry.info/termList/RDAMediaType/
1399	rdfdata	http://rdf.data-vocabulary.org/rdf.xml#
1400	odpart	http://www.ontologydesignpatterns.org/cp/owl/participation.owl#
1401	eurlex	http://eur-lex.publicdata.eu/ontology/
1402	ls	http://linkedspending.aksw.org/instance/
1403	imf	http://imf.270a.info/dataset/
1404	sru	http://www.loc.gov/zing/srw/
1405	lden	http://www.linklion.org/lden/
1406	kees	http://linkeddata.center/kees/v1#
1407	tp	https://triplydb.com/Triply/tp/def/
1408	stories	http://purl.org/ontology/stories/
1409	bner	http://datos.bne.es/resource/
1410	rdagw	http://rdaregistry.info/termList/grooveWidth/
1411	tao	http://vocab.deri.ie/tao#
1412	laabs	http://dbpedia.org/resource/
1413	aws	http://purl.oclc.org/NET/ssnx/meteo/aws#
1414	isocat	http://www.isocat.org/datcat/
1415	maso	http://securitytoolbox.appspot.com/MASO#
1416	insdc	http://ddbj.nig.ac.jp/ontologies/sequence#
1417	xapi	https://w3id.org/xapi/ontology#
1418	ccrel	http://creativecommons.org/ns#
1419	holding	http://purl.org/ontology/holding#
1420	passim	http://data.lirmm.fr/ontologies/passim#
1421	sbench	http://swat.cse.lehigh.edu/onto/univ-bench.owl#
1422	sao	http://salt.semanticauthoring.org/ontologies/sao#
1423	being	http://purl.org/ontomedia/ext/common/being#
1424	bis	http://bis.270a.info/dataset/
1425	lda	http://purl.org/linked-data/api/vocab#
1426	c9d	http://purl.org/twc/vocab/conversion/
1427	hr	http://iserve.kmi.open.ac.uk/ns/hrests#
1428	ftcontent	http://www.ft.com/ontology/content/
1429	wikibase	http://wikiba.se/ontology#
1430	rdag3	http://rdvocab.info/ElementsGr3/
1431	xrd	http://docs.oasis-open.org/ns/xri/xrd-1.0#
1432	art	http://w3id.org/art/terms/1.0/
1433	dq	http://def.seegrid.csiro.au/isotc211/iso19115/2003/dataquality#
1434	ljkl	http://teste.com/
1435	pkm	http://www.ontotext.com/proton/protonkm#
1436	td	https://www.w3.org/2019/wot/td#
1437	llo	http://lodlaundromat.org/ontology/
1438	dcatapit	http://dati.gov.it/onto/dcatapit#
1439	oliasystem	http://purl.org/olia/system.owl#
1440	mocanal	http://www.semanticweb.org/asow/ontologies/2013/9/untitled-ontology-36#
1441	vext	http://ldf.fi/void-ext#
1442	origins	http://origins.link/
1443	employee	http://www.employee.com/data#
1444	tddo	http://databugger.aksw.org/ns/core#
1445	pco	http://purl.org/procurement/public-contracts#
1446	atlas	http://rdf.ebi.ac.uk/resource/atlas/
1447	clinic	http://example.com/clinic#
1448	faq	http://www.openlinksw.com/ontology/faq#
1449	tm	http://def.seegrid.csiro.au/isotc211/iso19108/2002/temporal#
1450	cmdi	http://www.clarin.eu/cmd/
1451	mmf	http://linkedmultimedia.org/sparql-mm/ns/1.0.0/function#
1452	ll	http://lodlaundromat.org/resource/
1453	oml	http://def.seegrid.csiro.au/ontology/om/om-lite#
1454	citof	http://www.essepuntato.it/2013/03/cito-functions#
1654	lmf	http://www.lexinfo.net/lmf#
1455	lofv	http://purl.org/legal_form/vocab#
1456	omdoc	http://omdoc.org/ontology/
1457	agrd	http://agrinepaldata.com/
1458	rdafnm	http://rdaregistry.info/termList/FormNoteMus/
1459	contsem	http://contsem.unizar.es/def/sector-publico/contratacion#
1460	esequip	http://vocab.linkeddata.es/datosabiertos/def/urbanismo-infraestructuras/equipamiento#
1461	grel	http://users.ugent.be/~bjdmeest/function/grel.ttl#
1462	rdafr	http://rdaregistry.info/termList/frequency/
1463	nerd	http://nerd.eurecom.fr/ontology#
1464	jp1	http://rdf.muninn-project.org/ontologies/jp1/
1465	gaf	http://groundedannotationframework.org/
1466	rkd	http://data.rkd.nl/def#
1467	decision	https://decision-ontology.googlecode.com/svn/trunk/decision.owl#
1468	odrs	http://schema.theodi.org/odrs#
1469	ldvm	http://linked.opendata.cz/ontology/ldvm/
1470	wb	http://data.worldbank.org/
1471	scip	http://lod.taxonconcept.org/ontology/sci_people.owl#
1472	vmm	http://spi-fm.uca.es/spdef/models/genericTools/vmm/1.0#
1473	spdx	http://spdx.org/rdf/terms#
1474	rvdata	http://data.rvdata.us/
1475	ramon	http://rdfdata.eionet.europa.eu/ramon/ontology/
1476	rdasoi	http://rdaregistry.info/termList/statIdentification/
1477	geos	http://www.telegraphis.net/ontology/geography/geography#
1478	mesh	http://id.nlm.nih.gov/mesh/
1479	rdacct	http://rdaregistry.info/termList/CollTitle/
1480	csv	http://vocab.sindice.net/csv/
1481	pic	http://www.ipaw.info/ns/picaso#
1482	rdatc	http://rdaregistry.info/termList/trackConfig/
1483	security	http://securitytoolbox.appspot.com/securityMain#
1484	esaloj	http://vocab.linkeddata.es/datosabiertos/def/turismo/alojamiento#
1485	physo	http://merlin.phys.uni.lodz.pl/onto/physo/physo.owl#
1486	dcs	http://ontologi.es/doap-changeset#
1487	eurostat	http://wifo5-04.informatik.uni-mannheim.de/eurostat/resource/eurostat/
1488	shex	http://www.w3.org/2013/ShEx/ns#
1489	rdagd	http://rdaregistry.info/termList/gender/
1490	scor	http://purl.org/eis/vocab/scor#
1491	ruto	http://rdfunit.aksw.org/ns/core#
1492	bevon	http://rdfs.co/bevon/
1493	wn31	http://wordnet-rdf.princeton.edu/wn31/
1494	wfn	http://webofcode.org/wfn/
1495	lexicon	http://www.example.org/lexicon#
1496	quantity	http://qudt.org/schema/quantity#
1497	rml	http://semweb.mmlab.be/ns/rml#
1498	olac	http://www.language-archives.org/OLAC/1.0/
1499	language	http://id.loc.gov/vocabulary/iso639-1/
1500	affymetrix	http://bio2rdf.org/affymetrix_vocabulary:
1501	oplres	http://www.openlinksw.com/ontology/restrictions#
1502	d2d	http://rdfns.org/d2d/
1503	videogame	http://purl.org/net/vgo#
1504	acrt	http://privatealpha.com/ontology/certification/1#
1505	kml	http://www.opengis.net/kml/2.2#
1506	bbccms	http://www.bbc.co.uk/ontologies/cms/
1507	sosa	http://www.w3.org/ns/sosa/
1508	trig	http://www.w3.org/2004/03/trix/rdfg-1/
1509	rankrage	https://rankrage.de/
1510	erce	http://xxefe.de/
1511	galaksiya	http://ontoloji.galaksiya.com/vocab/
1512	foo	http://filmontology.org/ontology/1.0/
1513	lsd	http://linkedwidgets.org/statisticaldata/ontology/
1514	onisep	http://rdf.onisep.fr/resource/
1515	rdami	http://rdaregistry.info/termList/modeIssue/
1516	dsn	http://purl.org/dsnotify/vocab/eventset/
1517	npdv	http://sws.ifi.uio.no/vocab/npd#
1518	spfood	http://kmi.open.ac.uk/projects/smartproducts/ontologies/food.owl#
1519	roadmap	http://mappings.roadmap.org/
1520	xcql	http://docs.oasis-open.org/ns/search-ws/xcql#
1521	mmt	http://linkedmultimedia.org/sparql-mm/functions/temporal#
1522	esadm	http://vocab.linkeddata.es/datosabiertos/def/sector-publico/territorio#
1523	rdabm	http://rdaregistry.info/termList/RDABaseMaterial/
1524	gts	http://resource.geosciml.org/ontology/timescale/gts#
1525	dicom	http://purl.org/healthcarevocab/v1#
1526	auto	http://auto.schema.org/
1527	oils	http://lemon-model.net/oils#
1528	itm	http://spi-fm.uca.es/spdef/models/genericTools/itm/1.0#
1529	lw	http://linkedwidgets.org/ontologies/
1530	friends	http://www.openarchives.org/OAI/2.0/friends/
1531	keys	http://purl.org/NET/c4dm/keys.owl#
1532	ogc	http://www.opengis.net/def/
1533	allot	https://w3id.org/akn/ontology/allot#
1534	voidext	http://rdfs.org/ns/void-ext#
1535	dbrc	http://dbpedia.org/resource/Category:
1536	phdd	http://rdf-vocabulary.ddialliance.org/phdd#
1537	shacl	http://www.w3.org/ns/shacl#
1538	bgdbr	http://bg.dbpedia.org/resource/
1539	dqv	http://www.w3.org/ns/dqv#
1540	ecgl	http://schema.geolink.org/
1541	lpeu	http://purl.org/linkedpolitics/vocabulary/eu/plenary/
1542	basic	http://def.seegrid.csiro.au/isotc211/iso19103/2005/basic#
1543	swpm	http://spi-fm.uca.es/spdef/models/deployment/swpm/1.0#
1544	whisky	http://vocab.org/whisky/terms/
1545	lsmap	http://ontology.cybershare.utep.edu/ELSEWeb/elseweb-data.owl#
1546	dbug	http://ontologi.es/doap-bugs#
1547	lfov	https://w3id.org/legal_form#
1548	diag	http://www.loc.gov/zing/srw/diagnostic/
1549	sg	http://www.springernature.com/scigraph/ontologies/core/
1550	ha	http://sensormeasurement.appspot.com/ont/home/homeActivity#
1551	oplacl	http://www.openlinksw.com/ontology/acl#
1552	saws	http://purl.org/saws/ontology#
1553	pcdt	http://purl.org/procurement/public-contracts-datatypes#
1755	markus	http://www.markus.com/
1554	bbccore	http://www.bbc.co.uk/ontologies/coreconcepts/
1555	cbo	http://comicmeta.org/cbo/
1556	odapps	http://semweb.mmlab.be/ns/odapps#
1557	hasco	http://hadatac.org/ont/hasco/
1558	bgdbp	http://bg.dbpedia.org/property/
1559	merge	http://jazz.net/ns/lqe/merge/
1560	bnf	http://www.w3.org/2000/10/swap/grammar/bnf#
1561	opengov	http://www.w3.org/opengov#
1562	babelnet	http://babelnet.org/2.0/
1563	d0	http://ontologydesignpatterns.org/ont/wikipedia/d0.owl#
1564	beth	http://www.google.com/
1565	travel	http://www.co-ode.org/roberts/travel.owl#
1566	orth	http://purl.org/net/orth#
1567	mtlo	http://www.ics.forth.gr/isl/MarineTLO/v4/marinetlo.owl#
1568	uri4uri	http://uri4uri.net/vocab#
1569	ncit	http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#
1570	eccrev	https://vocab.eccenca.com/revision/
1571	rdagrp	http://rdaregistry.info/termList/groovePitch/
1572	samfl	http://def.seegrid.csiro.au/ontology/om/sam-lite#
1573	rdatr	http://rdaregistry.info/termList/typeRec/
1574	rdaco	http://rdaregistry.info/termList/RDAContentType/
1575	naval	http://rdf.muninn-project.org/ontologies/naval#
1576	lcdr	http://ns.lucid-project.org/revision/
1577	rdacc	http://rdaregistry.info/termList/RDAColourContent/
1578	oplecrm	http://www.openlinksw.com/ontology/ecrm#
1579	jolux	http://data.legilux.public.lu/resource/ontology/jolux#
1580	hdo	http://www.samos.gr/ontologies/helpdeskOnto.owl#
1581	rdaftn	http://rdaregistry.info/termList/TacNotation/
1582	company	http://intellimind.io/ns/company#
1583	bibrm	http://vocab.ub.uni-leipzig.de/bibrm/
1584	irsteaont	http://ontology.irstea.fr/weather/ontology#
1585	navm	https://w3id.org/navigation_menu#
1586	condition	http://www.kinjal.com/condition:
1587	olac11	http://www.language-archives.org/OLAC/1.1/
1588	rdarr	http://rdaregistry.info/termList/RDAReductionRatio/
1589	llm	http://lodlaundromat.org/metrics/ontology/
1590	sakthi	http://infotech.nitk.ac.in/research-scholars/sakthi-murugan-r/
1591	oplcb	http://www.openlinksw.com/schemas/crunchbase#
1592	h2o	http://def.seegrid.csiro.au/isotc211/iso19150/-2/2012/basic#
1593	rdag2	http://rdvocab.info/ElementsGr2/
1594	religion	http://rdf.muninn-project.org/ontologies/religion#
1595	vstoi	http://hadatac.org/ont/vstoi#
1596	dio	https://w3id.org/dio#
1597	oae	http://www.ics.forth.gr/isl/oae/core#
1598	koly	http://www.ensias.ma/
1599	olca	http://www.lingvoj.org/olca#
1600	ontosec	http://www.semanticweb.org/ontologies/2008/11/OntologySecurity.owl#
1601	oplmkt	http://www.openlinksw.com/ontology/market#
1602	tavprov	http://ns.taverna.org.uk/2012/tavernaprov/
1603	rvl	http://purl.org/rvl/
1604	clirio	http://clirio.kaerle.com/clirio.owl#
1605	vag	http://www.essepuntato.it/2013/10/vagueness/
1606	incident	http://vocab.resc.info/incident#
1607	locah	http://data.archiveshub.ac.uk/def/
1608	driver	http://deductions.github.io/drivers.owl.ttl#
1609	l2sp	http://www.linked2safety-project.eu/properties/
1610	glview	http://schema.geolink.org/dev/view/
1611	cwrc	http://sparql.cwrc.ca/ontology/cwrc#
1612	bdd	https://api.bloomberg.com/eap/catalogs/bbg/fields/
1613	reegle	http://reegle.info/schema#
1614	rdact	http://rdaregistry.info/termList/RDACarrierType/
1615	omnfed	http://open-multinet.info/ontology/omn-federation#
1616	step	http://purl.org/net/step#
1617	td5	http://td5.org/#
1618	fp3	http://vocab.fusepool.info/fp3#
1619	puml	http://plantuml.com/ontology#
1620	dash	http://datashapes.org/dash#
1621	kegg	http://bio2rdf.org/ns/kegg#
1622	odbc	http://www.openlinksw.com/ontology/odbc#
1623	metadata	http://purl.oreilly.com/ns/meta/
1624	rdarm	http://registry.info/termList/recMedium/
1625	salad	https://w3id.org/cwl/salad#
1626	im	http://imgpedia.dcc.uchile.cl/resource/
1627	rut	http://rdfunit.aksw.org/ns/core#
1628	mod	http://www.isibang.ac.in/ns/mod#
1629	espresup	http://vocab.linkeddata.es/datosabiertos/def/hacienda/presupuestos#
1630	antenne	https://data.zendantennes.omgeving.vlaanderen.be/ns/zendantenne#
1631	rofch	http://rdaregistry.info/termList/rofch/
1632	lsweb	http://ontology.cybershare.utep.edu/ELSEWeb/elseweb-data.owl#
1633	ubiq	http://server.ubiqore.com/ubiq/core#
1634	crowd	http://purl.org/crowd/
1635	vidont	http://vidont.org/
1636	demlab	http://www.demcare.eu/ontologies/demlab.owl#
1637	zr	http://explain.z3950.org/dtd/2.0/
1638	gpml	http://vocabularies.wikipathways.org/gpml#
1639	rdaemm	http://rdaregistry.info/termList/emulsionMicro/
1640	moo	http://www.movieontology.org/2009/11/09/movieontology.owl#
1641	lmx	http://www.w3.org/XML/1998/namespace/
1642	rdafmn	http://rdaregistry.info/termList/MusNotation/
1643	escom	http://vocab.linkeddata.es/datosabiertos/def/comercio/tejidoComercial#
1644	pp	http://peoplesplaces.de/ontology#
1645	rdabf	http://rdaregistry.info/termList/bookFormat/
1646	oxi	http://omerxi.com/ontologies/core.owl.ttl#
1647	ottr	http://ns.ottr.xyz/templates#
1648	lawd	http://lawd.info/ontology/
1649	caplibacl	http://schemas.capita-libraries.co.uk/2015/acl/schema#
1650	uby	http://purl.org/olia/ubyCat.owl#
1651	rdasco	http://rdaregistry.info/termList/soundCont/
1652	traffic	http://www.sensormeasurement.appspot.com/ont/transport/traffic#
1653	irstea	http://ontology.irstea.fr/
1655	rdapmt	http://rdaregistry.info/termList/prodTactile/
1656	jerm	http://jermontology.org/ontology/JERMOntology#
1657	geovoid	http://purl.org/geovocamp/ontology/geovoid/
1658	proms	http://promsns.org/def/proms#
1659	ns1	http://www.w3.org/1999/xhtml/vocab#
1660	doi	https://doi.org/
1661	mexv	http://mex.aksw.org/mex-algo#
1662	efrbroo	http://erlangen-crm.org/efrbroo/
1663	cwl	https://w3id.org/cwl/cwl#
1664	ev	http://www.w3.org/2001/xml-events/
1665	dicera	http://semweb.mmlab.be/ns/dicera#
1666	bb	http://www.snik.eu/ontology/bb/
1667	xslopm	http://purl.org/net/opmv/types/xslt#
1668	hto	http://project-haystack.org/hto#
1669	gci	http://ontology.eil.utoronto.ca/GCI/Foundation/GCI-Foundation.owl#
1670	rdafs	http://rdaregistry.info/termList/fontSize/
1671	hello	https://www.youtube.com/user/SuperTellAFriend/featured/
1672	gs1	http://gs1.org/voc/
1673	lsqv	http://lsq.aksw.org/vocab#
1674	airs	https://raw.githubusercontent.com/airs-linked-data/lov/latest/src/airs_vocabulary.ttl#
1675	meat	http://example.com/
1676	jpo	http://rdf.jpostdb.org/ontology/jpost.owl#
1677	text	http://jena.apache.org/text#
1678	lemonuby	http://lemon-model.net/lexica/uby/
1679	hasneto	http://hadatac.org/ont/hasneto#
1680	figigii	http://www.omg.org/spec/FIGI/GlobalInstrumentIdentifiers/
1681	sx	http://shex.io/ns/shex#
1682	dossier	https://data.omgeving.vlaanderen.be/ns/dossier#
1683	bioc	http://deductions.github.io/biological-collections.owl.ttl#
1684	owsom	https://onlinesocialmeasures.wordpress.com/
1685	aktivesa	http://sa.aktivespace.org/ontologies/aktivesa#
1686	ilap	http://data.posccaesar.org/ilap/
1687	ssno	http://www.w3.org/ns/ssn/
1688	estatwrap	http://ontologycentral.com/2009/01/eurostat/ns#
1689	spcm	http://spi-fm.uca.es/spdef/models/deployment/spcm/1.0#
1690	ecglview	http://schema.geolink.org/view/
1691	agr	http://promsns.org/def/agr#
1692	ws	http://www.w3.org/ns/pim/space#
1693	mmo	http://purl.org/momayo/mmo/
1694	rofer	http://rdaregistry.info/termList/rofer/
1695	lslife	http://ontology.cybershare.utep.edu/ELSEWeb/elseweb-lifemapper.owl#
1696	vsso	http://automotive.eurecom.fr/vsso#
1697	newsevents	http://www.aifb.uni-karlsruhe.de/WBS/uhe/ontologies#
1698	uneskos	http://purl.org/voc/uneskos#
1699	cpack	http://cliopatria.swi-prolog.org/schema/cpack#
1700	fdbp	http://fr.dbpedia.org/property/
1701	ofrd	http://purl.org/opdm/refrigerator#
1702	property	http://fr.dbpedia.org/property/
1703	teamwork	http://topbraid.org/teamwork#
1704	tadirah	http://tadirah.dariah.eu/vocab/
1705	wn30	http://purl.org/vocabularies/princeton/wn30/
1706	escjr	http://vocab.linkeddata.es/datosabiertos/def/urbanismo-infraestructuras/callejero#
1707	mdi	http://w3id.org/multidimensional-interface/ontology#
1708	gont	https://gont.ch/
1709	iana	http://www.iana.org/assignments/relation/
1710	loted	http://loted.eu/ontology#
1711	tix	http://toptix.com/2010/esro/
1712	regorg	http://www.w3.org/ns/regorg#
1713	sdshare	http://www.sdshare.org/2012/extension/
1714	bsym	http://bsym.bloomberg.com/sym/
1715	rdaz	http://rdaregistry.info/Elements/z/
1716	rofrr	http://rdaregistry.info/termList/rofrr/
1717	voidwh	http://www.ics.forth.gr/isl/VoIDWarehouse/VoID_Extension_Schema.owl#
1718	ruian	https://data.cssz.cz/ontology/ruian/
1719	unspsc	http://ontoview.org/schema/unspsc/1#
1720	vartrans	http://www.w3.org/ns/lemon/vartrans#
1721	lswmo	http://ontology.cybershare.utep.edu/ELSEWeb/elseweb-modelling.owl#
1722	yd	https://yodata.io/
1723	esapar	http://vocab.linkeddata.es/datosabiertos/def/urbanismo-infraestructuras/aparcamiento#
1724	essglobal	http://purl.org/essglobal/vocab/v1.0/
1725	webservice	http://www.openlinksw.com/ontology/webservices#
1726	ou	http://opendata.unex.es/def/ontouniversidad#
1727	datex	http://vocab.datex.org/terms#
1728	mexcore	http://mex.aksw.org/mex-core#
1729	cd	http://citydata.wu.ac.at/ns#
1730	year	http://www.w3.org/year/
1731	obeu	http://data.openbudgets.eu/ontology/
1732	eccauth	https://vocab.eccenca.com/auth/
1733	ianarel	https://www.w3.org/ns/iana/link-relations/relation#
1734	ndnp	http://chroniclingamerica.loc.gov/terms#
1735	nlon	http://lod.nl.go.kr/ontology/
1736	rofem	http://rdaregistry.info/termList/rofem/
1737	sgg	http://www.springernature.com/scigraph/graphs/
1738	euvoc	http://publications.europa.eu/ontology/euvoc#
1739	wikimedia	http://upload.wikimedia.org/wikipedia/commons/f/f6/
1740	fire	http://tldp.org/HOWTO/XML-RPC-HOWTO/xmlrpc-howto-java.html#
1741	fnabox	http://www.ontologydesignpatterns.org/ont/framenet/abox/
1742	owl2xml	http://www.w3.org/2006/12/owl2-xml#
1743	pv	http://ns.inria.fr/provoc#
1744	oplweb	http://www.openlinksw.com/schemas/oplweb#
1745	ttla	https://w3id.org/ttla/
1746	ttp	http://eample.com/test#
1747	lheo	http://www.conjecto.com/ontology/2015/lheo#
1748	rdaterm	http://rdaregistry.info/termList/RDATerms/
1749	crime	http://purl.org/vocab/reloc/
1750	lswpm	http://ontology.cybershare.utep.edu/ELSEWeb/elseweb-lifemapper-parameters.owl#
1751	um	http://intelleo.eu/ontologies/user-model/ns/
1752	sto	https://w3id.org/i40/sto#
1753	rofit	http://rdaregistry.info/termList/rofit/
1754	bot	https://w3id.org/bot#
1756	literal	http://www.essepuntato.it/2010/06/literalreification/
1757	mbgd	http://mbgd.genome.ad.jp/owl/mbgd.owl#
1758	pmhb	http://pmhb.org/
1759	hva	http://www.ebusiness-unibw.org/ontologies/hva/ontology#
1760	output	http://volt-name.space/vocab/output#
1761	tsn	http://purl.org/net/tsn#
1762	lgdm	http://linkedgeodata.org/meta/
1763	vacseen1	http://www.semanticweb.org/parthasb/ontologies/2014/6/vacseen1/
1764	pid	http://permid.org/ontology/organization/
1765	door	http://kannel.open.ac.uk/ontology#
1766	dm2e	http://onto.dm2e.eu/schemas/dm2e/
1767	alethio	http://aleth.io/
1768	uom	http://www.opengis.net/def/uom/OGC/1.0/
1769	fntbox	http://www.ontologydesignpatterns.org/ont/framenet/tbox/
1770	rofsm	http://rdaregistry.info/termList/rofsm/
1771	opllog	http://www.openlinksw.com/ontology/logging#
1772	voc	http://voc.odw.tw/
1773	geojson	http://ld.geojson.org/vocab#
1774	rdafnv	http://rdaregistry.info/termList/noteForm/
1775	piero	http://reactionontology.org/piero/
1776	ensembl	http://rdf.ebi.ac.uk/resource/ensembl/
1777	pmc	http://identifiers.org/pmc/
1778	mls	http://www.w3.org/ns/mls#
1779	soch	http://kulturarvsdata.se/ksamsok#
1780	frgeo	http://rdf.insee.fr/geo/
1781	sdt	http://statisticaldata.linkedwidgets.org/terms/
1782	task	http://deductions.github.io/task-management.owl.ttl#
1783	lgt	http://linkedgadget.com/wiki/Property:
1784	gns	http://sws.geonames.org/
1785	ethc	http://ethoinformatics.org/ethocore/
1786	planet	http://dbpedia.org/
1787	ifc	http://ifcowl.openbimstandards.org/IFC2X3_Final#
1788	amsl	http://vocab.ub.uni-leipzig.de/amsl/
1789	glycan	http://purl.jp/bio/12/glyco/glycan#
1790	b3kat	http://lod.b3kat.de/title/
1791	tgm	http://id.loc.gov/vocabulary/graphicMaterials/
1792	llont	http://www.linklion.org/ontology#
1793	imind	http://schema.intellimind.ns/symbology#
1794	eccdi	https://vocab.eccenca.com/di/
1795	pmo	http://premon.fbk.eu/ontology/core#
1796	wde	http://www.wikidata.org/entity/
1797	rdaar	http://rdaregistry.info/termList/AspectRatio/
1798	si	http://sisteminformasi.com/
1799	duv	http://www.w3.org/ns/duv#
1800	dpn	http://purl.org/dpn#
1801	open311	http://ontology.eil.utoronto.ca/open311#
1802	aprov	http://purl.org/a-proc#
1803	swo	http://www.ebi.ac.uk/swo/
1804	gg	http://www.gemeentegeschiedenis.nl/gg-schema#
1805	jpost	http://rdf.jpostdb.org/ontology/jpost.owl#
1806	waarde	https://lod.milieuinfo.be/ns/waarde#
1807	rdapm	http://rdaregistry.info/termList/RDAproductionMethod/
1808	nobel	http://data.nobelprize.org/terms/
1809	itcat	http://th-brandenburg.de/ns/itcat#
1810	tui	http://data.ifs.tuwien.ac.at/study/resource/
1811	esair	http://vocab.linkeddata.es/datosabiertos/def/medio-ambiente/calidad-aire#
1812	crml	http://semweb.mmlab.be/ns/rml/condition#
1813	scco	http://rdf.ebi.ac.uk/terms/surechembl#
1814	memento	http://mementoweb.org/ns#
1815	pdf	http://ns.adobe.com/pdf/1.3/
1816	biml	http://schemas.varigence.com/biml.xsd#
1817	mexalgo	http://mex.aksw.org/mex-algo#
1818	cwork	http://www.bbc.co.uk/ontologies/creativework/
1819	wimpo	http://rdfex.org/withImports?uri=
1820	studiop	http://purl.org/resource/pilatesstudio/
1821	vam	http://www.metmuseum.org/
1822	pcit	http://public-contracts.nexacenter.org/id/propertiesRole/
1823	tarql	http://tarql.github.io/tarql#
1824	neotec	http://neotec.rc.unesp.br/resource/Neotectonics/
1825	huto	http://ns.inria.fr/huto/
1826	umls	http://bioportal.bioontology.org/ontologies/umls/
1827	edgarcik	http://edgarwrap.ontologycentral.com/cik/
1828	pmd	http://publishmydata.com/def/dataset#
1829	rofrm	http://rdaregistry.info/termList/rofrm/
1830	rofid	http://rdaregistry.info/termList/rofid/
1831	iiif	http://iiif.io/api/image/2#
1832	system	http://www.univalle.edu.co/ontologies/System#
1833	meshv	http://id.nlm.nih.gov/mesh/vocab#
1834	lyon	http://dbpedia.org/resource/Lyon/
1835	remetca	http://www.purl.org/net/remetca#
1836	meeting	http://www.w3.org/2002/07/meeting#
1837	mmoon	http://mmoon.org/mmoon/
1838	minim	http://purl.org/minim/minim#
1839	rpath	https://w3id.org/lodsight/rdf-path#
1840	customer	http://www.valuelabs.com/
1841	ipsv	http://id.esd.org.uk/list/
1842	webac	http://fedora.info/definitions/v4/webac#
1843	fuseki	http://jena.apache.org/fuseki#
1844	lsq	http://lsq.aksw.org/vocab#
1845	composer	http://dbpedia.org/ontology/composer/
1846	semiot	http://w3id.org/semiot/ontologies/semiot#
1847	bdc	http://dbpedia.org/resource/Category:
1848	kbv	https://id.kb.se/vocab/
1849	fr	https://w3id.org/fr/def/core#
1850	qms	http://data.europa.eu/esco/qms#
1851	adr	https://w3id.org/laas-iot/adream#
1852	dao	http://purl.org/dao#
1853	organ	http://www.univalle.edu.co/ontologies/Organ#
1854	vocnet	http://schema.vocnet.org/
1855	alice	http://example.org/
1856	tg	http://www.turnguard.com/turnguard#
1857	mmm	http://www.mico-project.eu/ns/mmm/2.0/schema#
1858	dwciri	http://rs.tdwg.org/dwc/iri/
1859	ioto	http://www.irit.fr/recherches/MELODI/ontologies/IoT-O#
1860	smxm	http://smxm.ga/
1861	cue	http://www.clarin.eu/cmdi/cues/display/1.0#
1862	ecoll	http://purl.org/ceu/eco/1.0#
1863	sirext	http://t.me/sirextt/247:
1864	rdalay	http://rdaregistry.info/termList/layout/
1865	rgml	http://purl.org/puninj/2001/05/rgml-schema#
1866	tx	http://swtmp.gitlab.io/vocabulary/templates.owl#
1867	dataid	http://dataid.dbpedia.org/ns/core#
1868	opa	https://w3id.org/laas-iot/adream#
1869	rdaft	http://rdaregistry.info/termList/fileType/
1870	s4envi	https://w3id.org/def/saref4envi#
1871	or	http://openresearch.org/vocab/
1872	eame	http://www.semanticweb.org/ontologia_EA#
1873	cff	http://purl.oclc.org/NET/ssnx/cf/cf-feature#
1874	dcosample	http://info.deepcarbon.net/sample/schema#
1875	sdmxm	http://purl.org/linked-data/sdmx/2009/measure#
1876	dbfo	http://dbpedia.org/facts/ontology#
1877	vogd	http://ogd.ifs.tuwien.ac.at/vienna/geo/
1878	nature	http://deductions.github.io/nature_observation.owl.ttl#
1879	pmovn	http://premon.fbk.eu/ontology/vn#
1880	eol	http://purl.org/biodiversity/eol/
1881	apf	http://jena.apache.org/ARQ/property#
1882	pm	http://premon.fbk.eu/resource/
1883	pmonb	http://premon.fbk.eu/ontology/nb#
1884	maet	http://edg.topbraid.solutions/taxonomy/macroeconomics/
1885	bblfish	http://bblfish.net/people/henry/card#
1886	swcomp	https://github.com/ali1k/ld-reactor/blob/master/vocabulary/index.ttl#
1887	rofin	http://rdaregistry.info/termList/rofin/
1888	datacite	http://purl.org/spar/datacite/
1889	sorg	http://schema.org/
1890	ncicp	http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#
1891	ago	http://awesemantic-geo.link/ontology/
1892	yso	http://www.yso.fi/onto/yso/
1893	scholl	http://menemeneml.com/school#
1894	isbdu	http://iflastandards.info/ns/isbd/unc/elements/
1895	pato	http://purl.obolibrary.org/obo/
1896	ali	http://www.niso.org/schemas/ali/1.0/
1897	cpov	http://data.europa.eu/m8g/
1898	juso	http://rdfs.co/juso/
1899	volt	http://volt-name.space/ontology/
1900	csdbp	http://cs.dbpedia.org/
1901	bgt	https://bgt.basisregistraties.overheid.nl/bgt/def/
1902	rdacarx	http://rdaregistry.info/termList/RDACarrierEU/
1903	ldl	https://w3id.org/ldpdl/ns#
1904	wdv	http://www.wikidata.org/value/
1905	pmofn	http://premon.fbk.eu/ontology/fn#
1906	rdfp	https://w3id.org/rdfp/
1907	brt	http://brt.basisregistraties.overheid.nl/def/top10nl#
1908	spv	http://completeness.inf.unibz.it/sp-vocab#
1909	amt	http://academic-meta-tool.xyz/vocab#
1910	dcodt	http://info.deepcarbon.net/datatype/schema#
1911	audit	http://fedora.info/definitions/v4/audit#
1912	esproc	http://vocab.linkeddata.es/datosabiertos/def/sector-publico/procedimientos#
1913	dsfv	http://sws.ifi.uio.no/vocab/dsf/henriwi/dsf#
1914	owms	http://standaarden.overheid.nl/owms/terms/
1915	eem	http://purl.org/eem#
1916	lgdt	http://linkedgeodata.org/triplify/
1917	rofsf	http://rdaregistry.info/termList/rofsf/
1918	doacc	http://purl.org/net/bel-epa/doacc#
1919	pep	https://w3id.org/pep/
1920	rdaspc	http://rdaregistry.info/termList/specPlayback/
1921	changeset	http://purl.org/vocab/changeset/schema#
1922	sdmxcode	http://purl.org/linked-data/sdmx/2009/code#
1923	pcdm	http://pcdm.org/models#
1924	dk	http://www.data-knowledge.org/dk/schema/rdf/latest/
1925	pbody	http://reference.data.gov.uk/def/public-body/
1926	vplan	http://www.ifs.tuwien.ac.at/~miksa/ontologies/VPlan.owl#
1927	ver	https://w3id.org/version/ontology#
1928	dsw	http://purl.org/dsw/
1929	rofhf	http://rdaregistry.info/termList/rofhf/
1930	asawoo	http://liris.cnrs.fr/asawoo/
1931	sdterms	http://statisticaldata.linkedwidgets.org/terms/
1932	dcap	http://purl.org/ws-mmi-dc/terms/
1933	maeco	http://edg.topbraid.solutions/maeco/
1934	undata	http://citydata.wu.ac.at/Linked-UNData/data/
1935	isidore	http://www.rechercheisidore.fr/class/
1936	voidex	http://www.swi-prolog.org/rdf/library/
1937	rdax	http://rdaregistry.info/Elements/x/
1938	ppr	http://purl.org/datanode/ppr/ns/
1939	elod	http://linkedeconomy.org/ontology#
1940	gobierno	http://www.gobierno.es/gobierno/
1941	rdacdt	http://rdaregistry.info/termList/RDACartoDT/
1942	imo	http://imgpedia.dcc.uchile.cl/ontology#
1943	aozora	http://purl.org/net/aozora/
1944	dcodata	http://info.deepcarbon.net/data/schema#
1945	rdapf	http://rdaregistry.info/termList/presFormat/
1946	rofim	http://rdaregistry.info/termList/rofim/
1947	svcs	http://rdfs.org/sioc/services#
1948	tissue	http://www.univalle.edu.co/ontologies/Tissue#
1949	rofrt	http://rdaregistry.info/termList/rofrt/
1950	sct	http://snomed.info/sct/
1951	ja	http://jena.hpl.hp.com/2005/11/Assembler#
1952	gt	https://vocab.eccenca.com/geniustex/
1953	dto	http://www.datatourisme.fr/ontology/core/1.0#
1954	provinsi	http://provinsi.com/
1955	clapit	http://dati.gov.it/onto/clapit/
1956	fluidops	http://www.fluidops.com/
1957	rdagen	http://rdaregistry.info/termList/RDAGeneration/
1958	ispra	http://dati.isprambiente.it/ontology/core#
1959	provoc	http://ns.inria.fr/provoc/
1960	geoloc	http://deductions.github.io/geoloc.owl.ttl#
1961	it	http://www.influencetracker.com/ontology#
1962	srx	http://www.w3.org/2005/sparql-results#
1963	llr	http://lodlaundromat.org/resource/
1964	pand	http://bag.basisregistraties.overheid.nl/bag/id/pand/
1965	seeds	http://deductions.github.io/seeds.owl.ttl#
1966	oplbenefit	http://www.openlinksw.com/ontology/benefits#
1967	add	http://www.datatourisme.fr/ontology/core/1.0#
1968	wsdl	http://www.w3.org/ns/wsdl-rdf#
1969	sgfn	http://w3id.org/sparql-generate/fn/
1970	sgiter	http://w3id.org/sparql-generate/iter/
1971	eccpubsub	https://vocab.eccenca.com/pubsub/
1972	frappe	http://streamreasoning.org/ontologies/frappe#
1973	ldqm	http://linkeddata.es/resource/ldqm/
1974	km4c	http://www.disit.org/km4city/schema#
1975	connard	https://mail.google.com/mail/u/1/#
1976	wail	http://www.eyrie.org/~zednenem/2002/wail/
1977	nkos	http://w3id.org/nkos#
1978	sfn	http://semweb.datasciencelab.be/ns/sfn#
1979	sdmxc	http://purl.org/linked-data/sdmx/2009/concept#
1980	assoc	https://w3id.org/associations/vocab#
1981	rm	http://jazz.net/ns/rm#
1982	marcrole	http://id.loc.gov/vocabulary/relators/
1983	pmopb	http://premon.fbk.eu/ontology/pb#
1984	rdacpc	http://rdaregistry.info/termList/configPlayback/
1985	edac	http://ontology.cybershare.utep.edu/ELSEWeb/elseweb-edac.owl#
1986	persee	http://data.persee.fr/ontology/persee_ontology/
1987	seokoeln	http://rankrage.de/
1988	bl	https://w3id.org/biolink/vocab/
1989	gvoith	http://assemblee-virtuelle.github.io/grands-voisins-v2/thesaurus.ttl#
1990	tosh	http://topbraid.org/tosh#
1991	gdc	https://portal.gdc.cancer.gov/cases/
1992	uc	http://ucuenca.edu.ec/ontology#
1993	orcid	http://orcid.org/
1994	fun	http://w3id.org/sparql-generate/fn/
1995	its	http://www.w3.org/2005/11/its/rdf#
1996	efd	http://data.foodanddrinkeurope.eu/ontology#
1997	id	http://identifiers.org/
1998	r4r	http://guava.iis.sinica.edu.tw/r4r/
1999	neotecbib	http://neotec.rc.unesp.br/resource/NeotectonicsBibliography/
2000	rdabs	http://rdaregistry.info/termList/broadcastStand/
2001	oplwebsrv	http://www.openlinksw.com/ontology/webservices#
2002	ids	https://w3id.org/idsa/core/
2003	qbe	http://citydata.wu.ac.at/qb-equations#
2004	ctxdesc	http://www.demcare.eu/ontologies/contextdescriptor.owl#
2005	rdaad	http://rdaregistry.info/Elements/a/datatype/
2006	rfd	http://com.intrinsec//ontology#
2007	vort	http://rockets.topbraid.solutions/vort/
2008	ldq	http://www.linkeddata.es/ontology/ldq#
2009	ns2	http://ogp.me/ns#video:
2010	rdaill	http://rdaregistry.info/termList/IllusContent/
2011	emergelm	http://purl.org/emergel/modules#
2012	brk	http://brk.basisregistraties.overheid.nl/def/brk#
2013	activity	https://www.w3.org/TR/activitystreams-vocabulary/
2014	rofet	http://rdaregistry.info/termList/rofet/
2015	d3s	http://vocbench.solidaridad.cloud/taxonomies#
2016	psv	http://www.wikidata.org/prop/statement/value/
2017	ldn	https://www.w3.org/TR/ldn/#
2018	bdo	http://purl.bdrc.io/ontology/core/
2019	geor	http://www.opengis.net/def/rule/geosparql/
2020	master1	http://idl.u-grenoble3.fr/
2021	bds	http://www.bigdata.com/rdf/search#
2022	ppn	http://parliament.uk/ontologies/person-name/
2023	oplli	http://www.openlinksw.com/schemas/linkedin#
2024	ideotalex	http://www.ideotalex.eu/datos/recurso/
2025	lmdb	http://data.linkedmdb.org/movie/
2026	wab	http://wab.uib.no/cost-a32_philospace/wittgenstein.owl#
2027	iso37120	http://ontology.eil.utoronto.ca/ISO37120.owl#
2028	dsv	http://purl.org/iso25964/DataSet/Versioning#
2029	oplp	http://www.openlinksw.com/ontology/purchases#
2030	pair	http://virtual-assembly.org/pair/PAIR_LOD_V3.owl/
2031	w3cgeo	http://www.w3.org/2003/01/geo/wgs84_pos#
2032	ncbigene	http://identifiers.org/ncbigene/
2033	ido	http://purl.obolibrary.org/obo/ido.owl#
2034	ims	http://www.imsglobal.org/xsd/imsmd_v1p2/
2035	estatgph	http://estatwrap.ontologycentral.com/id/nama_aux_gph#
2036	llalg	http://www.linklion.org/algorithm/
2037	ifcowl	http://www.buildingsmart-tech.org/ifcOWL/IFC4_ADD2#
2038	ceterms	http://purl.org/ctdl/terms/
2039	sciprov	http://sweetontology.net/reprSciProvenance/
2040	iter	http://w3id.org/sparql-generate/iter/
2041	rdavf	http://rdaregistry.info/termList/videoFormat/
2042	vehma	http://deductions.github.io/vehicule-management.owl.ttl#
2043	aml	https://w3id.org/i40/aml#
2044	vsearch	http://vocab.sti2.at/vsearch#
2045	cocoon	https://w3id.org/cocoon/v1.0#
2046	osd	http://a9.com/-/spec/opensearch/1.1/
2047	plg	http://parliament.uk/ontologies/legislation/
2048	prohow	https://w3id.org/prohow#
2049	nih	http://ncicb.nci.nih.gov/xml/owl/EVS/Thesaurus.owl#
2050	scra	http://purl.org/net/schemarama#
2051	ontop	https://w3id.org/ontop/
2052	emergel	http://purl.org/emergel/core#
2053	dcx	http://dublincore.org/dcx/
2054	input	http://volt-name.space/vocab/input#
2055	oplstocks	http://www.openlinksw.com/ontology/stocks#
2056	odw	http://odw.tw/
2057	gvoi	http://assemblee-virtuelle.github.io/grands-voisins-v2/gv.owl.ttl#
2058	ogdl4m	https://github.com/martynui/OGDL4M/
2059	cpi	http://www.ebusiness-unibw.org/ontologies/cpi/ns#
2060	fhir	http://hl7.org/fhir/
2061	eustd	http://eurostat.linked-statistics.org/data#
2062	besluit	http://data.vlaanderen.be/ns/besluit#
2063	oplangel	http://www.openlinksw.com/schemas/angel#
2064	lido	http://www.lido-schema.org/
2065	da	https://www.wowman.org/index.php?id=1&type=get#
2066	edg	http://edg.topbraid.solutions/model/
2067	mexperf	http://mex.aksw.org/mex-perf#
2068	dcatnl	http://standaarden.overheid.nl/dcatnl/terms/
2069	sfd	http://semantic-forms.cc:9112/ldp/
2070	aseonto	http://requirement.ase.ru/requirements_ontology#
2071	foam	https://www.koerperfettwaage-test.de/
2072	ondc	http://www.semanticweb.org/ontologies/2012/1/Ontology1329913965202.owl#
2073	sylld	http://www.semanticweb.org/syllabus/data/
2074	cubeont	http://ontology.cube.global/
2075	sirene	https://sireneld.io/vocab/sirene#
2076	orgesv2	http://datos.gob.es/sites/default/files/OntologiaDIR3/orges.owl#
2077	halyard	http://merck.github.io/Halyard/ns#
2078	globalcube	http://kalmar32.fzi.de/triples/global-cube.ttl#
2079	tsnchange	http://purl.org/net/tsnchange#
2080	dqc	http://semwebquality.org/ontologies/dq-constraints#
2081	logies	https://data.vlaanderen.be/ns/logies#
2082	estrf	http://vocab.linkeddata.es/datosabiertos/def/transporte/trafico#
2083	rdare	http://rdaregistry.info/termList/RDARegionalEncoding/
2084	s3n	http://w3id.org/s3n/
2085	shui	https://vocab.eccenca.com/shui/
2086	lcsh	http://id.loc.gov/authorities/subjects/
2087	agrovoc	http://aims.fao.org/aos/agrovoc/
2088	docker	http://www.w3.org/ns/bde/docker/
2089	fog	https://w3id.org/fog#
2090	dgfr	http://colin.maudry.com/ontologies/dgfr#
2091	bob	http://good.dad/meaning/bob#
2092	bci	https://w3id.org/BCI-ontology#
2093	pop	http://wiki.dbpedia.org/
2094	ecore	http://www.eclipse.org/emf/2002/Ecore#
2095	lmo	http://linkedmultimedia.org/sparql-mm/ns/2.0.0/ontology#
2096	mandaat	http://data.vlaanderen.be/ns/mandaat#
2097	imas	https://sparql.crssnky.xyz/imasrdf/URIs/imas-schema.ttl#
2098	valueflows	https://w3id.org/valueflows/
2099	bdr	http://purl.bdrc.io/resource/
2100	prof	http://www.w3.org/ns/dx/prof/
2101	rimmf	http://rimmf.com/vocab/
2102	fssp	http://linkeddata.fssprus.ru/resource/
2103	led	http://led.kmi.open.ac.uk/term/
2104	numbers	http://km.aifb.kit.edu/projects/numbers/
2105	mml	http://www.w3.org/1998/Math/MathML/
2106	dead	http://utpl.edu.ec/sbc/data/
2107	cdao	http://purl.obolibrary.org/obo/
2108	datacron	http://www.datacron-project.eu/datAcron#
2109	afr	http://purl.allotrope.org/ontologies/result#
2110	decprov	http://promsns.org/def/decprov#
2111	gbol	http://gbol.life/0.1#
2112	iotlite	http://purl.oclc.org/NET/UNIS/fiware/iot-lite#
2113	fnml	http://semweb.mmlab.be/ns/fnml#
2114	brick	https://brickschema.org/schema/1.1/Brick#
2115	dpla	http://dp.la/info/developers/map/
2116	radar	http://www.radar-projekt.org/display/
2117	nrv	http://ns.inria.fr/nrv#
2118	genre	http://sparql.cwrc.ca/ontologies/genre#
2119	seo	http://sda.tech/SEOontology/SEO/
2120	geo7	https://www.geo7.ch/
2121	ddb	http://www.deutsche-digitale-bibliothek.de/edm/
2122	literature	http://purl.org/net/cnyt-literature#
2123	isaterms	http://purl.org/isaterms/
2124	dot	https://w3id.org/dot#
2125	theme	http://voc.odw.tw/theme/
2126	iab	https://www.iab.com/guidelines/taxonomy/
2127	s4bldg	https://w3id.org/def/saref4bldg#
2128	hico	http://purl.org/emmedi/hico/
2129	number	http://km.aifb.kit.edu/projects/numbers/number#
2130	ecowlim	http://ecowlim.tfri.gov.tw/lode/resource/
2131	eepsa	https://w3id.org/eepsa#
2132	nosql	http://purl.org/db/nosql#
2133	faostat	http://reference.eionet.europa.eu/faostat/schema/
2134	rvz	http://rdfvizler.dyreriket.xyz/vocabulary/core#
2135	legal	http://www.w3.org/ns/legal#
2136	snac	http://socialarchive.iath.virginia.edu/
2137	mobivoc	http://schema.mobivoc.org/
2138	loupe	http://ont-loupe.linkeddata.es/def/core/
2139	munc	http://ns.inria.fr/munc#
2140	cwlprov	https://w3id.org/cwl/prov#
2141	omg	https://w3id.org/omg#
2142	r3d	http://www.re3data.org/schema/3-0#
2143	ln	https://w3id.org/ln#
2144	gdpr	https://vocab.eccenca.com/gdpr/
2145	dnbt	http://d-nb.info/standards/elementset/dnb#
2146	linkrel	https://www.w3.org/ns/iana/link-relations/relation#
2147	az	https://w3id.org/people/az/
2148	mdont	http://ont.matchdeck.com/
2149	ldt	https://www.w3.org/ns/ldt#
2150	mydb	http://mydb.org/
2151	lovc	https://w3id.org/lovcube/ns/lovcube#
2152	m3	http://sensormeasurement.appspot.com/m3#
2153	fred	http://www.ontologydesignpatterns.org/ont/fred/domain.owl#
2154	timex	http://data.wu.ac.at/ns/timex#
2155	medred	http://w3id.org/medred/medred#
2156	foaffff	http://gogl.com/
2157	rls	https://w3id.org/lovcube/ns/relovstats#
2158	atlasterms	http://rdf.ebi.ac.uk/terms/atlas/
2159	scho	http://www.scholarlydata.org/ontology/conference-ontology.owl#
2160	pfeepsa	https://w3id.org/pfeepsa#
2161	cbim	http://www.coinsweb.nl/cbim-2.0.rdf#
2162	iati	http://purl.org/collections/iati/
2163	kmgeo	http://km.aifb.kit.edu/services/geo/ontology#
2164	vehman	http://deductions.github.io/vehicule-management.owl.ttl#
2165	lmu	https://w3id.org/laas-iot/lmu#
2166	smartapi	http://smart-api.io/ontology/1.0/smartapi#
2167	bioentity	http://bioentity.io/vocab/
2168	swrc2	https://www.cs.vu.nl/~mcaklein/onto/swrc_ext/2005/05#
2169	yaco	https://www.irit.fr/recherches/MELODI/ontologies/cinema#
2170	roar	https://w3id.org/roar#
2171	physics	http://www.astro.umd.edu/~eshaya/astro-onto/owl/physics.owl#
2172	cwlgit	https://w3id.org/cwl/view/git/
2173	conference	https://w3id.org/scholarlydata/ontology/conference-ontology.owl#
2174	vss	http://automotive.eurecom.fr/vsso#
2175	vir	http://w3id.org/vir#
2176	mem	http://mementoweb.org/ns#
2177	mwapi	https://www.mediawiki.org/ontology#API/
2178	aksw	http://aksw.org/
2179	frbroo	http://iflastandards.info/ns/fr/frbr/frbroo/
2180	drk	http://drakon.su/
2181	ontoneo	http://purl.obolibrary.org/obo/ontoneo/
2182	adf	http://purl.allotrope.org/ontologies/datapackage#
2183	cim	http://iec.ch/TC57/2013/CIM-schema-cim16#
2184	bpo	https://w3id.org/bpo#
2185	url	http://schema.org/
2186	pcdmuse	http://pcdm.org/use#
2187	afm	http://purl.allotrope.org/ontologies/material/
2188	conll	https://universaldependencies.org/format.html#
2189	tikag	https://www.tikag.com/
2190	one	https://bioportal.bioontology.org/ontologies/ONE/
2191	reg	http://purl.org/linked-data/registry#
2192	county	http://myexample.org/county#
2193	beer	http://beer.com/
2194	chear	http://hadatac.org/ont/chear#
2195	odf	http://docs.oasis-open.org/ns/office/1.2/meta/odf#
2196	fnom	https://w3id.org/function/vocabulary/mapping#
2197	ca	http://complyadvantage.com/
2198	ucum	http://purl.oclc.org/NET/muo/ucum/
2199	summa	http://purl.org/voc/summa/
2200	refexo	http://purl.jp/bio/01/refexo#
2201	ul	http://underlay.mit.edu/ns/
2202	nno	https://w3id.org/nno/ontology#
2203	alg	http://drakon.su/ADF#
2204	goaf	http://goaf.fr/goaf#
2205	dpv	http://www.w3.org/ns/dpv#
2206	swa	http://topbraid.org/swa#
2207	devuan	https://devuan.net.br/
2208	esservicio	http://vocab.linkeddata.es/datosabiertos/def/sector-publico/servicio#
2209	roc	https://w3id.org/ro/curate#
2210	semsur	http://purl.org/SemSur/
2211	edr	https://w3id.org/laas-iot/edr#
2212	trao	http://linkeddata.finki.ukim.mk/lod/ontology/tao#
2213	tb	https://w3id.org/timebank#
2214	nas	https://data.nasa.gov/ontologies/atmonto/NAS#
2215	sohukd	http://sweetontology.net/humanKnowledgeDomain/
2216	idot	http://identifiers.org/idot/
2217	noise	http://vocab.linkeddata.es/datosabiertos/def/medio-ambiente/contaminacion-acustica#
2218	crmeh	http://purl.org/crmeh#
2219	s4ee	https://w3id.org/saref4ee#
2220	pham	https://w3id.org/skgo/pham#
2221	obws	http://delicias.dia.fi.upm.es/ontologies/ObjectWithStates.owl#
2222	rami	http://iais.fraunhofer.de/vocabs/rami#
2223	rsctx	http://softeng.polito.it/rsctx#
2224	vocals	http://w3id.org/rsp/vocals#
2225	ocds	http://purl.org/onto-ocds/ocds#
2226	powla	http://purl.org/powla/powla.owl#
2227	cog	http://purl.org/ontology/cco/core#
2228	mus	http://data.doremus.org/ontology#
2229	otl	https://w3id.org/opentrafficlights#
2230	qkdv	http://qudt.org/vocab/dimensionvector/
2231	ctrl	https://w3id.org/ibp/CTRLont#
2232	spvqa	https://bmake.th-brandenburg.de/spv#
2233	dbms	http://www.openlinksw.com/ontology/dbms-app-ontology#
2234	ermrk	http://www.essepuntato.it/2008/12/earmark#
2235	esdbpr	http://es.dbpedia.org/resource/
2236	phy	https://w3id.org/skgo/phy#
2237	lg	https://purl.org/lg/
2238	veo	http://linkeddata.finki.ukim.mk/lod/ontology/veo#
2239	wdtn	http://www.wikidata.org/prop/direct-normalized/
2240	ksam	http://kulturarvsdata.se/ksamsok#
2241	cbb	https://data.cbb.omgeving.vlaanderen.be/ns/cbb#
2242	dby	http://dbpedia.org/class/yago/
2243	oop	http://w3id.org/oop#
2244	occ	http://w3id.org/occ#
2245	cska	http://pfclitex.com/
2246	s4syst	https://saref.etsi.org/saref4syst/
2247	bkb	https://budayakb.cs.ui.ac.id/ns#
2248	m3lite	http://purl.org/iot/vocab/m3-lite#
2249	omnlc	http://open-multinet.info/ontology/omn-lifecycle#
2250	gdprov	https://w3id.org/GDPRov#
2251	gdprtext	https://w3id.org/GDPRtEXT#
2252	ii	http://sparql.cwrc.ca/ontologies/ii#
2253	crminf	http://www.cidoc-crm.org/cidoc-crm/CRMinf/
2254	tree	https://w3id.org/tree#
2255	bld	http://biglinkeddata.com/
2256	xbrll	https://w3id.org/vocab/xbrll#
2257	loci	http://linked.data.gov.au/def/loci#
2258	oup	http://purl.org/ontology-use-patterns#
2259	geofabric	http://linked.data.gov.au/def/geofabric#
2260	imjv	https://data.imjv.omgeving.vlaanderen.be/ns/imjv#
2261	jup	http://w3id.org/charta77/jup/
2262	iospress	http://ld.iospress.nl/rdf/ontology/
2263	gnaf	http://linked.data.gov.au/def/gnaf#
2264	gmo	http://purl.jp/bio/10/gmo/
2265	lblodlg	http://data.lblod.info/vocabularies/leidinggevenden/
2266	dm	http://datamusee.givingsense.eu/onto/
2267	hosp	http://health.data.gov/def/hospital/
2268	isoadr	http://reference.data.gov.au/def/ont/iso19160-1-address#
2269	eproc	http://10.0.3.120/download/eproc_FORN_v02.owl#
2270	manto	http://com.vortic3.MANTO/
2271	losp	http://sparql.sstu.ru:3030/speciality/
2272	esagen	http://vocab.ciudadesabiertas.es/def/sector-publico/agenda-municipal#
2273	terms	http://purl.org/dc/terms/
2274	gcon	https://w3id.org/GConsent#
2275	earth	http://linked.earth/ontology#
2276	eproc2	http://10.0.3.120/download/eproc_FORN_v04.owl#
2277	daap	http://daap.dsi.universite-paris-saclay.fr/wiki/
2278	constant	http://qudt.org/vocab/constant/
2279	soma	http://sweetontology.net/matr/
2280	fel	http://w3id.org/vcb/fel#
2281	eppl	https://w3id.org/ep-plan#
2282	bitl	http://lib.bit.edu.cn/ontology/1.0/
2283	dave	http://theme-e.adaptcentre.ie/dave#
2284	foio	https://w3id.org/seas/FeatureOfInterestOntology/
2285	eqp	https://data.nasa.gov/ontologies/atmonto/equipment#
2286	lesa	http://hadatac.org/ont/lesa#
2287	exo	https://w3id.org/example#
2288	sfl	http://data.finlex.fi/schema/sfl/
2289	modsci	https://w3id.org/skgo/modsci#
2290	asgs	http://linked.data.gov.au/def/asgs#
2291	sopropr	http://sweetontology.net/propRotation/
2292	wild	http://purl.org/wild/vocab#
2293	sopropsp	http://sweetontology.net/propSpeed/
2294	bsh	https://brickschema.org/schema/1.1.0/BrickShape#
2295	ods	http://lod.xdams.org/ontologies/ods/
2296	sopropsl	http://sweetontology.net/propSpaceLocation/
2297	dprov	http://promsns.org/def/do#
2298	sorealc	http://sweetontology.net/realmLandCoastal/
2299	osys	http://purl.org/olia/system.owl#
2300	biolink	https://w3id.org/biolink/vocab/
2301	sopropti	http://sweetontology.net/propTime/
2302	soproptg	http://sweetontology.net/propTemperatureGradient/
2303	sopropsh	http://sweetontology.net/propSpaceHeight/
2304	eupont	http://elite.polito.it/ontologies/eupont.owl#
2305	esgs	https://w3id.org/edwin/ontology/
2306	skoslex	https://bp4mc2.org/def/skos-lex#
2307	sopropsdis	http://sweetontology.net/propSpaceDistance/
2308	sophatmowm	https://sweetontology.net/phenAtmoWindMesoscale/
2309	apb	http://www.analysispartners.org/businessmodel/
2310	sopropsdir	http://sweetontology.net/propSpaceDirection/
2311	sohues	http://sweetontology.net/humanEnvirStandards/
2312	iaph	http://www.juntadeandalucia.es/datosabiertos/portal/iaph/dataset/dataset/6c199ca2-8d2e-4c12-833c-f28
2313	soreaa	http://sweetontology.net/realmAtmo/
2314	sohut	http://sweetontology.net/humanTransportation/
2315	epplan	https://w3id.org/ep-plan#
2316	cwmo	http://purl.org/cwmo/#
2317	sopropi	http://sweetontology.net/propIndex/
2318	sorelm	http://sweetontology.net/relaMath/
2319	sorelt	http://sweetontology.net/relaTime/
2320	eccf	http://data.europa.eu/54i/
2321	istex	https://data.istex.fr/ontology/istex#
2322	somaae	http://sweetontology.net/matrAerosol/
2323	twitter	http://stocktwits.com/
2324	sostth	http://sweetontology.net/stateThermodynamic/
2325	dmp	http://www.sysresearch.org/rda-common-dmp#
2326	sostv	http://sweetontology.net/stateVisibility/
2327	sosttg	http://sweetontology.net/stateTimeGeologic/
2328	sostso	http://sweetontology.net/stateSolid/
2329	somaoc	http://sweetontology.net/matrOrganicCompound/
2330	sohur	http://sweetontology.net/humanResearch/
2331	extech	https://w3id.org/executionTechnique/ontology/
2332	qk	http://qudt.org/vocab/quantitykind/
2333	soproptf	http://sweetontology.net/propTimeFrequency/
2334	shema	http://schema.org/
2335	sostst	http://sweetontology.net/stateStorm/
2336	dentsci	https://w3id.org/skgo/dentsci#
2337	sorelh	http://sweetontology.net/relaHuman/
2338	soreaas	http://sweetontology.net/realmAstroStar/
2339	soreao	http://sweetontology.net/realmOcean/
2340	sostrr	http://sweetontology.net/stateRoleRepresentative/
2341	pplan	http://purl.org/net/p-plan#
2342	sopropo	http://sweetontology.net/propOrdinal/
2343	sostri	http://sweetontology.net/stateRoleImpact/
2344	soreacz	http://sweetontology.net/realmClimateZone/
2345	sopropt	http://sweetontology.net/propTemperature/
2346	sorepsc	http://sweetontology.net/reprSciComponent/
2347	dbm	http://purl.org/net/dbm/ontology#
2348	sopropsm	http://sweetontology.net/propSpaceMultidimensional/
2349	somarock	http://sweetontology.net/matrRock/
2350	sopropp	http://sweetontology.net/propPressure/
2351	sopropb	http://sweetontology.net/propBinary/
2352	pineapple	http://hexananas.com/pineapple#
2353	sopropmf	http://sweetontology.net/propMassFlux/
2354	probont	http://www.probonto.org/ontology#
2355	donto	http://reference.data.gov.au/def/ont/dataset#
2356	sohutr	http://sweetontology.net/humanTechReadiness/
2357	sorear	http://sweetontology.net/realmRegion/
2358	soprops	http://sweetontology.net/propSpace/
2359	sosttc	http://sweetontology.net/stateTimeCycle/
2360	sohuj	http://sweetontology.net/humanJurisdiction/
2361	sorepmo	http://sweetontology.net/reprMathOperation/
2362	inchikey	https://identifiers.org/inchikey:
2363	sorel	http://sweetontology.net/rela/
2364	sorelsp	http://sweetontology.net/relaSpace/
2365	sophatmopc	http://sweetontology.net/phenAtmoPrecipitation/
2366	stencila	http://schema.stenci.la/
2367	sostrt	http://sweetontology.net/stateRoleTrust/
2368	somamin	http://sweetontology.net/matrMineral/
2369	sopropq	http://sweetontology.net/propQuantity/
2370	sopropst	http://sweetontology.net/propSpaceThickness/
2371	sophcr	http://sweetontology.net/phenCryo/
2372	edupro	http://ns.inria.fr/semed/eduprogression#
2373	sohuecons	http://sweetontology.net/humanEnvirConservation/
2374	mccv	http://purl.jp/bio/10/mccv#
2673	nsg	https://neuroshapes.org/
2375	sosttf	http://sweetontology.net/stateTimeFrequency/
2376	sostsy	http://sweetontology.net/stateSystem/
2377	somael	http://sweetontology.net/matrElement/
2378	sophst	http://sweetontology.net/phenStar/
2379	wotsec	https://www.w3.org/2019/wot/security#
2380	misp	http://purl.org/cyber/misp#
2381	soprocsc	http://sweetontology.net/procStateChange/
2382	rico	https://www.ica.org/standards/RiC/ontology#
2383	sorepsl	http://sweetontology.net/reprSciLaw/
2384	yandex	http://yandex.ru/
2385	somaem	http://sweetontology.net/matrElementalMolecule/
2386	sorealp	http://sweetontology.net/realmLandProtected/
2387	sorelpr	http://sweetontology.net/relaProvenance/
2388	sopropdifu	http://sweetontology.net/propDiffusivity/
2389	esagm	http://vocab.ciudadesabiertas.es/def/sector-publico/agenda-municipal#
2390	pq	http://www.wikidata.org/prop/qualifier/
2391	sorepdsg	http://sweetontology.net/reprDataServiceGeospatial/
2392	sorepmso	http://sweetontology.net/reprMathSolution/
2393	sophec	http://sweetontology.net/phenEcology/
2394	sophsy	http://sweetontology.net/phenSystem/
2395	cci	http://cookingbigdata.com/linkeddata/ccinstances#
2396	chemsci	https://w3id.org/skgo/chemsci#
2397	sorepscd	http://sweetontology.net/reprSpaceCoordinate/
2398	soreabb	http://sweetontology.net/realmBiolBiome/
2399	sopropcha	http://sweetontology.net/propCharge/
2400	sorepdp	http://sweetontology.net/reprDataProduct/
2401	sorepdm	http://sweetontology.net/reprDataModel/
2402	soprocc	http://sweetontology.net/procChemical/
2403	soreac	http://sweetontology.net/realmCryo/
2404	ei2a	http://opendata.aragon.es/def/ei2a#
2405	sost	http://sweetontology.net/state/
2406	sopropfr	http://sweetontology.net/propFraction/
2407	sorelch	http://sweetontology.net/relaChemical/
2408	sorepdsv	http://sweetontology.net/reprDataServiceValidation/
2409	soreaofe	http://sweetontology.net/realmOceanFeature/
2410	sophatmow	http://sweetontology.net/phenAtmoWind/
2411	soreas	http://sweetontology.net/realmSoil/
2412	soreahb	http://sweetontology.net/realmHydroBody/
2413	stx	http://purl.org/cyber/stix#
2414	somaen	http://sweetontology.net/matrEnergy/
2415	somapl	http://sweetontology.net/matrPlant/
2416	somac	http://sweetontology.net/matrCompound/
2417	somaind	http://sweetontology.net/matrIndustrial/
2418	soproc	http://sweetontology.net/proc/
2419	sorept	http://sweetontology.net/reprTime/
2420	sohueccont	http://sweetontology.net/humanEnvirControl/
2421	soreaabl	http://sweetontology.net/realmAtmoBoundaryLayer/
2422	sophatmofr	http://sweetontology.net/phenAtmoFront/
2423	somanr	http://sweetontology.net/matrNaturalResource/
2424	ci	https://privatealpha.com/ontology/content-inventory/1#
2425	soman	http://sweetontology.net/matrAnimal/
2426	hctl	https://www.w3.org/2019/wot/hypermedia#
2427	sophatmofo	http://sweetontology.net/phenAtmoFog/
2428	somais	http://sweetontology.net/matrIsotope/
2429	sostti	http://sweetontology.net/stateTime/
2430	sorep	http://sweetontology.net/repr/
2431	somab	http://sweetontology.net/matrBiomass/
2432	sopropcap	http://sweetontology.net/propCapacity/
2433	sorelsc	http://sweetontology.net/relaSci/
2434	soprocp	http://sweetontology.net/procPhysical/
2435	sopropdr	http://sweetontology.net/propDimensionlessRatio/
2436	sorepmst	http://sweetontology.net/reprMathStatistics/
2437	somas	http://sweetontology.net/matrSediment/
2438	sorelph	http://sweetontology.net/relaPhysical/
2439	sophso	http://sweetontology.net/phenSolid/
2440	sopropm	http://sweetontology.net/propMass/
2441	atd	https://data.nasa.gov/ontologies/atmonto/data#
2442	sorepsrs	http://sweetontology.net/reprSpaceReferenceSystem/
2443	cfrl	http://linkeddata.finki.ukim.mk/lod/ontology/cfrl#
2444	soreaaw	http://sweetontology.net/realmAtmoWeather/
2445	sorepmg	http://sweetontology.net/reprMathGraph/
2446	sopropcon	http://sweetontology.net/propConductivity/
2447	sorepts	http://sweetontology.net/reprTimeSeason/
2448	sorepmfo	http://sweetontology.net/reprMathFunctionOrthogonal/
2449	soprope	http://sweetontology.net/propEnergy/
2450	jsonschema	https://www.w3.org/2019/wot/json-schema#
2451	sorepsd	http://sweetontology.net/reprSpaceDirection/
2452	sophatmoc	http://sweetontology.net/phenAtmoCloud/
2453	proton	http://www.ontotext.com/proton/
2454	d2s	https://w3id.org/d2s/
2455	sorepdsa	http://sweetontology.net/reprDataServiceAnalysis/
2456	sorelcl	http://sweetontology.net/relaClimate/
2457	sophel	http://sweetontology.net/phenElecMag/
2458	sorepm	http://sweetontology.net/reprMath/
2459	soreaofl	http://sweetontology.net/realmOceanFloor/
2460	soph	http://sweetontology.net/phen/
2461	sweet	http://sweetontology.net/
2462	somaf	http://sweetontology.net/matrFacility/
2463	sophatmot	http://sweetontology.net/phenAtmoTransport/
2464	somarocki	http://sweetontology.net/matrRockIgneous/
2465	atts	https://data.nasa.gov/ontologies/atmonto/general#
2466	phto	http://rhizomik.net/ontologies/PlantHealthThreats.owl.ttl#
2467	sorepsme	http://sweetontology.net/reprSciMethodology/
2468	sostc	http://sweetontology.net/stateChemical/
2469	sorepdsr	http://sweetontology.net/reprDataServiceReduction/
2470	sophod	http://sweetontology.net/phenOceanDynamics/
2471	sosto	http://sweetontology.net/stateOrdinal/
2472	sorepdf	http://sweetontology.net/reprDataFormat/
2473	sorepsu	http://sweetontology.net/reprSciUnits/
2474	soreaah	http://sweetontology.net/realmAstroHelio/
2475	sophatmol	http://sweetontology.net/phenAtmoLightning/
2476	sorepds	http://sweetontology.net/reprDataService/
2477	soprop	http://sweetontology.net/prop/
2478	sophr	http://sweetontology.net/phenReaction/
2479	sopropcou	http://sweetontology.net/propCount/
2480	sophm	http://sweetontology.net/phenMixing/
2481	somains	http://sweetontology.net/matrInstrument/
2482	sophatmos	http://sweetontology.net/phenAtmoSky/
2483	sophb	http://sweetontology.net/phenBiol/
2484	sophfi	http://sweetontology.net/phenFluidInstability/
2485	sopropche	http://sweetontology.net/propChemical/
2486	sophcy	http://sweetontology.net/phenCycle/
2487	capes	http://vocab.capes.gov.br/def/vcav#
2488	sorealo	http://sweetontology.net/realmLandOrographic/
2489	sorepsf	http://sweetontology.net/reprSciFunction/
2490	sopropdife	http://sweetontology.net/propDifference/
2491	sophpc	http://sweetontology.net/phenPlanetClimate/
2492	sopropcat	http://sweetontology.net/propCategorical/
2493	somaio	http://sweetontology.net/matrIon/
2494	sophoc	http://sweetontology.net/phenOceanCoastal/
2495	sopropfu	http://sweetontology.net/propFunction/
2496	sorepmf	http://sweetontology.net/reprMathFunction/
2497	sophen	http://sweetontology.net/phenEnergy/
2498	sophatmo	http://sweetontology.net/phenAtmo/
2499	ccp	http://cookingbigdata.com/linkeddata/ccpricing#
2500	sophhy	http://sweetontology.net/phenHydro/
2501	somaw	http://sweetontology.net/matrWater/
2502	sopropef	http://sweetontology.net/propEnergyFlux/
2503	somaeq	http://sweetontology.net/matrEquipment/
2504	sophsyc	http://sweetontology.net/phenSystemComplexity/
2505	soreps	http://sweetontology.net/reprSpace/
2506	soreptd	http://sweetontology.net/reprTimeDay/
2507	sophei	http://sweetontology.net/phenEnvirImpact/
2508	sophwn	http://sweetontology.net/phenWaveNoise/
2509	cbs	http://betalinkeddata.cbs.nl/def/cbs#
2510	sorepsg3	http://sweetontology.net/reprSpaceGeometry3D/
2511	sopho	http://sweetontology.net/phenOcean/
2512	sophhe	http://sweetontology.net/phenHelio/
2513	sophft	http://sweetontology.net/phenFluidTransport/
2514	trek	https://w3id.org/trek/
2515	sophcm	http://sweetontology.net/phenCycleMaterial/
2516	sophfd	http://sweetontology.net/phenFluidDynamics/
2517	soreal	http://sweetontology.net/realmLandform/
2518	sostb	http://sweetontology.net/stateBiological/
2519	sostrg	http://sweetontology.net/stateRoleGeographic/
2520	sohua	http://sweetontology.net/humanAgriculture/
2521	sophw	http://sweetontology.net/phenWave/
2522	somapa	http://sweetontology.net/matrParticle/
2523	rdb	http://www.dbs.cs.uni-duesseldorf.de/RDF/relational#
2524	sostro	http://sweetontology.net/stateRole/
2525	sophatmops	http://sweetontology.net/phenAtmoPressure/
2526	ciao	http://ciao.it/
2527	ccsla	http://cookingbigdata.com/linkeddata/ccsla#
2528	snomedct	http://purl.bioontology.org/ontology/SNOMEDCT/
2529	soprocw	http://sweetontology.net/procWave/
2530	ldc	https://tac.nist.gov/tracks/SM-KBP/2018/ontologies/SeedlingOntology#
2531	sostdp	http://sweetontology.net/stateDataProcessing/
2532	ordo	http://www.orpha.net/ORDO/
2533	sostf	http://sweetontology.net/stateFluid/
2534	somamic	http://sweetontology.net/matrMicrobiota/
2535	sostre	http://sweetontology.net/stateRealm/
2536	atm	https://data.nasa.gov/ontologies/atmonto/ATM#
2537	sostef	http://sweetontology.net/stateEnergyFlux/
2538	sorepsp	http://sweetontology.net/reprSciProvenance/
2539	ingredient	http://www.owl-ontologies.com/test.owl/ingredient/
2540	sostrb	http://sweetontology.net/stateRoleBiological/
2541	sostrc	http://sweetontology.net/stateRoleChemical/
2542	skosthes	http://purl.org/iso25964/skos-thes#
2543	sohu	http://sweetontology.net/human/
2544	sorealv	http://sweetontology.net/realmLandVolcanic/
2545	ocsw	http://data.diekb.org/def/ocsw#
2546	sorepsmo	http://sweetontology.net/reprSciModel/
2547	sostp	http://sweetontology.net/statePhysical/
2548	soall	http://sweetontology.net/sweetAll/
2549	bldont	http://ont.biglinkeddata.com/
2550	bperson	http://data.vlaanderen.be/ns/persoon#
2551	mbkeys	https://pastebin.com/ThBfphb8#
2552	pnv	https://w3id.org/pnv#
2553	beo	http://pi.pauwel.be/voc/buildingelement#
2554	sostss	http://sweetontology.net/stateSpaceScale/
2555	idsc	https://w3id.org/idsa/code/
2556	sostsb	http://sweetontology.net/stateSpectralBand/
2557	matvoc	http://stream-ontology.com/matvoc/
2558	sohuea	http://sweetontology.net/humanEnvirAssessment/
2559	malaka	http://george.gr/
2560	omop	http://api.ohdsi.org/WebAPI/vocabulary/concept/
2561	lprov	http://id.learning-provider.data.ac.uk/terms#
2562	lv2	http://lv2plug.in/ns/lv2core/
2563	mmms	http://ldf.fi/schema/mmm/
2564	gleio	http://lei.info/gleio/
2565	sorealf	http://sweetontology.net/realmLandFluvial/
2566	soreaer	http://sweetontology.net/realmEarthReference/
2567	esbici	http://vocab.ciudadesabiertas.es/def/transporte/bicicleta-publica#
2568	ccr	http://cookingbigdata.com/linkeddata/ccregions#
2569	wds	http://www.wikidata.org/entity/statement/
2570	sorealg	http://sweetontology.net/realmLandGlacial/
2571	ccomid	http://www.ontologyrepository.com/CommonCoreOntologies/Mid/
2572	sophg	http://sweetontology.net/phenGeol/
2573	sophgt	http://sweetontology.net/phenGeolTectonic/
2574	sohud	http://sweetontology.net/humanDecision/
2575	arp	http://www.arpenteur.org/ontology/Arpenteur.owl#
2576	schoi	https://w3id.org/scholarlydata/ontology/indicators-ontology.owl#
2577	soreaab	http://sweetontology.net/realmAstroBody/
2578	sorealt	http://sweetontology.net/realmLandTectonic/
2579	hdgi	https://w3id.org/hdgi#
2580	sostsp	http://sweetontology.net/stateSpace/
2581	she	http://shacleditor.org/
2582	biogrid	http://thebiogrid.org/
2583	ggbn	http://data.ggbn.org/schemas/ggbn/terms/
2584	sostsc	http://sweetontology.net/stateSpaceConfiguration/
2585	sostsl	http://sweetontology.net/stateSpectralLine/
2586	sophgf	http://sweetontology.net/phenGeolFault/
2587	sophgg	http://sweetontology.net/phenGeolGeomorphology/
2588	sohuc	http://sweetontology.net/humanCommerce/
2589	soreala	http://sweetontology.net/realmLandAeolian/
2590	dfcb	http://datafoodconsortium.org/ontologies/DFC_BusinessOntology.owl#
2591	sophgs	http://sweetontology.net/phenGeolSeismicity/
2592	docam	https://www.docam.ca/glossaurus/
2593	sophgv	http://sweetontology.net/phenGeolVolcano/
2594	omim	http://purl.bioontology.org/ontology/OMIM/
2595	compub	https://sireneld.io/vocab/compub#
2596	taxref	http://taxref.mnhn.fr/lod/taxon/
2597	birthdate	http://schema.org/birthDate/
2598	mpg123	https://devuan.net.br/wiki/mpg123/
2599	osmm	https://www.openstreetmap.org/meta/
2600	sorea	http://sweetontology.net/realm/
2601	oplsoft	http://www.openlinksw.com/ontology/software#
2602	country	http://eulersharp.sourceforge.net/2003/03swap/countries#
2603	dfc	http://datafoodconsortium.org/ontologies/DFC_FullModel.owl#
2604	brot	https://w3id.org/brot#
2605	gx	https://graphite.synaptica.net/extension/
2606	rank	http://www.ontotext.com/owlim/RDFRank#
2607	s4city	https://saref.etsi.org/saref4city/
2608	mobiliteit	https://data.vlaanderen.be/ns/mobiliteit#
2609	dd	http://example.org/dummydata/
2610	fernanda	http://fernanda.nl/
2611	wasa	http://vocab.sti2.at/wasa/
2612	say	http://example.org/say/
2613	osmt	https://wiki.openstreetmap.org/wiki/Key:
2614	uimo	http://vocab.sti2.at/uimo/
2615	saref4envi	https://saref.etsi.org/saref4envi/
2616	lib	http://purl.org/library/
2617	wotc	http://purl.org/wot-catalogue#
2618	s4ener	https://saref.etsi.org/saref4ener/
2619	mgv	http://mangaview.fr/mgv#
2620	io	https://iaco.me/
2621	s4agri	https://saref.etsi.org/saref4agri/
2622	osmrel	https://www.openstreetmap.org/relation/
2623	gas	http://www.bigdata.com/rdf/gas#
2624	iaco	https://iaco.me/
2625	asio	http://purl.org/hercules/asio/core#
2626	ld	http://linkeddata.ru/
2627	osmway	https://www.openstreetmap.org/way/
2628	taxrefprop	http://taxref.mnhn.fr/lod/property/
2629	osmnode	https://www.openstreetmap.org/node/
2630	knows	http://semantic.komc/usu/2020/knows#
2631	bs	https://w3id.org/def/basicsemantics-owl#
2632	movieo	http://movie.com/ontology/
2633	lexicog	http://www.w3.org/ns/lemon/lexicog#
2634	cts	http://rdf.cdisc.org/ct/schema#
2635	oplfeat	http://www.openlinksw.com/ontology/features#
2636	dbonto	http://dbepedia.org/ontology/
2637	gco	http://purl.jp/bio/12/glyco/conjugate#
2638	persoon	http://data.vlaanderen.be/ns/persoon#
2639	bao	http://www.bioassayontology.org/bao#
2640	univ	http://univ.io/
2641	pgxo	http://pgxo.loria.fr/
2642	jur	http://sweet.jpl.nasa.gov/2.3/humanJurisdiction.owl#
2643	trak	https://trakmetamodel.sourceforge.io/vocab/rdf-schema.rdf#
2644	srv	http://www.daml.org/services/owl-s/1.2/Service.owl#
2645	hola	https://moodle.insa-lyon.fr/course/view.php?id=
2646	esconv	http://vocab.ciudadesabiertas.es/def/sector-publico/convenio#
2647	rl	http://rl.com/resources/
2648	toaru	https://metadata.moe/toaru-sparql/elements/
2649	mltd	https://mltd.pikopikopla.net/mltd-schema#
2650	kko	http://kbpedia.org/kko/rc/
2651	oco	https://w3id.org/oc/ontology/#
2652	waa	http://purl.oclc.org/NET/WebApiAuthentication#
2653	prismdb	https://prismdb.takanakahiko.me/prism-schema.ttl#
2654	motogp	http://www.motogp.com/
2655	vlueprint	https://vlueprint.org/schema/
2656	ams	http://data.amadeus.com/
2657	estraf	http://vocab.ciudadesabiertas.es/def/transporte/trafico#
2658	ogura	https://sparql.crssnky.xyz/Ogura_Hyakunin_Isshu_LinkedRDF/URIs/Ogura_Hyakunin_Isshu_schema.ttl#
2659	ebg	http://data.businessgraph.io/ontology#
2660	eppo	https://gd.eppo.int/taxon/
2661	esautob	http://vocab.ciudadesabiertas.es/def/transporte/autobus#
2662	maroc	http://fr.dbpedia.org/page/Maroc/
2663	melding	http://lblod.data.gift/vocabularies/automatische-melding/
2664	marcgt	https://id.loc.gov/vocabulary/marcgt/
2665	mr	http://marineregions.org/ns/ontology#
2666	karstlink	https://ontology.uis-speleo.org/ontology/#
2667	fibo	https://spec.edmcouncil.org/fibo/ontology/master/latest/
2668	cso	http://cso.kmi.open.ac.uk/schema/cso/
2669	accid	http://pid.accurids.com/
2670	ibeacon	http://vocab.rapidthings.eu/ns/apple/ibeacon.ttl#
2671	ble	http://vocab.rapidthings.eu/ns/ble.ttl#
2672	ssnx	http://purl.oclc.org/NET/ssnx/ssn#
2674	esempleo	http://vocab.ciudadesabiertas.es/def/sector-publico/empleo#
2675	contry	http://dbpedia.org/resource/Lyon#
2676	contax	https://w3id.org/con-tax#
2677	rdaep	http://rdaregistry.info/termList/RDAExtensionPlan/
2678	i18n	https://www.w3.org/ns/i18n#
2679	mnx	https://rdf.metanetx.org/schema/
2680	la	https://linked.art/ns/terms/
2681	rdaut	http://rdaregistry.info/termList/RDAUnitOfTime/
2682	w3geo	http://www.w3.org/2003/01/geo/wgs84_pos#
2683	fx	http://sparql.xyz/facade-x/ns/
2684	xyz	http://sparql.xyz/facade-x/data/
2685	w3id	https://w3id.org/
2686	gom	https://w3id.org/gom#
2687	bleadapter	http://vocab.rapidthings.eu/ns/ble/adapter.ttl#
2688	bdg	http://data.bigdatagrapes.eu/resource/ontology/
2689	quran	http://khalidaloufi.sa/quran#
2690	cto	https://w3id.org/cto#
2691	tso	https://w3id.org/tso#
2692	kdsf	https://kerndatensatz-forschung.de/version1/technisches_datenmodell/owl/kdsf.owl#
2693	rdamo	http://rdaregistry.info/Elements/m/object/
2694	sty	http://purl.bioontology.org/ontology/STY/
2695	vr	https://www.w3.org/2018/credentials/v1/
2696	rofchrda	http://rdaregistry.info/termList/rofchrda/
2697	rdasource	http://rdaregistry.info/termList/RDARecordingSources/
2698	datagc	https://data.grottocenter.org/ldp/
2699	ldes	http://w3id.org/ldes#
2700	rdan	http://rdaregistry.info/Elements/n/
2701	rdaio	http://rdaregistry.info/Elements/i/object/
2702	rdat	http://rdaregistry.info/Elements/t/
2703	bop	https://w3id.org/bop#
2704	lado	http://archaeology.link/ontology#
2705	rdatb	http://rdaregistry.info/termList/RDATypeOfBinding/
2706	mdcs	https://mdcs.monumentenkennis.nl/damageatlas/ontology#
2707	check	http://pornhub.com/
2708	samian	http://lod.archaeology.link/data/samian/
2709	itops	https://vocab.eccenca.com/itops/
2710	mesh2021	http://id.nlm.nih.gov/mesh/2021/
2711	geodcat	http://data.europa.eu/930/
2712	vph	http://purl.org/ozo/vph.owl#
2713	rdapath	http://rdaregistry.info/termList/RDARecordingMethods/
2714	rpg	http://rpg.data.is4.site/
2715	rdamd	http://rdaregistry.info/Elements/m/datatype/
2716	hops	https://rdf.ag/o/hops#
2717	rdamat	http://rdaregistry.info/termList/RDAMaterial/
2718	rdawd	http://rdaregistry.info/Elements/w/datatype/
2719	rdaxd	http://rdaregistry.info/Elements/x/datatype/
2720	rdand	http://rdaregistry.info/Elements/n/datatype/
2721	smithy	https://awslabs.github.io/smithy/rdf-1.0#
2722	cerealstoo	http://rdf.ag/o/cerealstoo#
2723	oeso	http://www.opensilex.org/vocabularies/oeso#
2724	rdaao	http://rdaregistry.info/Elements/a/object/
2725	rdaeo	http://rdaregistry.info/Elements/e/object/
2726	ogham	http://lod.ogham.link/data/
2727	sou	http://qudt.org/vocab/sou/
2728	rdatd	http://rdaregistry.info/Elements/t/datatype/
2729	dom	https://html.spec.whatwg.org/#
2730	freq	http://purl.org/cld/freq/
2731	rdano	http://rdaregistry.info/Elements/n/object/
2732	rdaed	http://rdaregistry.info/Elements/e/datatype/
2733	rdapol	http://rdaregistry.info/termList/RDAPolarity/
2734	oghamonto	http://ontology.ogham.link/
2735	rdaid	http://rdaregistry.info/Elements/i/datatype/
2736	rdawo	http://rdaregistry.info/Elements/w/object/
2737	rdap	http://rdaregistry.info/Elements/p/
2738	rofitrda	http://rdaregistry.info/termList/rofitrda/
2739	rdasca	http://rdaregistry.info/termList/scale/
2740	rdato	http://rdaregistry.info/Elements/t/object/
2741	rdapd	http://rdaregistry.info/Elements/p/datatype/
2742	rdaxo	http://rdaregistry.info/Elements/x/object/
2743	rdaim	http://rdaregistry.info/termList/RDAInteractivityMode/
2744	rdatask	http://rdaregistry.info/termList/RDATasks/
2745	matrycs	http://matrycs.com/
2746	epcis	https://ns.gs1.org/epcis/
2747	roffgrda	http://rdaregistry.info/termList/roffgrda/
2748	signify	http://purl.org/signify/ns#
2749	slm	http://urn.fi/URN:NBN:fi:au:slm:
2750	srr	https://w3id.org/srr#
2751	rofsfrda	http://rdaregistry.info/termList/rofsfrda/
2752	bag2	http://bag.basisregistraties.overheid.nl/def/bag#
2753	citedcat	https://w3id.org/citedcat-ap/
2754	textgrid	https://textgridrep.org/
2755	cbv	https://ns.gs1.org/cbv/
2756	cinema	http://www.semanticweb.org/julien/morgann/cinema#
2757	m8g	http://data.europa.eu/m8g/
2758	kpd	http://purl.org/kpd/
2759	luigiusai	https://www.luigiusai.it/wp#
2760	seasd	https://w3id.org/seas/
2761	encargado	http://semRAT.edu/
2762	faas	http://semantic-faas.com/ontology#
2763	uberon	http://purl.obolibrary.org/obo/UBERON_
2764	ofn	http://www.ontotext.com/sparql/functions/
2765	nprl	http://data.nobelprize.org/resource/laureate/
2766	idpo	https://w3id.org/idpo#
2767	cpg	http://modellingdh.github.io/ont/odp/pgc/
2768	bcom	https://w3id.org/bcom#
2769	folio	http://IBCNServices.github.io/Folio-Ontology/Folio.owl#
2770	bcfowl	http://lbd.arch.rwth-aachen.de/bcfOWL#
2771	tci	https://w3id.org/lbs/tci#
2772	mrk	http://www.mydomain.org/Mrk-ns#
2773	paf	https://paf.link/
2774	mag	https://makg.org/property/
2775	nsd	https://w3id.org/nsd#
2776	interop	http://www.w3.org/ns/solid/interop#
2777	ghga	http://w3id.org/ghga/
2778	gax	http://w3id.org/gaia-x/core#
2779	nanopub	http://www.nanopub.org/nschema#
2780	ewg	http://ethoinformatics.org/
2781	ppeer	http://parliament.uk/ontologies/peerage/
2782	lsqr	http://lsq.aksw.org/
2783	memorix	https://memorix.io/ontology#
2784	arena	http://arena2036.example.org/
2785	comp	http://semweb.mmlab.be/ns/rml-compression#
2786	mrt	http://marineregions.org/ns/placetypes#
2787	rmlt	http://semweb.mmlab.be/ns/rml-target#
2788	setl	http://purl.org/twc/vocab/setl/
2789	ea	http://eaontology.protect.linkeddata.es/def/
2790	hqdmontol	http://www.semanticweb.org/magma-core/ontologies/hqdm#
2791	magmardl	http://www.semanticweb.org/magma-core/rdl#
2792	magmauser	http://www.semanticweb.org/magma-core/user#
2793	hqdm	http://www.semanticweb.org/hqdm#
2794	poke	https://pokemonkg.org/ontology#
2795	ldpsc	https://solid.ti.rw.fau.de/public/ns/stream-containers#
2796	lds	https://solid.ti.rw.fau.de/public/ns/linked-data-structures#
2797	ch	https://schema.ld.admin.ch/
2798	wdno	http://www.wikidata.org/prop/novalue/
2799	srmo	https://w3id.org/srmo#
2800	biocrm	http://ldf.fi/schema/bioc/
2801	s223	http://data.ashrae.org/standard223#
2802	cpc	https://data.epo.org/linked-data/def/cpc/
\.


--
-- Data for Name: schemata; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schemata (id, display_name, db_schema_name, description, endpoint_id, is_active, is_default_for_endpoint, order_inx, tags) FROM stdin;
\.


--
-- Data for Name: schemata_tags; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schemata_tags (id, name, display_name, description, is_active) FROM stdin;
3	lod24	lod24	LOD schema examples	t
\.


--
-- Data for Name: tree_profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tree_profiles (id, profile_name, data, is_default) FROM stdin;
1	default	{"ns": [], "schema": "any"}	t
2	dbpedia	{"ns": [{"name": "dbo", "type": "in", "caption": "Only from dbo:", "checked": true}, {"name": "yago", "type": "notIn", "caption": "Exclude yago:", "checked": false}], "schema": "dbpedia"}	f
3	dbpediaL	{"ns": [{"name": "dbo", "type": "in", "caption": "Only from dbo:", "checked": false}, {"name": "yago", "type": "notIn", "caption": "Exclude yago:", "checked": false}], "schema": "any"}	f
4	basic	{"ns": [{"type": "in", "caption": "Only local classes", "checked": true, "isLocal": true}], "schema": "any"}	f
\.


--
-- Name: endpoints_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.endpoints_id_seq', 1, false);


--
-- Name: ns_prefixes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.ns_prefixes_id_seq', 2802, true);


--
-- Name: schemata_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.schemata_id_seq', 1, false);


--
-- Name: schemata_tags_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.schemata_tags_id_seq', 3, true);


--
-- Name: tree_profile_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tree_profile_id_seq', 4, true);


--
-- Name: endpoints endpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.endpoints
    ADD CONSTRAINT endpoints_pkey PRIMARY KEY (id);


--
-- Name: ns_prefixes ns_prefixes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ns_prefixes
    ADD CONSTRAINT ns_prefixes_pkey PRIMARY KEY (id);


--
-- Name: schemata schemata_display_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schemata
    ADD CONSTRAINT schemata_display_name_unique UNIQUE (display_name);


--
-- Name: schemata schemata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schemata
    ADD CONSTRAINT schemata_pkey PRIMARY KEY (id);


--
-- Name: schemata_tags schemata_tags_display_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schemata_tags
    ADD CONSTRAINT schemata_tags_display_name_unique UNIQUE (display_name);


--
-- Name: schemata_tags schemata_tags_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schemata_tags
    ADD CONSTRAINT schemata_tags_name_unique UNIQUE (name);


--
-- Name: schemata_tags schemata_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schemata_tags
    ADD CONSTRAINT schemata_tags_pkey PRIMARY KEY (id);


--
-- Name: tree_profiles tree_profile_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tree_profiles
    ADD CONSTRAINT tree_profile_pkey PRIMARY KEY (id);


--
-- Name: tree_profiles tree_profiles_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tree_profiles
    ADD CONSTRAINT tree_profiles_name_unique UNIQUE (profile_name);


--
-- Name: idx_endpoints_url_graph; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_endpoints_url_graph ON public.endpoints USING btree (COALESCE(sparql_url, '@@'::text), COALESCE(named_graph, '@@'::text));


--
-- Name: schemata schemata_endpoint_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schemata
    ADD CONSTRAINT schemata_endpoint_fk FOREIGN KEY (endpoint_id) REFERENCES public.endpoints(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

