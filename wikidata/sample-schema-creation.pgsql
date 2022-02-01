--
-- PostgreSQL database dump
--

-- Dumped from database version 12.6 (Ubuntu 12.6-1.pgdg18.04+1)
-- Dumped by pg_dump version 12.6 (Ubuntu 12.6-1.pgdg18.04+1)

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

--
-- Name: sample; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA sample;


ALTER SCHEMA sample OWNER TO postgres;

--
-- Name: SCHEMA sample; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA sample IS 'empty schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: annot_types; Type: TABLE; Schema: sample; Owner: postgres
--

CREATE TABLE sample.annot_types (
    id integer NOT NULL,
    iri text NOT NULL,
    ns_id integer,
    local_name text
);


ALTER TABLE sample.annot_types OWNER TO postgres;

--
-- Name: annot_types_id_seq; Type: SEQUENCE; Schema: sample; Owner: postgres
--

CREATE SEQUENCE sample.annot_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE sample.annot_types_id_seq OWNER TO postgres;

--
-- Name: annot_types_id_seq; Type: SEQUENCE OWNED BY; Schema: sample; Owner: postgres
--

ALTER SEQUENCE sample.annot_types_id_seq OWNED BY sample.annot_types.id;


--
-- Name: classes; Type: TABLE; Schema: sample; Owner: postgres
--

CREATE TABLE sample.classes (
    id integer NOT NULL,
    iri text NOT NULL,
    cnt integer,
    data jsonb,
    props_in_schema boolean DEFAULT false NOT NULL,
    ns_id integer,
    local_name text,
    display_name text,
    indirect_members boolean DEFAULT false NOT NULL,
    is_unique boolean DEFAULT false NOT NULL,
    subclasses integer
);


ALTER TABLE sample.classes OWNER TO postgres;

--
-- Name: cp_rels; Type: TABLE; Schema: sample; Owner: postgres
--

CREATE TABLE sample.cp_rels (
    id integer NOT NULL,
    class_id integer NOT NULL,
    property_id integer NOT NULL,
    type_id integer NOT NULL,
    cnt bigint,
    data jsonb,
    object_cnt integer,
    data_cnt integer GENERATED ALWAYS AS ((cnt - object_cnt)) STORED,
    max_cardinality integer,
    min_cardinality integer,
    cover_set_index integer,
    add_link_slots integer DEFAULT 1 NOT NULL,
    details_level integer DEFAULT 0 NOT NULL,
    sub_cover_complete boolean DEFAULT false NOT NULL
);


ALTER TABLE sample.cp_rels OWNER TO postgres;

--
-- Name: properties; Type: TABLE; Schema: sample; Owner: postgres
--

CREATE TABLE sample.properties (
    id integer NOT NULL,
    iri text NOT NULL,
    cnt integer,
    data jsonb,
    ns_id integer,
    display_name text,
    local_name text,
    is_unique boolean DEFAULT false NOT NULL,
    object_cnt integer,
    data_cnt integer GENERATED ALWAYS AS ((cnt - object_cnt)) STORED,
    max_cardinality integer,
    inverse_max_cardinality integer,
    source_cover_complete boolean DEFAULT false NOT NULL,
    target_cover_complete boolean DEFAULT false NOT NULL
);


ALTER TABLE sample.properties OWNER TO postgres;

--
-- Name: c_links; Type: VIEW; Schema: sample; Owner: postgres
--

CREATE VIEW sample.c_links AS
 SELECT c1.id AS c1_id,
    p.id AS p_id,
    c2.id AS c2_id
   FROM ((((sample.classes c1
     JOIN sample.cp_rels cp1 ON ((c1.id = cp1.class_id)))
     JOIN sample.properties p ON ((cp1.property_id = p.id)))
     JOIN sample.cp_rels cp2 ON ((cp2.property_id = p.id)))
     JOIN sample.classes c2 ON ((c2.id = cp2.class_id)))
  WHERE ((cp1.type_id = 1) AND (cp2.type_id = 2));


ALTER TABLE sample.c_links OWNER TO postgres;

--
-- Name: cc_rel_types; Type: TABLE; Schema: sample; Owner: postgres
--

CREATE TABLE sample.cc_rel_types (
    id integer NOT NULL,
    name text
);


ALTER TABLE sample.cc_rel_types OWNER TO postgres;

--
-- Name: cc_rel_types_id_seq; Type: SEQUENCE; Schema: sample; Owner: postgres
--

CREATE SEQUENCE sample.cc_rel_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE sample.cc_rel_types_id_seq OWNER TO postgres;

--
-- Name: cc_rel_types_id_seq; Type: SEQUENCE OWNED BY; Schema: sample; Owner: postgres
--

ALTER SEQUENCE sample.cc_rel_types_id_seq OWNED BY sample.cc_rel_types.id;


--
-- Name: cc_rels; Type: TABLE; Schema: sample; Owner: postgres
--

CREATE TABLE sample.cc_rels (
    id integer NOT NULL,
    class_1_id integer NOT NULL,
    class_2_id integer NOT NULL,
    type_id integer NOT NULL,
    cnt bigint,
    data jsonb
);


ALTER TABLE sample.cc_rels OWNER TO postgres;

--
-- Name: cc_rels_id_seq; Type: SEQUENCE; Schema: sample; Owner: postgres
--

CREATE SEQUENCE sample.cc_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE sample.cc_rels_id_seq OWNER TO postgres;

--
-- Name: cc_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: sample; Owner: postgres
--

ALTER SEQUENCE sample.cc_rels_id_seq OWNED BY sample.cc_rels.id;


--
-- Name: class_annots; Type: TABLE; Schema: sample; Owner: postgres
--

CREATE TABLE sample.class_annots (
    id integer NOT NULL,
    class_id integer NOT NULL,
    type_id integer NOT NULL,
    annotation text NOT NULL,
    language_code text DEFAULT 'en'::text NOT NULL
);


ALTER TABLE sample.class_annots OWNER TO postgres;

--
-- Name: class_annots_id_seq; Type: SEQUENCE; Schema: sample; Owner: postgres
--

CREATE SEQUENCE sample.class_annots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE sample.class_annots_id_seq OWNER TO postgres;

--
-- Name: class_annots_id_seq; Type: SEQUENCE OWNED BY; Schema: sample; Owner: postgres
--

ALTER SEQUENCE sample.class_annots_id_seq OWNED BY sample.class_annots.id;


--
-- Name: classes_id_seq; Type: SEQUENCE; Schema: sample; Owner: postgres
--

CREATE SEQUENCE sample.classes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE sample.classes_id_seq OWNER TO postgres;

--
-- Name: classes_id_seq; Type: SEQUENCE OWNED BY; Schema: sample; Owner: postgres
--

ALTER SEQUENCE sample.classes_id_seq OWNED BY sample.classes.id;


--
-- Name: cp_rel_types; Type: TABLE; Schema: sample; Owner: postgres
--

CREATE TABLE sample.cp_rel_types (
    id integer NOT NULL,
    name text
);


ALTER TABLE sample.cp_rel_types OWNER TO postgres;

--
-- Name: cp_rel_types_id_seq; Type: SEQUENCE; Schema: sample; Owner: postgres
--

CREATE SEQUENCE sample.cp_rel_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE sample.cp_rel_types_id_seq OWNER TO postgres;

--
-- Name: cp_rel_types_id_seq; Type: SEQUENCE OWNED BY; Schema: sample; Owner: postgres
--

ALTER SEQUENCE sample.cp_rel_types_id_seq OWNED BY sample.cp_rel_types.id;


--
-- Name: cp_rels_id_seq; Type: SEQUENCE; Schema: sample; Owner: postgres
--

CREATE SEQUENCE sample.cp_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE sample.cp_rels_id_seq OWNER TO postgres;

--
-- Name: cp_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: sample; Owner: postgres
--

ALTER SEQUENCE sample.cp_rels_id_seq OWNED BY sample.cp_rels.id;


--
-- Name: cpc_rels; Type: TABLE; Schema: sample; Owner: postgres
--

CREATE TABLE sample.cpc_rels (
    id integer NOT NULL,
    cp_rel_id integer NOT NULL,
    other_class_id integer NOT NULL,
    cnt integer,
    data jsonb,
    cover_set_index integer
);


ALTER TABLE sample.cpc_rels OWNER TO postgres;

--
-- Name: cpc_rels_id_seq; Type: SEQUENCE; Schema: sample; Owner: postgres
--

CREATE SEQUENCE sample.cpc_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE sample.cpc_rels_id_seq OWNER TO postgres;

--
-- Name: cpc_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: sample; Owner: postgres
--

ALTER SEQUENCE sample.cpc_rels_id_seq OWNED BY sample.cpc_rels.id;


--
-- Name: cpd_rels; Type: TABLE; Schema: sample; Owner: postgres
--

CREATE TABLE sample.cpd_rels (
    id integer NOT NULL,
    cp_rel_id integer NOT NULL,
    datatype_id integer NOT NULL,
    cnt integer,
    data jsonb
);


ALTER TABLE sample.cpd_rels OWNER TO postgres;

--
-- Name: cpd_rels_id_seq; Type: SEQUENCE; Schema: sample; Owner: postgres
--

CREATE SEQUENCE sample.cpd_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE sample.cpd_rels_id_seq OWNER TO postgres;

--
-- Name: cpd_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: sample; Owner: postgres
--

ALTER SEQUENCE sample.cpd_rels_id_seq OWNED BY sample.cpd_rels.id;


--
-- Name: datatypes; Type: TABLE; Schema: sample; Owner: postgres
--

CREATE TABLE sample.datatypes (
    id integer NOT NULL,
    iri text NOT NULL,
    ns_id integer,
    local_name text
);


ALTER TABLE sample.datatypes OWNER TO postgres;

--
-- Name: datatypes_id_seq; Type: SEQUENCE; Schema: sample; Owner: postgres
--

CREATE SEQUENCE sample.datatypes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE sample.datatypes_id_seq OWNER TO postgres;

--
-- Name: datatypes_id_seq; Type: SEQUENCE OWNED BY; Schema: sample; Owner: postgres
--

ALTER SEQUENCE sample.datatypes_id_seq OWNED BY sample.datatypes.id;


--
-- Name: ns; Type: TABLE; Schema: sample; Owner: postgres
--

CREATE TABLE sample.ns (
    id integer NOT NULL,
    name text NOT NULL,
    value text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    is_local boolean DEFAULT false NOT NULL
);


ALTER TABLE sample.ns OWNER TO postgres;

--
-- Name: pd_rels; Type: TABLE; Schema: sample; Owner: postgres
--

CREATE TABLE sample.pd_rels (
    id integer NOT NULL,
    property_id integer NOT NULL,
    datatype_id integer NOT NULL,
    cnt integer,
    data jsonb
);


ALTER TABLE sample.pd_rels OWNER TO postgres;

--
-- Name: pd_rels_id_seq; Type: SEQUENCE; Schema: sample; Owner: postgres
--

CREATE SEQUENCE sample.pd_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE sample.pd_rels_id_seq OWNER TO postgres;

--
-- Name: pd_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: sample; Owner: postgres
--

ALTER SEQUENCE sample.pd_rels_id_seq OWNED BY sample.pd_rels.id;


--
-- Name: pp_rel_types; Type: TABLE; Schema: sample; Owner: postgres
--

CREATE TABLE sample.pp_rel_types (
    id integer NOT NULL,
    name text
);


ALTER TABLE sample.pp_rel_types OWNER TO postgres;

--
-- Name: pp_rel_types_id_seq; Type: SEQUENCE; Schema: sample; Owner: postgres
--

CREATE SEQUENCE sample.pp_rel_types_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE sample.pp_rel_types_id_seq OWNER TO postgres;

--
-- Name: pp_rel_types_id_seq; Type: SEQUENCE OWNED BY; Schema: sample; Owner: postgres
--

ALTER SEQUENCE sample.pp_rel_types_id_seq OWNED BY sample.pp_rel_types.id;


--
-- Name: pp_rels; Type: TABLE; Schema: sample; Owner: postgres
--

CREATE TABLE sample.pp_rels (
    id integer NOT NULL,
    property_1_id integer NOT NULL,
    property_2_id integer NOT NULL,
    type_id integer NOT NULL,
    cnt bigint,
    data jsonb
);


ALTER TABLE sample.pp_rels OWNER TO postgres;

--
-- Name: pp_rels_id_seq; Type: SEQUENCE; Schema: sample; Owner: postgres
--

CREATE SEQUENCE sample.pp_rels_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE sample.pp_rels_id_seq OWNER TO postgres;

--
-- Name: pp_rels_id_seq; Type: SEQUENCE OWNED BY; Schema: sample; Owner: postgres
--

ALTER SEQUENCE sample.pp_rels_id_seq OWNED BY sample.pp_rels.id;


--
-- Name: prefixes_id_seq; Type: SEQUENCE; Schema: sample; Owner: postgres
--

CREATE SEQUENCE sample.prefixes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE sample.prefixes_id_seq OWNER TO postgres;

--
-- Name: prefixes_id_seq; Type: SEQUENCE OWNED BY; Schema: sample; Owner: postgres
--

ALTER SEQUENCE sample.prefixes_id_seq OWNED BY sample.ns.id;


--
-- Name: properties_id_seq; Type: SEQUENCE; Schema: sample; Owner: postgres
--

CREATE SEQUENCE sample.properties_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE sample.properties_id_seq OWNER TO postgres;

--
-- Name: properties_id_seq; Type: SEQUENCE OWNED BY; Schema: sample; Owner: postgres
--

ALTER SEQUENCE sample.properties_id_seq OWNED BY sample.properties.id;


--
-- Name: property_annots; Type: TABLE; Schema: sample; Owner: postgres
--

CREATE TABLE sample.property_annots (
    id integer NOT NULL,
    property_id integer NOT NULL,
    type_id integer NOT NULL,
    annotation text NOT NULL,
    language_code text DEFAULT 'en'::text NOT NULL
);


ALTER TABLE sample.property_annots OWNER TO postgres;

--
-- Name: property_annots_id_seq; Type: SEQUENCE; Schema: sample; Owner: postgres
--

CREATE SEQUENCE sample.property_annots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE sample.property_annots_id_seq OWNER TO postgres;

--
-- Name: property_annots_id_seq; Type: SEQUENCE OWNED BY; Schema: sample; Owner: postgres
--

ALTER SEQUENCE sample.property_annots_id_seq OWNED BY sample.property_annots.id;


--
-- Name: annot_types id; Type: DEFAULT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.annot_types ALTER COLUMN id SET DEFAULT nextval('sample.annot_types_id_seq'::regclass);


--
-- Name: cc_rel_types id; Type: DEFAULT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cc_rel_types ALTER COLUMN id SET DEFAULT nextval('sample.cc_rel_types_id_seq'::regclass);


--
-- Name: cc_rels id; Type: DEFAULT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cc_rels ALTER COLUMN id SET DEFAULT nextval('sample.cc_rels_id_seq'::regclass);


--
-- Name: class_annots id; Type: DEFAULT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.class_annots ALTER COLUMN id SET DEFAULT nextval('sample.class_annots_id_seq'::regclass);


--
-- Name: classes id; Type: DEFAULT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.classes ALTER COLUMN id SET DEFAULT nextval('sample.classes_id_seq'::regclass);


--
-- Name: cp_rel_types id; Type: DEFAULT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cp_rel_types ALTER COLUMN id SET DEFAULT nextval('sample.cp_rel_types_id_seq'::regclass);


--
-- Name: cp_rels id; Type: DEFAULT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cp_rels ALTER COLUMN id SET DEFAULT nextval('sample.cp_rels_id_seq'::regclass);


--
-- Name: cpc_rels id; Type: DEFAULT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cpc_rels ALTER COLUMN id SET DEFAULT nextval('sample.cpc_rels_id_seq'::regclass);


--
-- Name: cpd_rels id; Type: DEFAULT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cpd_rels ALTER COLUMN id SET DEFAULT nextval('sample.cpd_rels_id_seq'::regclass);


--
-- Name: datatypes id; Type: DEFAULT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.datatypes ALTER COLUMN id SET DEFAULT nextval('sample.datatypes_id_seq'::regclass);


--
-- Name: ns id; Type: DEFAULT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.ns ALTER COLUMN id SET DEFAULT nextval('sample.prefixes_id_seq'::regclass);


--
-- Name: pd_rels id; Type: DEFAULT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.pd_rels ALTER COLUMN id SET DEFAULT nextval('sample.pd_rels_id_seq'::regclass);


--
-- Name: pp_rel_types id; Type: DEFAULT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.pp_rel_types ALTER COLUMN id SET DEFAULT nextval('sample.pp_rel_types_id_seq'::regclass);


--
-- Name: pp_rels id; Type: DEFAULT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.pp_rels ALTER COLUMN id SET DEFAULT nextval('sample.pp_rels_id_seq'::regclass);


--
-- Name: properties id; Type: DEFAULT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.properties ALTER COLUMN id SET DEFAULT nextval('sample.properties_id_seq'::regclass);


--
-- Name: property_annots id; Type: DEFAULT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.property_annots ALTER COLUMN id SET DEFAULT nextval('sample.property_annots_id_seq'::regclass);


--
-- Data for Name: annot_types; Type: TABLE DATA; Schema: sample; Owner: postgres
--

COPY sample.annot_types (id, iri, ns_id, local_name) FROM stdin;
1	http://www.w3.org/2000/01/rdf-schema#label	8	label
2	http://www.w3.org/2000/01/rdf-schema#comment	8	comment
\.


--
-- Data for Name: cc_rel_types; Type: TABLE DATA; Schema: sample; Owner: postgres
--

COPY sample.cc_rel_types (id, name) FROM stdin;
1	sub_class_of
2	equivalent_class
\.


--
-- Data for Name: cc_rels; Type: TABLE DATA; Schema: sample; Owner: postgres
--

COPY sample.cc_rels (id, class_1_id, class_2_id, type_id, cnt, data) FROM stdin;
\.


--
-- Data for Name: class_annots; Type: TABLE DATA; Schema: sample; Owner: postgres
--

COPY sample.class_annots (id, class_id, type_id, annotation, language_code) FROM stdin;
\.


--
-- Data for Name: classes; Type: TABLE DATA; Schema: sample; Owner: postgres
--

COPY sample.classes (id, iri, cnt, data, props_in_schema, ns_id, local_name, display_name, indirect_members, is_unique) FROM stdin;
\.


--
-- Data for Name: cp_rel_types; Type: TABLE DATA; Schema: sample; Owner: postgres
--

COPY sample.cp_rel_types (id, name) FROM stdin;
1	incoming
2	outgoing
\.


--
-- Data for Name: cp_rels; Type: TABLE DATA; Schema: sample; Owner: postgres
--

COPY sample.cp_rels (id, class_id, property_id, type_id, cnt, data, object_cnt, max_cardinality, min_cardinality, cover_set_index, add_link_slots, details_level, sub_cover_complete) FROM stdin;
\.


--
-- Data for Name: cpc_rels; Type: TABLE DATA; Schema: sample; Owner: postgres
--

COPY sample.cpc_rels (id, cp_rel_id, other_class_id, cnt, data, cover_set_index) FROM stdin;
\.


--
-- Data for Name: cpd_rels; Type: TABLE DATA; Schema: sample; Owner: postgres
--

COPY sample.cpd_rels (id, cp_rel_id, datatype_id, cnt, data) FROM stdin;
\.


--
-- Data for Name: datatypes; Type: TABLE DATA; Schema: sample; Owner: postgres
--

COPY sample.datatypes (id, iri, ns_id, local_name) FROM stdin;
\.


--
-- Data for Name: ns; Type: TABLE DATA; Schema: sample; Owner: postgres
--

COPY sample.ns (id, name, value, priority, is_local) FROM stdin;
2	dbp	http://dbpedia.org/property/	0	f
3	dbr	http://dbpedia.org/resource/	0	f
4	dbt	http://dbpedia.org/resource/Template:	0	f
5	dbc	http://dbpedia.org/resource/Category:	0	f
7	rdf	http://www.w3.org/1999/02/22-rdf-syntax-ns#	0	f
8	rdfs	http://www.w3.org/2000/01/rdf-schema#	0	f
10	sh	http://www.w3.org/ns/shacl#	0	f
11	shsh	http://www.w3.org/ns/shacl-shacl#	0	f
12	skos	http://www.w3.org/2004/02/skos/core#	0	f
14	xsd	http://www.w3.org/2001/XMLSchema#	0	f
16	owl	http://www.w3.org/2002/07/owl#	0	f
19	virtrdf	http://www.openlinksw.com/schemas/virtrdf#	0	f
20	dct	http://purl.org/dc/terms/	0	f
21	dc	http://purl.org/dc/elements/1.1/	0	f
1	dbo	http://dbpedia.org/ontology/	100	f
6	foaf	http://xmlns.com/foaf/0.1/	80	f
9	schema	http://schema.org/	70	f
15	yago	http://dbpedia.org/class/yago/	90	f
17	umbel-rc	http://umbel.org/umbel/rc/	40	f
18	dul	http://www.ontologydesignpatterns.org/ont/dul/DUL.owl	60	f
13	wd	http://www.wikidata.org/entity/	-1	f
23	vann	http://purl.org/vocab/vann/	0	f
24	geo	http://www.w3.org/2003/01/geo/wgs84_pos#	0	f
25	prov	http://www.w3.org/ns/prov#	0	f
26	voaf	 http://purl.org/vocommons/voaf#	0	f
27	sd	http://www.w3.org/ns/sparql-service-description#	0	f
28	frbr	http://vocab.org/frbr/core#	0	f
29	georss	http://www.georss.org/georss/	0	f
30	gold	http://purl.org/linguistics/gold/	0	f
31	rdrel	http://rdvocab.info/RDARelationshipsWEMI/	0	f
32	bibo	http://purl.org/ontology/bibo/	0	f
22	umbel	http://umbel.org/umbel#	0	f
33	cc	http://creativecommons.org/ns#	0	f
34	dav	http://www.openlinksw.com/schemas/DAV#	0	f
35  bd http://www.bigdata.com/rdf#  0   f
36  geo http://www.opengis.net/ont/geosparql#  0   f
37  ontolex http://www.w3.org/ns/lemon/ontolex#  0   f
38  p http://www.wikidata.org/prop/  0   f
39  pq http://www.wikidata.org/prop/qualifier/  0   f
40  pqn http://www.wikidata.org/prop/qualifier/value-normalized/  0   f
41  pqv http://www.wikidata.org/prop/qualifier/value/  0   f
42  pr http://www.wikidata.org/prop/reference/  0   f
43  prn http://www.wikidata.org/prop/reference/value-normalized/  0   f
44  prov http://www.w3.org/ns/prov#  0   f
45  prv http://www.wikidata.org/prop/reference/value/  0   f
46  ps http://www.wikidata.org/prop/statement/  0   f
47  psn http://www.wikidata.org/prop/statement/value-normalized/  0   f
48  psv http://www.wikidata.org/prop/statement/value/  0   f
49  wdata http://www.wikidata.org/wiki/Special:EntityData/  0   f
50  wdno http://www.wikidata.org/prop/novalue/  0   f
51  wdref http://www.wikidata.org/reference/  0   f
52  wds http://www.wikidata.org/entity/statement/  0   f
53  wdt http://www.wikidata.org/prop/direct/  0   f
54  wdtn http://www.wikidata.org/prop/direct-normalized/  0   f
55  wdv http://www.wikidata.org/value/  0   f
56  wikibase http://wikiba.se/ontology#  0   f
\.


--
-- Data for Name: pd_rels; Type: TABLE DATA; Schema: sample; Owner: postgres
--

COPY sample.pd_rels (id, property_id, datatype_id, cnt, data) FROM stdin;
\.


--
-- Data for Name: pp_rel_types; Type: TABLE DATA; Schema: sample; Owner: postgres
--

COPY sample.pp_rel_types (id, name) FROM stdin;
1	followed_by
2	common_subject
3	common_object
4	sub_property_of
\.


--
-- Data for Name: pp_rels; Type: TABLE DATA; Schema: sample; Owner: postgres
--

COPY sample.pp_rels (id, property_1_id, property_2_id, type_id, cnt, data) FROM stdin;
\.


--
-- Data for Name: properties; Type: TABLE DATA; Schema: sample; Owner: postgres
--

COPY sample.properties (id, iri, cnt, data, ns_id, display_name, local_name, is_unique, object_cnt, max_cardinality, inverse_max_cardinality, source_cover_complete, target_cover_complete) FROM stdin;
\.


--
-- Data for Name: property_annots; Type: TABLE DATA; Schema: sample; Owner: postgres
--

COPY sample.property_annots (id, property_id, type_id, annotation, language_code) FROM stdin;
\.


--
-- Name: annot_types_id_seq; Type: SEQUENCE SET; Schema: sample; Owner: postgres
--

SELECT pg_catalog.setval('sample.annot_types_id_seq', 1, false);


--
-- Name: cc_rel_types_id_seq; Type: SEQUENCE SET; Schema: sample; Owner: postgres
--

SELECT pg_catalog.setval('sample.cc_rel_types_id_seq', 2, true);


--
-- Name: cc_rels_id_seq; Type: SEQUENCE SET; Schema: sample; Owner: postgres
--

SELECT pg_catalog.setval('sample.cc_rels_id_seq', 1, false);


--
-- Name: class_annots_id_seq; Type: SEQUENCE SET; Schema: sample; Owner: postgres
--

SELECT pg_catalog.setval('sample.class_annots_id_seq', 1, false);


--
-- Name: classes_id_seq; Type: SEQUENCE SET; Schema: sample; Owner: postgres
--

SELECT pg_catalog.setval('sample.classes_id_seq', 1, false);


--
-- Name: cp_rel_types_id_seq; Type: SEQUENCE SET; Schema: sample; Owner: postgres
--

SELECT pg_catalog.setval('sample.cp_rel_types_id_seq', 1, false);


--
-- Name: cp_rels_id_seq; Type: SEQUENCE SET; Schema: sample; Owner: postgres
--

SELECT pg_catalog.setval('sample.cp_rels_id_seq', 1, false);


--
-- Name: cpc_rels_id_seq; Type: SEQUENCE SET; Schema: sample; Owner: postgres
--

SELECT pg_catalog.setval('sample.cpc_rels_id_seq', 1, false);


--
-- Name: cpd_rels_id_seq; Type: SEQUENCE SET; Schema: sample; Owner: postgres
--

SELECT pg_catalog.setval('sample.cpd_rels_id_seq', 1, false);


--
-- Name: datatypes_id_seq; Type: SEQUENCE SET; Schema: sample; Owner: postgres
--

SELECT pg_catalog.setval('sample.datatypes_id_seq', 1, false);


--
-- Name: pd_rels_id_seq; Type: SEQUENCE SET; Schema: sample; Owner: postgres
--

SELECT pg_catalog.setval('sample.pd_rels_id_seq', 1, false);


--
-- Name: pp_rel_types_id_seq; Type: SEQUENCE SET; Schema: sample; Owner: postgres
--

SELECT pg_catalog.setval('sample.pp_rel_types_id_seq', 1, true);


--
-- Name: pp_rels_id_seq; Type: SEQUENCE SET; Schema: sample; Owner: postgres
--

SELECT pg_catalog.setval('sample.pp_rels_id_seq', 1, false);


--
-- Name: prefixes_id_seq; Type: SEQUENCE SET; Schema: sample; Owner: postgres
--

SELECT pg_catalog.setval('sample.prefixes_id_seq', 34, true);


--
-- Name: properties_id_seq; Type: SEQUENCE SET; Schema: sample; Owner: postgres
--

SELECT pg_catalog.setval('sample.properties_id_seq', 1, false);


--
-- Name: property_annots_id_seq; Type: SEQUENCE SET; Schema: sample; Owner: postgres
--

SELECT pg_catalog.setval('sample.property_annots_id_seq', 1, false);


--
-- Name: annot_types annot_types_pkey; Type: CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.annot_types
    ADD CONSTRAINT annot_types_pkey PRIMARY KEY (id);


--
-- Name: cc_rel_types cc_rel_types_pkey; Type: CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cc_rel_types
    ADD CONSTRAINT cc_rel_types_pkey PRIMARY KEY (id);


--
-- Name: cc_rels cc_rels_pkey; Type: CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cc_rels
    ADD CONSTRAINT cc_rels_pkey PRIMARY KEY (id);


--
-- Name: class_annots class_annots_pkey; Type: CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.class_annots
    ADD CONSTRAINT class_annots_pkey PRIMARY KEY (id);


--
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- Name: cp_rel_types cp_rel_types_pkey; Type: CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cp_rel_types
    ADD CONSTRAINT cp_rel_types_pkey PRIMARY KEY (id);


--
-- Name: cp_rels cp_rels_pkey; Type: CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cp_rels
    ADD CONSTRAINT cp_rels_pkey PRIMARY KEY (id);


--
-- Name: cpc_rels cpc_rels_pkey; Type: CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cpc_rels
    ADD CONSTRAINT cpc_rels_pkey PRIMARY KEY (id);


--
-- Name: cpd_rels cpd_rels_pkey; Type: CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cpd_rels
    ADD CONSTRAINT cpd_rels_pkey PRIMARY KEY (id);


--
-- Name: datatypes datatypes_pkey; Type: CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.datatypes
    ADD CONSTRAINT datatypes_pkey PRIMARY KEY (id);


--
-- Name: ns ns_name_unique; Type: CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.ns
    ADD CONSTRAINT ns_name_unique UNIQUE (name);


--
-- Name: pd_rels pd_rels_pkey; Type: CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.pd_rels
    ADD CONSTRAINT pd_rels_pkey PRIMARY KEY (id);


--
-- Name: pp_rel_types pp_rel_types_pkey; Type: CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.pp_rel_types
    ADD CONSTRAINT pp_rel_types_pkey PRIMARY KEY (id);


--
-- Name: pp_rels pp_rels_pkey; Type: CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.pp_rels
    ADD CONSTRAINT pp_rels_pkey PRIMARY KEY (id);


--
-- Name: ns prefixes_pkey; Type: CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.ns
    ADD CONSTRAINT prefixes_pkey PRIMARY KEY (id);


--
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- Name: property_annots property_annots_pkey; Type: CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.property_annots
    ADD CONSTRAINT property_annots_pkey PRIMARY KEY (id);


--
-- Name: fki_annot_types_ns_fk; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX fki_annot_types_ns_fk ON sample.annot_types USING btree (ns_id);


--
-- Name: fki_cc_rels_class_1_fk; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX fki_cc_rels_class_1_fk ON sample.cc_rels USING btree (class_1_id);


--
-- Name: fki_cc_rels_class_2_fk; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX fki_cc_rels_class_2_fk ON sample.cc_rels USING btree (class_2_id);


--
-- Name: fki_cc_rels_type_fk; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX fki_cc_rels_type_fk ON sample.cc_rels USING btree (type_id);


--
-- Name: fki_class_annots_class_fk; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX fki_class_annots_class_fk ON sample.class_annots USING btree (class_id);


--
-- Name: fki_classes_ns_fk; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX fki_classes_ns_fk ON sample.classes USING btree (ns_id);


--
-- Name: fki_cp_rels_class_fk; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX fki_cp_rels_class_fk ON sample.cp_rels USING btree (class_id);


--
-- Name: fki_cp_rels_property_fk; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX fki_cp_rels_property_fk ON sample.cp_rels USING btree (property_id);


--
-- Name: fki_cp_rels_type_fk; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX fki_cp_rels_type_fk ON sample.cp_rels USING btree (type_id);


--
-- Name: fki_datatypes_ns_fk; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX fki_datatypes_ns_fk ON sample.datatypes USING btree (ns_id);


--
-- Name: fki_pp_rels_property_1_fk; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX fki_pp_rels_property_1_fk ON sample.pp_rels USING btree (property_1_id);


--
-- Name: fki_pp_rels_property_2_fk; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX fki_pp_rels_property_2_fk ON sample.pp_rels USING btree (property_2_id);


--
-- Name: fki_pp_rels_type_fk; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX fki_pp_rels_type_fk ON sample.pp_rels USING btree (type_id);


--
-- Name: fki_properties_ns_fk; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX fki_properties_ns_fk ON sample.properties USING btree (ns_id);


--
-- Name: fki_property_annots_class_fk; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX fki_property_annots_class_fk ON sample.property_annots USING btree (property_id);


--
-- Name: idx_cc_rels_data; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX idx_cc_rels_data ON sample.cc_rels USING gin (data);


--
-- Name: idx_classes_cnt; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX idx_classes_cnt ON sample.classes USING btree (cnt);


--
-- Name: idx_classes_data; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX idx_classes_data ON sample.classes USING gin (data);


--
-- Name: idx_classes_iri; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX idx_classes_iri ON sample.classes USING btree (iri);


--
-- Name: idx_cp_rels_data; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX idx_cp_rels_data ON sample.cp_rels USING gin (data);


--
-- Name: idx_pp_rels_data; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX idx_pp_rels_data ON sample.pp_rels USING gin (data);


--
-- Name: idx_properties_cnt; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX idx_properties_cnt ON sample.properties USING btree (cnt);


--
-- Name: idx_properties_data; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX idx_properties_data ON sample.properties USING gin (data);


--
-- Name: idx_properties_iri; Type: INDEX; Schema: sample; Owner: postgres
--

CREATE INDEX idx_properties_iri ON sample.properties USING btree (iri);


--
-- Name: annot_types annot_types_ns_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.annot_types
    ADD CONSTRAINT annot_types_ns_fk FOREIGN KEY (ns_id) REFERENCES sample.ns(id) ON DELETE SET NULL NOT VALID;


--
-- Name: cc_rels cc_rels_class_1_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cc_rels
    ADD CONSTRAINT cc_rels_class_1_fk FOREIGN KEY (class_1_id) REFERENCES sample.classes(id) ON DELETE CASCADE;


--
-- Name: cc_rels cc_rels_class_2_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cc_rels
    ADD CONSTRAINT cc_rels_class_2_fk FOREIGN KEY (class_2_id) REFERENCES sample.classes(id) ON DELETE CASCADE;


--
-- Name: cc_rels cc_rels_type_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cc_rels
    ADD CONSTRAINT cc_rels_type_fk FOREIGN KEY (type_id) REFERENCES sample.cc_rel_types(id) ON DELETE CASCADE;


--
-- Name: class_annots class_annots_class_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.class_annots
    ADD CONSTRAINT class_annots_class_fk FOREIGN KEY (class_id) REFERENCES sample.classes(id) ON DELETE CASCADE NOT VALID;


--
-- Name: class_annots class_annots_type_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.class_annots
    ADD CONSTRAINT class_annots_type_fk FOREIGN KEY (type_id) REFERENCES sample.annot_types(id) ON DELETE CASCADE NOT VALID;


--
-- Name: classes classes_ns_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.classes
    ADD CONSTRAINT classes_ns_fk FOREIGN KEY (ns_id) REFERENCES sample.ns(id) ON DELETE SET NULL NOT VALID;


--
-- Name: cp_rels cp_rels_class_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cp_rels
    ADD CONSTRAINT cp_rels_class_fk FOREIGN KEY (class_id) REFERENCES sample.classes(id) ON DELETE CASCADE NOT VALID;


--
-- Name: cp_rels cp_rels_property_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cp_rels
    ADD CONSTRAINT cp_rels_property_fk FOREIGN KEY (property_id) REFERENCES sample.properties(id) ON DELETE CASCADE NOT VALID;


--
-- Name: cp_rels cp_rels_type_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cp_rels
    ADD CONSTRAINT cp_rels_type_fk FOREIGN KEY (type_id) REFERENCES sample.cp_rel_types(id) NOT VALID;


--
-- Name: cpc_rels cpc_rels_cp_rel_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cpc_rels
    ADD CONSTRAINT cpc_rels_cp_rel_fk FOREIGN KEY (cp_rel_id) REFERENCES sample.cp_rels(id) ON DELETE CASCADE;


--
-- Name: cpc_rels cpc_rels_other_class_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cpc_rels
    ADD CONSTRAINT cpc_rels_other_class_fk FOREIGN KEY (other_class_id) REFERENCES sample.classes(id) ON DELETE CASCADE;


--
-- Name: cpd_rels cpd_rels_cp_rel_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cpd_rels
    ADD CONSTRAINT cpd_rels_cp_rel_fk FOREIGN KEY (cp_rel_id) REFERENCES sample.cp_rels(id) ON DELETE CASCADE;


--
-- Name: cpd_rels cpd_rels_datatype_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.cpd_rels
    ADD CONSTRAINT cpd_rels_datatype_fk FOREIGN KEY (datatype_id) REFERENCES sample.datatypes(id) ON DELETE CASCADE;


--
-- Name: datatypes datatypes_ns_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.datatypes
    ADD CONSTRAINT datatypes_ns_fk FOREIGN KEY (ns_id) REFERENCES sample.ns(id) ON DELETE SET NULL NOT VALID;


--
-- Name: pd_rels pd_rels_datatype_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.pd_rels
    ADD CONSTRAINT pd_rels_datatype_fk FOREIGN KEY (datatype_id) REFERENCES sample.datatypes(id) ON DELETE CASCADE;


--
-- Name: pd_rels pd_rels_property_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.pd_rels
    ADD CONSTRAINT pd_rels_property_fk FOREIGN KEY (property_id) REFERENCES sample.properties(id) ON DELETE CASCADE;


--
-- Name: pp_rels pp_rels_property_1_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.pp_rels
    ADD CONSTRAINT pp_rels_property_1_fk FOREIGN KEY (property_1_id) REFERENCES sample.properties(id) ON DELETE CASCADE NOT VALID;


--
-- Name: pp_rels pp_rels_property_2_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.pp_rels
    ADD CONSTRAINT pp_rels_property_2_fk FOREIGN KEY (property_2_id) REFERENCES sample.properties(id) ON DELETE CASCADE NOT VALID;


--
-- Name: pp_rels pp_rels_type_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.pp_rels
    ADD CONSTRAINT pp_rels_type_fk FOREIGN KEY (type_id) REFERENCES sample.pp_rel_types(id) NOT VALID;


--
-- Name: properties properties_ns_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.properties
    ADD CONSTRAINT properties_ns_fk FOREIGN KEY (ns_id) REFERENCES sample.ns(id) ON DELETE SET NULL NOT VALID;


--
-- Name: property_annots property_annots_property_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.property_annots
    ADD CONSTRAINT property_annots_property_fk FOREIGN KEY (property_id) REFERENCES sample.properties(id) ON DELETE CASCADE;


--
-- Name: property_annots property_annots_type_fk; Type: FK CONSTRAINT; Schema: sample; Owner: postgres
--

ALTER TABLE ONLY sample.property_annots
    ADD CONSTRAINT property_annots_type_fk FOREIGN KEY (type_id) REFERENCES sample.annot_types(id) ON DELETE CASCADE;


--
-- Name: SCHEMA sample; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA sample TO rdf;


--
-- Name: TABLE annot_types; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON TABLE sample.annot_types TO rdf;


--
-- Name: SEQUENCE annot_types_id_seq; Type: ACL; Schema: sample; Owner: postgres
--

GRANT USAGE ON SEQUENCE sample.annot_types_id_seq TO rdf;


--
-- Name: TABLE classes; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON TABLE sample.classes TO rdf;


--
-- Name: TABLE cp_rels; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON TABLE sample.cp_rels TO rdf;


--
-- Name: TABLE properties; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON TABLE sample.properties TO rdf;


--
-- Name: TABLE c_links; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON TABLE sample.c_links TO rdf;


--
-- Name: TABLE cc_rel_types; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON TABLE sample.cc_rel_types TO rdf;


--
-- Name: SEQUENCE cc_rel_types_id_seq; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON SEQUENCE sample.cc_rel_types_id_seq TO rdf;


--
-- Name: TABLE cc_rels; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON TABLE sample.cc_rels TO rdf;


--
-- Name: SEQUENCE cc_rels_id_seq; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON SEQUENCE sample.cc_rels_id_seq TO rdf;


--
-- Name: TABLE class_annots; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON TABLE sample.class_annots TO rdf;


--
-- Name: SEQUENCE class_annots_id_seq; Type: ACL; Schema: sample; Owner: postgres
--

GRANT USAGE ON SEQUENCE sample.class_annots_id_seq TO rdf;


--
-- Name: SEQUENCE classes_id_seq; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON SEQUENCE sample.classes_id_seq TO rdf;


--
-- Name: TABLE cp_rel_types; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON TABLE sample.cp_rel_types TO rdf;


--
-- Name: SEQUENCE cp_rel_types_id_seq; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON SEQUENCE sample.cp_rel_types_id_seq TO rdf;


--
-- Name: SEQUENCE cp_rels_id_seq; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON SEQUENCE sample.cp_rels_id_seq TO rdf;


--
-- Name: TABLE cpc_rels; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON TABLE sample.cpc_rels TO rdf;


--
-- Name: SEQUENCE cpc_rels_id_seq; Type: ACL; Schema: sample; Owner: postgres
--

GRANT USAGE ON SEQUENCE sample.cpc_rels_id_seq TO rdf;


--
-- Name: TABLE cpd_rels; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON TABLE sample.cpd_rels TO rdf;


--
-- Name: SEQUENCE cpd_rels_id_seq; Type: ACL; Schema: sample; Owner: postgres
--

GRANT USAGE ON SEQUENCE sample.cpd_rels_id_seq TO rdf;


--
-- Name: TABLE datatypes; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON TABLE sample.datatypes TO rdf;


--
-- Name: SEQUENCE datatypes_id_seq; Type: ACL; Schema: sample; Owner: postgres
--

GRANT USAGE ON SEQUENCE sample.datatypes_id_seq TO rdf;


--
-- Name: TABLE ns; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON TABLE sample.ns TO rdf;


--
-- Name: TABLE pd_rels; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON TABLE sample.pd_rels TO rdf;


--
-- Name: SEQUENCE pd_rels_id_seq; Type: ACL; Schema: sample; Owner: postgres
--

GRANT USAGE ON SEQUENCE sample.pd_rels_id_seq TO rdf;


--
-- Name: TABLE pp_rel_types; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON TABLE sample.pp_rel_types TO rdf;


--
-- Name: SEQUENCE pp_rel_types_id_seq; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON SEQUENCE sample.pp_rel_types_id_seq TO rdf;


--
-- Name: TABLE pp_rels; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON TABLE sample.pp_rels TO rdf;


--
-- Name: SEQUENCE pp_rels_id_seq; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON SEQUENCE sample.pp_rels_id_seq TO rdf;


--
-- Name: SEQUENCE prefixes_id_seq; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON SEQUENCE sample.prefixes_id_seq TO rdf;


--
-- Name: SEQUENCE properties_id_seq; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON SEQUENCE sample.properties_id_seq TO rdf;


--
-- Name: TABLE property_annots; Type: ACL; Schema: sample; Owner: postgres
--

GRANT ALL ON TABLE sample.property_annots TO rdf;


--
-- Name: SEQUENCE property_annots_id_seq; Type: ACL; Schema: sample; Owner: postgres
--

GRANT USAGE ON SEQUENCE sample.property_annots_id_seq TO rdf;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: sample; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA sample REVOKE ALL ON SEQUENCES  FROM postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA sample GRANT USAGE ON SEQUENCES  TO rdf;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: sample; Owner: rdf
--

ALTER DEFAULT PRIVILEGES FOR ROLE rdf IN SCHEMA sample REVOKE ALL ON TABLES  FROM rdf;
ALTER DEFAULT PRIVILEGES FOR ROLE rdf IN SCHEMA sample GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES  TO rdf;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: sample; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA sample REVOKE ALL ON TABLES  FROM postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA sample GRANT ALL ON TABLES  TO rdf;


--
-- PostgreSQL database dump complete
--

