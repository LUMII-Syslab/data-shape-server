--
-- PostgreSQL database dump
--

-- Dumped from database version 14.5
-- Dumped by pg_dump version 15.0

-- Started on 2024-04-15 12:42:38 EEST

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
-- TOC entry 15 (class 2615 OID 111365)
-- Name: empty; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA empty;


--
-- TOC entry 8100 (class 0 OID 0)
-- Dependencies: 15
-- Name: SCHEMA empty; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA empty IS 'schema for rdf endpoint meta info; v0.1';


--
-- TOC entry 1986 (class 1255 OID 111366)
-- Name: tapprox(integer); Type: FUNCTION; Schema: empty; Owner: -
--

CREATE FUNCTION empty.tapprox(integer) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $_$
select concat(
	case cc when 0 then nn::text else round(ll::decimal,2-lsize)::text end,
case cc when 5 then 'P' when 4 then 'T' when 3 then 'G' 
	   	when 2 then 'M' when 1 then 'K' when 0 then '' else '' end) as ee
from
(select nn, cc, (c-cc*3)::integer as lsize, pp*(pow(10,c-cc*3)::integer) as ll from
(select nn, round((nn/pow(10,c))::decimal,2) as pp, floor(c/3) as cc, c from
(select case $1 when 0 then 0 else floor(log10($1)) end as c, $1 as nn) bb) aa) bb
$_$;


--
-- TOC entry 1987 (class 1255 OID 111367)
-- Name: tapprox(bigint); Type: FUNCTION; Schema: empty; Owner: -
--

CREATE FUNCTION empty.tapprox(bigint) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    AS $_$
select concat(
	case cc when 0 then nn::text else round(ll::decimal,2-lsize)::text end,
case cc when 5 then 'P' when 4 then 'T' when 3 then 'G' 
	   	when 2 then 'M' when 1 then 'K' when 0 then '' else '' end) as ee
from
(select nn, cc, (c-cc*3)::integer as lsize, pp*(pow(10,c-cc*3)::integer) as ll from
(select nn, round((nn/pow(10,c))::decimal,2) as pp, floor(c/3) as cc, c from
(select case $1 when 0 then 0 else floor(log10($1)) end as c, $1 as nn) bb) aa) bb
$_$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 1888 (class 1259 OID 111368)
-- Name: _h_classes; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty._h_classes (
    a integer NOT NULL,
    b integer NOT NULL
);


--
-- TOC entry 8101 (class 0 OID 0)
-- Dependencies: 1888
-- Name: TABLE _h_classes; Type: COMMENT; Schema: empty; Owner: -
--

COMMENT ON TABLE empty._h_classes IS '-- Helper table for large subclass id computation';


--
-- TOC entry 1889 (class 1259 OID 111371)
-- Name: annot_types; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.annot_types (
    id integer NOT NULL,
    iri text NOT NULL,
    ns_id integer,
    local_name text
);


--
-- TOC entry 1890 (class 1259 OID 111376)
-- Name: annot_types_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.annot_types ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.annot_types_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1891 (class 1259 OID 111377)
-- Name: classes; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.classes (
    id integer NOT NULL,
    iri text NOT NULL,
    cnt bigint,
    data jsonb,
    props_in_schema boolean DEFAULT false NOT NULL,
    ns_id integer,
    local_name text,
    display_name text,
    classification_property_id integer,
    classification_property text,
    classification_adornment text,
    is_literal boolean DEFAULT false,
    datatype_id integer,
    instance_name_pattern jsonb,
    indirect_members boolean DEFAULT false NOT NULL,
    is_unique boolean DEFAULT false NOT NULL,
    large_superclass_id integer,
    hide_in_main boolean DEFAULT false,
    principal_super_class_id integer,
    self_cp_rels boolean DEFAULT true,
    cp_ask_endpoint boolean DEFAULT false,
    in_cnt bigint
);


--
-- TOC entry 8102 (class 0 OID 0)
-- Dependencies: 1891
-- Name: COLUMN classes.in_cnt; Type: COMMENT; Schema: empty; Owner: -
--

COMMENT ON COLUMN empty.classes.in_cnt IS 'Incoming link count';


--
-- TOC entry 1892 (class 1259 OID 111389)
-- Name: cp_rels; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.cp_rels (
    id integer NOT NULL,
    class_id integer NOT NULL,
    property_id integer NOT NULL,
    type_id integer NOT NULL,
    cnt bigint,
    data jsonb,
    object_cnt bigint,
    data_cnt_calc bigint GENERATED ALWAYS AS (GREATEST((cnt - object_cnt), (0)::bigint)) STORED,
    max_cardinality bigint,
    min_cardinality bigint,
    cover_set_index integer,
    add_link_slots integer DEFAULT 1 NOT NULL,
    details_level integer DEFAULT 0 NOT NULL,
    sub_cover_complete boolean DEFAULT false NOT NULL,
    data_cnt bigint,
    principal_class_id integer,
    cnt_base bigint
);


--
-- TOC entry 1893 (class 1259 OID 111398)
-- Name: properties; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.properties (
    id integer NOT NULL,
    iri text NOT NULL,
    cnt bigint,
    data jsonb,
    ns_id integer,
    display_name text,
    local_name text,
    is_unique boolean DEFAULT false NOT NULL,
    object_cnt bigint,
    data_cnt_calc bigint GENERATED ALWAYS AS (GREATEST((cnt - object_cnt), (0)::bigint)) STORED,
    max_cardinality bigint,
    inverse_max_cardinality bigint,
    source_cover_complete boolean DEFAULT false NOT NULL,
    target_cover_complete boolean DEFAULT false NOT NULL,
    domain_class_id integer,
    range_class_id integer,
    data_cnt bigint,
    classes_in_schema boolean DEFAULT true NOT NULL,
    is_classifier boolean DEFAULT false,
    use_in_class boolean,
    classif_prefix text,
    values_have_cp boolean,
    props_in_schema boolean DEFAULT true,
    pp_ask_endpoint boolean DEFAULT false,
    pc_ask_endpoint boolean DEFAULT false
);


--
-- TOC entry 1894 (class 1259 OID 111412)
-- Name: c_links; Type: VIEW; Schema: empty; Owner: -
--

CREATE VIEW empty.c_links AS
 SELECT c1.id AS c1_id,
    p.id AS p_id,
    c2.id AS c2_id
   FROM ((((empty.classes c1
     JOIN empty.cp_rels cp1 ON ((c1.id = cp1.class_id)))
     JOIN empty.properties p ON ((cp1.property_id = p.id)))
     JOIN empty.cp_rels cp2 ON ((cp2.property_id = p.id)))
     JOIN empty.classes c2 ON ((c2.id = cp2.class_id)))
  WHERE ((cp1.type_id = 1) AND (cp2.type_id = 2));


--
-- TOC entry 1895 (class 1259 OID 111417)
-- Name: cc_rel_types; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.cc_rel_types (
    id integer NOT NULL,
    name text
);


--
-- TOC entry 1896 (class 1259 OID 111422)
-- Name: cc_rel_types_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.cc_rel_types ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.cc_rel_types_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1897 (class 1259 OID 111423)
-- Name: cc_rels; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.cc_rels (
    id integer NOT NULL,
    class_1_id integer NOT NULL,
    class_2_id integer NOT NULL,
    type_id integer NOT NULL,
    cnt bigint,
    data jsonb
);


--
-- TOC entry 1898 (class 1259 OID 111428)
-- Name: cc_rels_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.cc_rels ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.cc_rels_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1899 (class 1259 OID 111429)
-- Name: class_annots; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.class_annots (
    id integer NOT NULL,
    class_id integer NOT NULL,
    type_id integer NOT NULL,
    annotation text NOT NULL,
    language_code text DEFAULT 'en'::text
);


--
-- TOC entry 1900 (class 1259 OID 111435)
-- Name: class_annots_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.class_annots ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.class_annots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1901 (class 1259 OID 111436)
-- Name: classes_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.classes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.classes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1902 (class 1259 OID 111437)
-- Name: cp_rel_types; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.cp_rel_types (
    id integer NOT NULL,
    name text
);


--
-- TOC entry 1903 (class 1259 OID 111442)
-- Name: cp_rel_types_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.cp_rel_types ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.cp_rel_types_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1904 (class 1259 OID 111443)
-- Name: cp_rels_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.cp_rels ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.cp_rels_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1905 (class 1259 OID 111444)
-- Name: cpc_rels; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.cpc_rels (
    id integer NOT NULL,
    cp_rel_id integer NOT NULL,
    other_class_id integer NOT NULL,
    cnt bigint,
    data jsonb,
    cover_set_index integer,
    cnt_base bigint
);


--
-- TOC entry 1906 (class 1259 OID 111449)
-- Name: cpc_rels_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.cpc_rels ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.cpc_rels_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1907 (class 1259 OID 111450)
-- Name: cpd_rels; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.cpd_rels (
    id integer NOT NULL,
    cp_rel_id integer NOT NULL,
    datatype_id integer NOT NULL,
    cnt bigint,
    data jsonb,
    cnt_base bigint
);


--
-- TOC entry 1908 (class 1259 OID 111455)
-- Name: cpd_rels_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.cpd_rels ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.cpd_rels_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1909 (class 1259 OID 111456)
-- Name: datatypes; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.datatypes (
    id integer NOT NULL,
    iri text NOT NULL,
    ns_id integer,
    local_name text
);


--
-- TOC entry 1910 (class 1259 OID 111461)
-- Name: datatypes_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.datatypes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.datatypes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1911 (class 1259 OID 111462)
-- Name: instances; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.instances (
    id integer NOT NULL,
    iri text NOT NULL,
    ns_id integer,
    local_name text,
    local_name_lowercase text,
    class_id integer,
    class_iri text,
    test tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, local_name)) STORED
);


--
-- TOC entry 1912 (class 1259 OID 111468)
-- Name: instances_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.instances ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.instances_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1913 (class 1259 OID 111469)
-- Name: ns; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.ns (
    id integer NOT NULL,
    name text NOT NULL,
    value text NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    is_local boolean DEFAULT false NOT NULL,
    basic_order_level integer DEFAULT 0 NOT NULL
);


--
-- TOC entry 1914 (class 1259 OID 111477)
-- Name: ns_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.ns ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.ns_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1915 (class 1259 OID 111478)
-- Name: parameters; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.parameters (
    order_inx numeric DEFAULT 999 NOT NULL,
    name text NOT NULL,
    textvalue text,
    jsonvalue jsonb,
    comment text,
    id integer NOT NULL
);


--
-- TOC entry 1916 (class 1259 OID 111484)
-- Name: parameters_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.parameters ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.parameters_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1917 (class 1259 OID 111485)
-- Name: pd_rels; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.pd_rels (
    id integer NOT NULL,
    property_id integer NOT NULL,
    datatype_id integer NOT NULL,
    cnt bigint,
    data jsonb,
    cnt_base bigint
);


--
-- TOC entry 1918 (class 1259 OID 111490)
-- Name: pd_rels_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.pd_rels ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.pd_rels_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1919 (class 1259 OID 111491)
-- Name: pp_rel_types; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.pp_rel_types (
    id integer NOT NULL,
    name text
);


--
-- TOC entry 1920 (class 1259 OID 111496)
-- Name: pp_rel_types_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.pp_rel_types ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.pp_rel_types_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1921 (class 1259 OID 111497)
-- Name: pp_rels; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.pp_rels (
    id integer NOT NULL,
    property_1_id integer NOT NULL,
    property_2_id integer NOT NULL,
    type_id integer NOT NULL,
    cnt bigint,
    data jsonb,
    cnt_base bigint
);


--
-- TOC entry 1922 (class 1259 OID 111502)
-- Name: pp_rels_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.pp_rels ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.pp_rels_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1923 (class 1259 OID 111503)
-- Name: properties_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.properties ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.properties_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1924 (class 1259 OID 111504)
-- Name: property_annots; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.property_annots (
    id integer NOT NULL,
    property_id integer NOT NULL,
    type_id integer NOT NULL,
    annotation text NOT NULL,
    language_code text DEFAULT 'en'::text
);


--
-- TOC entry 1925 (class 1259 OID 111510)
-- Name: property_annots_id_seq; Type: SEQUENCE; Schema: empty; Owner: -
--

ALTER TABLE empty.property_annots ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME empty.property_annots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- TOC entry 1926 (class 1259 OID 111511)
-- Name: v_cc_rels; Type: VIEW; Schema: empty; Owner: -
--

CREATE VIEW empty.v_cc_rels AS
 SELECT r.id,
    r.class_1_id,
    r.class_2_id,
    r.type_id,
    r.cnt,
    r.data,
    c1.iri AS iri1,
    c1.classification_property AS cprop1,
    c2.iri AS iri2,
    c2.classification_property AS cprop2
   FROM empty.cc_rels r,
    empty.classes c1,
    empty.classes c2
  WHERE ((r.class_1_id = c1.id) AND (r.class_2_id = c2.id));


--
-- TOC entry 1927 (class 1259 OID 111515)
-- Name: v_classes_ns; Type: VIEW; Schema: empty; Owner: -
--

CREATE VIEW empty.v_classes_ns AS
 SELECT c.id,
    c.iri,
    c.cnt,
    c.ns_id,
    n.name AS prefix,
    c.props_in_schema,
    c.local_name,
    c.display_name,
    c.classification_property_id,
    c.classification_property,
    c.classification_adornment,
    c.is_literal,
    c.datatype_id,
    c.instance_name_pattern,
    c.indirect_members,
    c.is_unique,
    concat(n.name, ',', c.local_name, ',', c.classification_adornment, ',', c.display_name, ',', lower(c.display_name)) AS namestring,
    empty.tapprox(c.cnt) AS cnt_x,
    n.is_local,
    c.large_superclass_id,
    c.hide_in_main,
    c.principal_super_class_id,
    c.self_cp_rels,
    c.cp_ask_endpoint,
    c.in_cnt
   FROM (empty.classes c
     LEFT JOIN empty.ns n ON ((c.ns_id = n.id)));


--
-- TOC entry 1928 (class 1259 OID 111520)
-- Name: v_classes_ns_main; Type: VIEW; Schema: empty; Owner: -
--

CREATE VIEW empty.v_classes_ns_main AS
 SELECT v.id,
    v.iri,
    v.cnt,
    v.ns_id,
    v.prefix,
    v.props_in_schema,
    v.local_name,
    v.display_name,
    v.classification_property_id,
    v.classification_property,
    v.classification_adornment,
    v.is_literal,
    v.datatype_id,
    v.instance_name_pattern,
    v.indirect_members,
    v.is_unique,
    v.namestring,
    v.cnt_x,
    v.is_local,
    v.large_superclass_id,
    v.hide_in_main,
    v.principal_super_class_id,
    v.self_cp_rels,
    v.cp_ask_endpoint,
    v.in_cnt
   FROM empty.v_classes_ns v
  WHERE (NOT (EXISTS ( SELECT cc_rels.id
           FROM empty.cc_rels
          WHERE ((cc_rels.class_1_id = v.id) AND (cc_rels.type_id = 2)))));


--
-- TOC entry 1929 (class 1259 OID 111525)
-- Name: v_classes_ns_plus; Type: VIEW; Schema: empty; Owner: -
--

CREATE VIEW empty.v_classes_ns_plus AS
 SELECT c.id,
    c.iri,
    c.cnt,
    c.ns_id,
    n.name AS prefix,
    c.props_in_schema,
    c.local_name,
    c.display_name,
    c.classification_property_id,
    c.classification_property,
    c.classification_adornment,
    c.is_literal,
    c.datatype_id,
    c.instance_name_pattern,
    c.indirect_members,
    c.is_unique,
    concat(n.name, ',', c.local_name, ',', c.display_name, ',', lower(c.display_name)) AS namestring,
    empty.tapprox(c.cnt) AS cnt_x,
    n.is_local,
        CASE
            WHEN (EXISTS ( SELECT cc_rels.class_1_id
               FROM empty.cc_rels
              WHERE (cc_rels.class_2_id = c.id))) THEN 1
            ELSE 0
        END AS has_subclasses,
    c.large_superclass_id,
    c.hide_in_main,
    c.principal_super_class_id,
    c.self_cp_rels,
    c.cp_ask_endpoint,
    c.in_cnt
   FROM (empty.classes c
     LEFT JOIN empty.ns n ON ((c.ns_id = n.id)));


--
-- TOC entry 1930 (class 1259 OID 111530)
-- Name: v_classes_ns_main_plus; Type: VIEW; Schema: empty; Owner: -
--

CREATE VIEW empty.v_classes_ns_main_plus AS
 SELECT v.id,
    v.iri,
    v.cnt,
    v.ns_id,
    v.prefix,
    v.props_in_schema,
    v.local_name,
    v.display_name,
    v.classification_property_id,
    v.classification_property,
    v.classification_adornment,
    v.is_literal,
    v.datatype_id,
    v.instance_name_pattern,
    v.indirect_members,
    v.is_unique,
    v.namestring,
    v.cnt_x,
    v.is_local,
    v.has_subclasses,
    v.large_superclass_id,
    v.hide_in_main,
    v.principal_super_class_id,
    v.self_cp_rels,
    v.cp_ask_endpoint,
    v.in_cnt
   FROM empty.v_classes_ns_plus v
  WHERE (NOT (EXISTS ( SELECT r.id,
            r.class_1_id,
            r.class_2_id,
            r.type_id,
            r.cnt,
            r.data
           FROM empty.cc_rels r
          WHERE ((r.class_1_id = v.id) AND (r.type_id = 2)))));


--
-- TOC entry 1931 (class 1259 OID 111535)
-- Name: v_classes_ns_main_v01; Type: VIEW; Schema: empty; Owner: -
--

CREATE VIEW empty.v_classes_ns_main_v01 AS
 SELECT v.id,
    v.iri,
    v.cnt,
    v.ns_id,
    v.prefix,
    v.props_in_schema,
    v.local_name,
    v.display_name,
    v.classification_property_id,
    v.classification_property,
    v.classification_adornment,
    v.is_literal,
    v.datatype_id,
    v.instance_name_pattern,
    v.indirect_members,
    v.is_unique,
    v.namestring,
    v.cnt_x,
    v.is_local,
    v.in_cnt
   FROM (empty.v_classes_ns v
     LEFT JOIN empty.cc_rels r ON (((r.class_1_id = v.id) AND (r.type_id = 2))))
  WHERE (r.class_2_id IS NULL);


--
-- TOC entry 1932 (class 1259 OID 111540)
-- Name: v_cp_rels; Type: VIEW; Schema: empty; Owner: -
--

CREATE VIEW empty.v_cp_rels AS
 SELECT r.id,
    r.class_id,
    r.property_id,
    r.type_id,
    r.cnt,
    r.data,
    r.object_cnt,
    r.data_cnt_calc AS data_cnt,
    r.max_cardinality,
    r.min_cardinality,
    r.cover_set_index,
    r.add_link_slots,
    r.details_level,
    r.sub_cover_complete,
    empty.tapprox((r.cnt)::integer) AS cnt_x,
    empty.tapprox(r.object_cnt) AS object_cnt_x,
    empty.tapprox(r.data_cnt_calc) AS data_cnt_x,
    r.cnt_base,
        CASE
            WHEN (COALESCE(r.cnt_base, (0)::bigint) = 0) THEN r.cnt
            ELSE ((((r.cnt / r.cnt_base) * c.cnt))::integer)::bigint
        END AS cnt_estimate,
    c.iri AS class_iri,
    c.classification_property_id AS class_cprop_id,
    c.classification_property AS class_cprop,
    c.is_literal AS class_is_literal,
    c.datatype_id AS cname_datatype_id,
    p.iri AS property_iri
   FROM empty.cp_rels r,
    empty.classes c,
    empty.properties p
  WHERE ((r.class_id = c.id) AND (r.property_id = p.id));


--
-- TOC entry 1933 (class 1259 OID 111545)
-- Name: v_cp_rels_card; Type: VIEW; Schema: empty; Owner: -
--

CREATE VIEW empty.v_cp_rels_card AS
 SELECT r.id,
    r.class_id,
    r.property_id,
    r.type_id,
    r.cnt,
    r.data,
    r.object_cnt,
    r.data_cnt_calc,
    r.max_cardinality,
    r.min_cardinality,
    r.cover_set_index,
    r.add_link_slots,
    r.details_level,
    r.sub_cover_complete,
    r.data_cnt,
    COALESCE(r.max_cardinality,
        CASE r.type_id
            WHEN 2 THEN p.max_cardinality
            ELSE p.inverse_max_cardinality
        END, '-1'::bigint) AS x_max_cardinality,
    r.principal_class_id
   FROM empty.cp_rels r,
    empty.properties p
  WHERE (r.property_id = p.id);


--
-- TOC entry 1934 (class 1259 OID 111550)
-- Name: v_properties_ns; Type: VIEW; Schema: empty; Owner: -
--

CREATE VIEW empty.v_properties_ns AS
 SELECT p.id,
    p.iri,
    p.cnt,
    p.ns_id,
    n.name AS prefix,
    p.display_name,
    p.local_name,
    p.is_unique,
    p.object_cnt,
    p.data_cnt_calc AS data_cnt,
    p.source_cover_complete,
    p.target_cover_complete,
    concat(n.name, ',', p.local_name, ',', p.display_name, ',', lower(p.display_name)) AS namestring,
    empty.tapprox(p.cnt) AS cnt_x,
    empty.tapprox(p.object_cnt) AS object_cnt_x,
    empty.tapprox(p.data_cnt_calc) AS data_cnt_x,
    n.is_local,
    p.domain_class_id,
    p.range_class_id,
    p.classes_in_schema,
    p.is_classifier,
    p.use_in_class,
    p.classif_prefix,
    p.values_have_cp,
    p.props_in_schema,
    p.pp_ask_endpoint,
    p.pc_ask_endpoint,
    n.basic_order_level,
        CASE
            WHEN (p.max_cardinality IS NOT NULL) THEN p.max_cardinality
            ELSE '-1'::bigint
        END AS max_cardinality,
        CASE
            WHEN (p.inverse_max_cardinality IS NOT NULL) THEN p.inverse_max_cardinality
            ELSE '-1'::bigint
        END AS inverse_max_cardinality
   FROM (empty.properties p
     LEFT JOIN empty.ns n ON ((p.ns_id = n.id)));


--
-- TOC entry 1935 (class 1259 OID 111555)
-- Name: v_cp_sources_single; Type: VIEW; Schema: empty; Owner: -
--

CREATE VIEW empty.v_cp_sources_single AS
 SELECT r.class_id,
    v.id,
    v.iri,
    r.cnt,
    v.ns_id,
    v.prefix,
    v.display_name,
    v.local_name,
    v.is_unique,
    r.object_cnt AS o,
    v.namestring,
    v.is_local,
    c.iri AS class_iri,
    c.prefix AS class_prefix,
    c.display_name AS class_display_name,
    c.local_name AS class_local_name,
    c.classification_property_id AS class_cprop_id,
    c.classification_property AS class_cprop,
    c.is_literal AS class_is_literal,
    c.datatype_id AS cname_datatype_id,
    c.is_unique AS class_is_unique,
    c.namestring AS class_namestring,
    1 AS local_priority,
    c.is_local AS class_is_local,
    v.basic_order_level,
    r.x_max_cardinality
   FROM ((empty.v_cp_rels_card r
     JOIN empty.v_properties_ns v ON ((r.property_id = v.id)))
     LEFT JOIN empty.v_classes_ns c ON ((COALESCE(r.principal_class_id, v.domain_class_id) = c.id)))
  WHERE (r.type_id = 1);


--
-- TOC entry 1936 (class 1259 OID 111560)
-- Name: v_cp_targets_single; Type: VIEW; Schema: empty; Owner: -
--

CREATE VIEW empty.v_cp_targets_single AS
 SELECT r.class_id,
    v.id,
    v.iri,
    r.cnt,
    v.ns_id,
    v.prefix,
    v.display_name,
    v.local_name,
    v.is_unique,
    r.object_cnt AS o,
    v.namestring,
    v.is_local,
    c.iri AS class_iri,
    c.prefix AS class_prefix,
    c.display_name AS class_display_name,
    c.local_name AS class_local_name,
    c.classification_property_id AS class_cprop_id,
    c.classification_property AS class_cprop,
    c.is_literal AS class_is_literal,
    c.datatype_id AS cname_datatype_id,
    c.is_unique AS class_is_unique,
    c.namestring AS class_namestring,
    1 AS local_priority,
    c.is_local AS class_is_local,
    v.basic_order_level,
    r.x_max_cardinality
   FROM ((empty.v_cp_rels_card r
     JOIN empty.v_properties_ns v ON ((r.property_id = v.id)))
     LEFT JOIN empty.v_classes_ns c ON ((COALESCE(r.principal_class_id, v.range_class_id) = c.id)))
  WHERE (r.type_id = 2);


--
-- TOC entry 1937 (class 1259 OID 111565)
-- Name: v_pp_rels_names; Type: VIEW; Schema: empty; Owner: -
--

CREATE VIEW empty.v_pp_rels_names AS
 SELECT r.id,
    r.property_1_id,
    r.property_2_id,
    r.type_id,
    r.cnt,
    r.data,
    p1.iri AS iri1,
    p2.iri AS iri2,
    empty.tapprox((r.cnt)::integer) AS cnt_x
   FROM empty.pp_rels r,
    empty.properties p1,
    empty.properties p2
  WHERE ((r.property_1_id = p1.id) AND (r.property_2_id = p2.id));


--
-- TOC entry 1938 (class 1259 OID 111569)
-- Name: v_properties_sources; Type: VIEW; Schema: empty; Owner: -
--

CREATE VIEW empty.v_properties_sources AS
 SELECT v.id,
    v.iri,
    v.cnt,
    v.ns_id,
    v.prefix,
    v.display_name,
    v.local_name,
    v.is_unique,
    v.object_cnt,
    v.data_cnt,
    v.source_cover_complete,
    v.target_cover_complete,
    v.namestring,
    v.cnt_x,
    v.object_cnt_x,
    v.data_cnt_x,
    v.is_local,
    c.iri AS class_iri,
    c.prefix AS class_prefix,
    c.display_name AS class_display_name,
    c.local_name AS class_local_name,
    c.classification_property_id AS base_class_cprop_id,
    c.classification_property AS base_class_cprop,
    c.classification_adornment AS base_class_adornment,
    c.is_literal AS base_class_is_literal,
    c.datatype_id AS base_cname_datatype_id,
    c.is_unique AS class_is_unique,
    c.namestring AS class_namestring,
    1 AS local_priority,
    c.is_local AS class_is_local,
    v.basic_order_level,
    v.max_cardinality,
    v.inverse_max_cardinality
   FROM (empty.v_properties_ns v
     LEFT JOIN ( SELECT r.id,
            r.property_id,
            r.cover_set_index,
            r.add_link_slots,
            c_1.id AS id_1,
            c_1.iri,
            c_1.ns_id,
            c_1.prefix,
            c_1.local_name,
            c_1.display_name,
            c_1.classification_property_id,
            c_1.classification_property,
            c_1.classification_adornment,
            c_1.is_literal,
            c_1.datatype_id,
            c_1.indirect_members,
            c_1.is_unique,
            c_1.namestring,
            c_1.is_local
           FROM empty.cp_rels r,
            empty.v_classes_ns c_1
          WHERE ((r.class_id = c_1.id) AND (r.type_id = 2))) c ON (((v.id = c.property_id) AND (c.cover_set_index > 0) AND (v.target_cover_complete = true))));


--
-- TOC entry 1939 (class 1259 OID 111574)
-- Name: v_properties_sources_single; Type: VIEW; Schema: empty; Owner: -
--

CREATE VIEW empty.v_properties_sources_single AS
 SELECT v.id,
    v.iri,
    v.cnt,
    v.ns_id,
    v.prefix,
    v.display_name,
    v.local_name,
    v.is_unique,
    v.object_cnt,
    v.data_cnt,
    v.source_cover_complete,
    v.target_cover_complete,
    v.namestring,
    v.cnt_x,
    v.object_cnt_x,
    v.data_cnt_x,
    v.is_local,
    c.iri AS class_iri,
    c.prefix AS class_prefix,
    c.display_name AS class_display_name,
    c.local_name AS class_local_name,
    c.classification_property_id AS class_cprop_id,
    c.classification_property AS class_cprop,
    c.classification_adornment AS class_adornment,
    c.is_literal AS class_is_literal,
    c.datatype_id AS cname_datatype_id,
    c.is_unique AS class_is_unique,
    c.namestring AS class_namestring,
    1 AS local_priority,
    c.is_local AS class_is_local,
    v.basic_order_level,
    v.max_cardinality,
    v.inverse_max_cardinality
   FROM (empty.v_properties_ns v
     LEFT JOIN empty.v_classes_ns c ON ((v.domain_class_id = c.id)));


--
-- TOC entry 1940 (class 1259 OID 111579)
-- Name: v_properties_targets; Type: VIEW; Schema: empty; Owner: -
--

CREATE VIEW empty.v_properties_targets AS
 SELECT v.id,
    v.iri,
    v.cnt,
    v.ns_id,
    v.prefix,
    v.display_name,
    v.local_name,
    v.is_unique,
    v.object_cnt,
    v.data_cnt,
    v.source_cover_complete,
    v.target_cover_complete,
    v.namestring,
    v.cnt_x,
    v.object_cnt_x,
    v.data_cnt_x,
    v.is_local,
    c.iri AS class_iri,
    c.prefix AS class_prefix,
    c.display_name AS class_display_name,
    c.local_name AS class_local_name,
    c.classification_property_id AS base_class_cprop_id,
    c.classification_property AS base_class_cprop,
    c.classification_adornment AS base_class_adornment,
    c.is_literal AS base_class_is_literal,
    c.datatype_id AS base_cname_datatype_id,
    c.is_unique AS class_is_unique,
    c.namestring AS class_namestring,
    1 AS local_priority,
    c.is_local AS class_is_local,
    v.basic_order_level,
    v.max_cardinality,
    v.inverse_max_cardinality
   FROM (empty.v_properties_ns v
     LEFT JOIN ( SELECT r.id,
            r.property_id,
            r.cover_set_index,
            r.add_link_slots,
            c_1.id AS id_1,
            c_1.iri,
            c_1.ns_id,
            c_1.prefix,
            c_1.local_name,
            c_1.display_name,
            c_1.classification_property_id,
            c_1.classification_property,
            c_1.classification_adornment,
            c_1.is_literal,
            c_1.datatype_id,
            c_1.indirect_members,
            c_1.is_unique,
            c_1.namestring,
            c_1.is_local
           FROM empty.cp_rels r,
            empty.v_classes_ns c_1
          WHERE ((r.class_id = c_1.id) AND (r.type_id = 1))) c ON (((v.id = c.property_id) AND (c.cover_set_index > 0) AND (v.target_cover_complete = true))));


--
-- TOC entry 1941 (class 1259 OID 111584)
-- Name: v_properties_targets_single; Type: VIEW; Schema: empty; Owner: -
--

CREATE VIEW empty.v_properties_targets_single AS
 SELECT v.id,
    v.iri,
    v.cnt,
    v.ns_id,
    v.prefix,
    v.display_name,
    v.local_name,
    v.is_unique,
    v.object_cnt,
    v.data_cnt,
    v.source_cover_complete,
    v.target_cover_complete,
    v.namestring,
    v.cnt_x,
    v.object_cnt_x,
    v.data_cnt_x,
    v.is_local,
    c.iri AS class_iri,
    c.prefix AS class_prefix,
    c.display_name AS class_display_name,
    c.local_name AS class_local_name,
    c.classification_property_id AS class_cprop_id,
    c.classification_property AS class_cprop,
    c.classification_adornment AS class_adornment,
    c.is_literal AS class_is_literal,
    c.datatype_id AS cname_datatype_id,
    c.is_unique AS class_is_unique,
    c.namestring AS class_namestring,
    1 AS local_priority,
    c.is_local AS class_is_local,
    v.basic_order_level,
    v.max_cardinality,
    v.inverse_max_cardinality
   FROM (empty.v_properties_ns v
     LEFT JOIN empty.v_classes_ns c ON ((v.range_class_id = c.id)));


--
-- TOC entry 8058 (class 0 OID 111368)
-- Dependencies: 1888
-- Data for Name: _h_classes; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty._h_classes (a, b) FROM stdin;
\.


--
-- TOC entry 8059 (class 0 OID 111371)
-- Dependencies: 1889
-- Data for Name: annot_types; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.annot_types (id, iri, ns_id, local_name) FROM stdin;
1	http://www.w3.org/2000/01/rdf-schema#label	2	label
2	http://www.w3.org/2000/01/rdf-schema#comment	2	comment
3	http://www.w3.org/2004/02/skos/core#prefLabel	4	prefLabel
4	http://www.w3.org/2004/02/skos/core#altLabel	4	altLabel
5	http://purl.org/dc/terms/description	5	description
\.


--
-- TOC entry 8064 (class 0 OID 111417)
-- Dependencies: 1895
-- Data for Name: cc_rel_types; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.cc_rel_types (id, name) FROM stdin;
1	sub_class_of
2	equivalent_class
3	intersecting_class
\.


--
-- TOC entry 8066 (class 0 OID 111423)
-- Dependencies: 1897
-- Data for Name: cc_rels; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.cc_rels (id, class_1_id, class_2_id, type_id, cnt, data) FROM stdin;
\.


--
-- TOC entry 8068 (class 0 OID 111429)
-- Dependencies: 1899
-- Data for Name: class_annots; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.class_annots (id, class_id, type_id, annotation, language_code) FROM stdin;
\.


--
-- TOC entry 8061 (class 0 OID 111377)
-- Dependencies: 1891
-- Data for Name: classes; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.classes (id, iri, cnt, data, props_in_schema, ns_id, local_name, display_name, classification_property_id, classification_property, classification_adornment, is_literal, datatype_id, instance_name_pattern, indirect_members, is_unique, large_superclass_id, hide_in_main, principal_super_class_id, self_cp_rels, cp_ask_endpoint, in_cnt) FROM stdin;
\.


--
-- TOC entry 8071 (class 0 OID 111437)
-- Dependencies: 1902
-- Data for Name: cp_rel_types; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.cp_rel_types (id, name) FROM stdin;
1	incoming
2	outgoing
3	type_constraint
4	value_type_constraint
\.


--
-- TOC entry 8062 (class 0 OID 111389)
-- Dependencies: 1892
-- Data for Name: cp_rels; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.cp_rels (id, class_id, property_id, type_id, cnt, data, object_cnt, max_cardinality, min_cardinality, cover_set_index, add_link_slots, details_level, sub_cover_complete, data_cnt, principal_class_id, cnt_base) FROM stdin;
\.


--
-- TOC entry 8074 (class 0 OID 111444)
-- Dependencies: 1905
-- Data for Name: cpc_rels; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.cpc_rels (id, cp_rel_id, other_class_id, cnt, data, cover_set_index, cnt_base) FROM stdin;
\.


--
-- TOC entry 8076 (class 0 OID 111450)
-- Dependencies: 1907
-- Data for Name: cpd_rels; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.cpd_rels (id, cp_rel_id, datatype_id, cnt, data, cnt_base) FROM stdin;
\.


--
-- TOC entry 8078 (class 0 OID 111456)
-- Dependencies: 1909
-- Data for Name: datatypes; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.datatypes (id, iri, ns_id, local_name) FROM stdin;
\.


--
-- TOC entry 8080 (class 0 OID 111462)
-- Dependencies: 1911
-- Data for Name: instances; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.instances (id, iri, ns_id, local_name, local_name_lowercase, class_id, class_iri) FROM stdin;
\.


--
-- TOC entry 8082 (class 0 OID 111469)
-- Dependencies: 1913
-- Data for Name: ns; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.ns (id, name, value, priority, is_local, basic_order_level) FROM stdin;
1	rdf	http://www.w3.org/1999/02/22-rdf-syntax-ns#	0	f	0
2	rdfs	http://www.w3.org/2000/01/rdf-schema#	0	f	0
3	xsd	http://www.w3.org/2001/XMLSchema#	0	f	0
4	skos	http://www.w3.org/2004/02/skos/core#	0	f	0
5	dct	http://purl.org/dc/terms/	0	f	0
6	dc	http://purl.org/dc/elements/1.1/	0	f	0
7	owl	http://www.w3.org/2002/07/owl#	0	f	0
8	foaf	http://xmlns.com/foaf/0.1/	0	f	0
9	schema	http://schema.org/	0	f	0
10	dbo	http://dbpedia.org/ontology/	0	f	0
11	yago	http://dbpedia.org/class/yago/	0	f	0
12	wd	http://www.wikidata.org/entity/	0	f	0
13	wdt	http://www.wikidata.org/prop/direct/	0	f	0
14	shacl	http://www.w3.org/ns/shacl#	0	f	0
15	dcat	http://www.w3.org/ns/dcat#	0	f	0
16	void	http://rdfs.org/ns/void#	0	f	0
17	virtrdf	http://www.openlinksw.com/schemas/virtrdf#	0	f	0
18	dav	http://www.openlinksw.com/schemas/DAV#	0	f	0
19	dbp	http://dbpedia.org/property/	0	f	0
20	dbr	http://dbpedia.org/resource/	0	f	0
21	dbt	http://dbpedia.org/resource/Template:	0	f	0
22	dbc	http://dbpedia.org/resource/Category:	0	f	0
23	cc	http://creativecommons.org/ns#	0	f	0
24	vann	http://purl.org/vocab/vann/	0	f	0
25	geo	http://www.w3.org/2003/01/geo/wgs84_pos#	0	f	0
26	prov	http://www.w3.org/ns/prov#	0	f	0
27	sd	http://www.w3.org/ns/sparql-service-description#	0	f	0
28	frbr	http://vocab.org/frbr/core#	0	f	0
29	georss	http://www.georss.org/georss/	0	f	0
30	gold	http://purl.org/linguistics/gold/	0	f	0
31	bibo	http://purl.org/ontology/bibo/	0	f	0
32	umbel	http://umbel.org/umbel#	0	f	0
33	umbel-rc	http://umbel.org/umbel/rc/	0	f	0
34	dul	http://www.ontologydesignpatterns.org/ont/dul/DUL.owl#	0	f	0
35	voaf	http://purl.org/vocommons/voaf#	0	f	0
36	gr	http://purl.org/goodrelations/v1#	0	f	0
37	org	http://www.w3.org/ns/org#	0	f	0
38	sioc	http://rdfs.org/sioc/ns#	0	f	0
39	vcard	http://www.w3.org/2006/vcard/ns#	0	f	0
40	obo	http://purl.obolibrary.org/obo/	0	f	0
68	bif	http://www.openlinksw.com/schemas/bif#	0	f	0
\.


--
-- TOC entry 8084 (class 0 OID 111478)
-- Dependencies: 1915
-- Data for Name: parameters; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.parameters (order_inx, name, textvalue, jsonvalue, comment, id) FROM stdin;
30	endpoint_url	\N	\N	Default endpoint URL for visual environment projects using this schema (can be overridden in induvidual project settings).	3
40	named_graph	\N	\N	Default named graph for visual environment projects using this schema.	4
210	instance_name_pattern	\N	\N	Default pattern for instance name presentation in visual query fields. Work in progress. Can be overriden on individual class level. Leave empty to present instances by their URIs.	10
330	use_instance_table	\N	\N	Mark, if a dedicated instance table is installed within the data schema (requires a custom solution).	8
240	use_pp_rels	\N	\N	Use the property-property relationships from the data schema in the query auto-completion (the property-property relationships must be retrieved from the data and stored in the pp_rels table).	9
230	instance_lookup_mode	\N	\N	table - use instances table, default - use data endpoint	19
250	direct_class_role	\N	\N	Default property to be used for instance-to-class relationship. Leave empty in the most typical case of the property being rdf:type.	5
260	indirect_class_role	\N	\N	Fill in, if an indirect class membership is to be used in the environment, along with the direct membership (normally leave empty).	6
20	schema_description	\N	\N	Description of the schema.	2
100	tree_profile_name	\N	\N	Look up public tree profile by this name (mutually exclusive with local tree_profile).	14
110	tree_profile	\N	\N	A custom configuration of the entity lookup pane tree (copy the initial value from the parameters of a similar schema).	11
200	schema_kind	\N	\N	One of: default, dbpedia, wikidata, ... .	13
220	show_instance_tab	\N	\N	Show instance tab in the entity lookup pane in the visual environment.	15
500	schema_extraction_details	\N	\N	JSON with parameters used in schema extraction.	17
510	schema_import_datetime	\N	\N	Date and time when the schema has been imported from extracted JSON data.	18
90	db_schema_name	\N	\N	Name of the schema by which it is to be known in the visual query environment (must be unique).	1
10	display_name_default	\N	\N	Recommended display name to be used in schema registry.	20
60	endpoint_public_url	\N	\N	Human readable web site of the endpoint, if available.	16
50	endpoint_type	\N	\N	Type of the endpoint (GENERIC, VIRTUOSO, JENA, BLAZEGRAPH), associated by default with the schema (can be overridden in a project).	12
\.


--
-- TOC entry 8086 (class 0 OID 111485)
-- Dependencies: 1917
-- Data for Name: pd_rels; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.pd_rels (id, property_id, datatype_id, cnt, data, cnt_base) FROM stdin;
\.


--
-- TOC entry 8088 (class 0 OID 111491)
-- Dependencies: 1919
-- Data for Name: pp_rel_types; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.pp_rel_types (id, name) FROM stdin;
1	followed_by
2	common_subject
3	common_object
4	sub_property_of
\.


--
-- TOC entry 8090 (class 0 OID 111497)
-- Dependencies: 1921
-- Data for Name: pp_rels; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.pp_rels (id, property_1_id, property_2_id, type_id, cnt, data, cnt_base) FROM stdin;
\.


--
-- TOC entry 8063 (class 0 OID 111398)
-- Dependencies: 1893
-- Data for Name: properties; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.properties (id, iri, cnt, data, ns_id, display_name, local_name, is_unique, object_cnt, max_cardinality, inverse_max_cardinality, source_cover_complete, target_cover_complete, domain_class_id, range_class_id, data_cnt, classes_in_schema, is_classifier, use_in_class, classif_prefix, values_have_cp, props_in_schema, pp_ask_endpoint, pc_ask_endpoint) FROM stdin;
\.


--
-- TOC entry 8093 (class 0 OID 111504)
-- Dependencies: 1924
-- Data for Name: property_annots; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.property_annots (id, property_id, type_id, annotation, language_code) FROM stdin;
\.


--
-- TOC entry 8103 (class 0 OID 0)
-- Dependencies: 1890
-- Name: annot_types_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.annot_types_id_seq', 7, true);


--
-- TOC entry 8104 (class 0 OID 0)
-- Dependencies: 1896
-- Name: cc_rel_types_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.cc_rel_types_id_seq', 3, true);


--
-- TOC entry 8105 (class 0 OID 0)
-- Dependencies: 1898
-- Name: cc_rels_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.cc_rels_id_seq', 1, false);


--
-- TOC entry 8106 (class 0 OID 0)
-- Dependencies: 1900
-- Name: class_annots_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.class_annots_id_seq', 1, false);


--
-- TOC entry 8107 (class 0 OID 0)
-- Dependencies: 1901
-- Name: classes_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.classes_id_seq', 1, false);


--
-- TOC entry 8108 (class 0 OID 0)
-- Dependencies: 1903
-- Name: cp_rel_types_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.cp_rel_types_id_seq', 4, true);


--
-- TOC entry 8109 (class 0 OID 0)
-- Dependencies: 1904
-- Name: cp_rels_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.cp_rels_id_seq', 1, false);


--
-- TOC entry 8110 (class 0 OID 0)
-- Dependencies: 1906
-- Name: cpc_rels_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.cpc_rels_id_seq', 1, false);


--
-- TOC entry 8111 (class 0 OID 0)
-- Dependencies: 1908
-- Name: cpd_rels_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.cpd_rels_id_seq', 1, false);


--
-- TOC entry 8112 (class 0 OID 0)
-- Dependencies: 1910
-- Name: datatypes_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.datatypes_id_seq', 1, false);


--
-- TOC entry 8113 (class 0 OID 0)
-- Dependencies: 1912
-- Name: instances_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.instances_id_seq', 1, false);


--
-- TOC entry 8114 (class 0 OID 0)
-- Dependencies: 1914
-- Name: ns_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.ns_id_seq', 68, true);


--
-- TOC entry 8115 (class 0 OID 0)
-- Dependencies: 1916
-- Name: parameters_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.parameters_id_seq', 22, true);


--
-- TOC entry 8116 (class 0 OID 0)
-- Dependencies: 1918
-- Name: pd_rels_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.pd_rels_id_seq', 1, false);


--
-- TOC entry 8117 (class 0 OID 0)
-- Dependencies: 1920
-- Name: pp_rel_types_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.pp_rel_types_id_seq', 4, true);


--
-- TOC entry 8118 (class 0 OID 0)
-- Dependencies: 1922
-- Name: pp_rels_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.pp_rels_id_seq', 1, false);


--
-- TOC entry 8119 (class 0 OID 0)
-- Dependencies: 1923
-- Name: properties_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.properties_id_seq', 1, false);


--
-- TOC entry 8120 (class 0 OID 0)
-- Dependencies: 1925
-- Name: property_annots_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.property_annots_id_seq', 1, false);


--
-- TOC entry 7263 (class 2606 OID 111590)
-- Name: _h_classes _h_classes_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty._h_classes
    ADD CONSTRAINT _h_classes_pkey PRIMARY KEY (a, b);


--
-- TOC entry 7265 (class 2606 OID 111592)
-- Name: annot_types annot_types_iri_uq; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.annot_types
    ADD CONSTRAINT annot_types_iri_uq UNIQUE (iri);


--
-- TOC entry 7267 (class 2606 OID 111594)
-- Name: annot_types annot_types_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.annot_types
    ADD CONSTRAINT annot_types_pkey PRIMARY KEY (id);


--
-- TOC entry 7301 (class 2606 OID 111596)
-- Name: cc_rel_types cc_rel_types_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cc_rel_types
    ADD CONSTRAINT cc_rel_types_pkey PRIMARY KEY (id);


--
-- TOC entry 7303 (class 2606 OID 111598)
-- Name: cc_rels cc_rels_class_1_id_class_2_id_type_id_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cc_rels
    ADD CONSTRAINT cc_rels_class_1_id_class_2_id_type_id_key UNIQUE (class_1_id, class_2_id, type_id);


--
-- TOC entry 7305 (class 2606 OID 111600)
-- Name: cc_rels cc_rels_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cc_rels
    ADD CONSTRAINT cc_rels_pkey PRIMARY KEY (id);


--
-- TOC entry 7311 (class 2606 OID 111602)
-- Name: class_annots class_annots_c_t_l_uq; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.class_annots
    ADD CONSTRAINT class_annots_c_t_l_uq UNIQUE (class_id, type_id, language_code);


--
-- TOC entry 7313 (class 2606 OID 111604)
-- Name: class_annots class_annots_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.class_annots
    ADD CONSTRAINT class_annots_pkey PRIMARY KEY (id);


--
-- TOC entry 7270 (class 2606 OID 111606)
-- Name: classes classes_iri_cl_prop_id_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.classes
    ADD CONSTRAINT classes_iri_cl_prop_id_key UNIQUE (iri, classification_property_id);


--
-- TOC entry 7272 (class 2606 OID 111608)
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- TOC entry 7316 (class 2606 OID 111610)
-- Name: cp_rel_types cp_rel_types_name_unique; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cp_rel_types
    ADD CONSTRAINT cp_rel_types_name_unique UNIQUE (name);


--
-- TOC entry 7318 (class 2606 OID 111612)
-- Name: cp_rel_types cp_rel_types_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cp_rel_types
    ADD CONSTRAINT cp_rel_types_pkey PRIMARY KEY (id);


--
-- TOC entry 7280 (class 2606 OID 111614)
-- Name: cp_rels cp_rels_class_id_property_id_type_id_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cp_rels
    ADD CONSTRAINT cp_rels_class_id_property_id_type_id_key UNIQUE (class_id, property_id, type_id);


--
-- TOC entry 7282 (class 2606 OID 111616)
-- Name: cp_rels cp_rels_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cp_rels
    ADD CONSTRAINT cp_rels_pkey PRIMARY KEY (id);


--
-- TOC entry 7320 (class 2606 OID 111618)
-- Name: cpc_rels cpc_rels_cp_rel_id_other_class_id_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cpc_rels
    ADD CONSTRAINT cpc_rels_cp_rel_id_other_class_id_key UNIQUE (cp_rel_id, other_class_id);


--
-- TOC entry 7322 (class 2606 OID 111620)
-- Name: cpc_rels cpc_rels_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cpc_rels
    ADD CONSTRAINT cpc_rels_pkey PRIMARY KEY (id);


--
-- TOC entry 7324 (class 2606 OID 111622)
-- Name: cpd_rels cpd_rels_cp_rel_id_datatype_id_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cpd_rels
    ADD CONSTRAINT cpd_rels_cp_rel_id_datatype_id_key UNIQUE (cp_rel_id, datatype_id);


--
-- TOC entry 7326 (class 2606 OID 111624)
-- Name: cpd_rels cpd_rels_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cpd_rels
    ADD CONSTRAINT cpd_rels_pkey PRIMARY KEY (id);


--
-- TOC entry 7328 (class 2606 OID 111626)
-- Name: datatypes datatypes_iri_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.datatypes
    ADD CONSTRAINT datatypes_iri_key UNIQUE (iri);


--
-- TOC entry 7330 (class 2606 OID 111628)
-- Name: datatypes datatypes_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.datatypes
    ADD CONSTRAINT datatypes_pkey PRIMARY KEY (id);


--
-- TOC entry 7335 (class 2606 OID 111630)
-- Name: instances instances_iri_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.instances
    ADD CONSTRAINT instances_iri_key UNIQUE (iri);


--
-- TOC entry 7337 (class 2606 OID 111632)
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- TOC entry 7339 (class 2606 OID 111634)
-- Name: ns ns_name_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.ns
    ADD CONSTRAINT ns_name_key UNIQUE (name);


--
-- TOC entry 7341 (class 2606 OID 111636)
-- Name: ns ns_name_unique; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.ns
    ADD CONSTRAINT ns_name_unique UNIQUE (name);


--
-- TOC entry 7343 (class 2606 OID 111638)
-- Name: ns ns_value_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.ns
    ADD CONSTRAINT ns_value_key UNIQUE (value);


--
-- TOC entry 7347 (class 2606 OID 111640)
-- Name: parameters parameters_name_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.parameters
    ADD CONSTRAINT parameters_name_key UNIQUE (name);


--
-- TOC entry 7349 (class 2606 OID 111642)
-- Name: parameters parameters_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.parameters
    ADD CONSTRAINT parameters_pkey PRIMARY KEY (id);


--
-- TOC entry 7351 (class 2606 OID 111644)
-- Name: pd_rels pd_rels_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pd_rels
    ADD CONSTRAINT pd_rels_pkey PRIMARY KEY (id);


--
-- TOC entry 7353 (class 2606 OID 111646)
-- Name: pd_rels pd_rels_property_id_datatype_id_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pd_rels
    ADD CONSTRAINT pd_rels_property_id_datatype_id_key UNIQUE (property_id, datatype_id);


--
-- TOC entry 7355 (class 2606 OID 111648)
-- Name: pp_rel_types pp_rel_types_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pp_rel_types
    ADD CONSTRAINT pp_rel_types_pkey PRIMARY KEY (id);


--
-- TOC entry 7367 (class 2606 OID 111650)
-- Name: pp_rels pp_rels_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pp_rels
    ADD CONSTRAINT pp_rels_pkey PRIMARY KEY (id);


--
-- TOC entry 7369 (class 2606 OID 111652)
-- Name: pp_rels pp_rels_property_1_id_property_2_id_type_id_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pp_rels
    ADD CONSTRAINT pp_rels_property_1_id_property_2_id_type_id_key UNIQUE (property_1_id, property_2_id, type_id);


--
-- TOC entry 7345 (class 2606 OID 111654)
-- Name: ns prefixes_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.ns
    ADD CONSTRAINT prefixes_pkey PRIMARY KEY (id);


--
-- TOC entry 7297 (class 2606 OID 111656)
-- Name: properties properties_iri_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.properties
    ADD CONSTRAINT properties_iri_key UNIQUE (iri);


--
-- TOC entry 7299 (class 2606 OID 111658)
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- TOC entry 7372 (class 2606 OID 111660)
-- Name: property_annots property_annots_p_t_l_uq; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.property_annots
    ADD CONSTRAINT property_annots_p_t_l_uq UNIQUE (property_id, type_id, language_code);


--
-- TOC entry 7374 (class 2606 OID 111662)
-- Name: property_annots property_annots_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.property_annots
    ADD CONSTRAINT property_annots_pkey PRIMARY KEY (id);


--
-- TOC entry 7268 (class 1259 OID 111663)
-- Name: fki_annot_types_ns_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_annot_types_ns_fk ON empty.annot_types USING btree (ns_id);


--
-- TOC entry 7306 (class 1259 OID 111664)
-- Name: fki_cc_rels_class_1_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_cc_rels_class_1_fk ON empty.cc_rels USING btree (class_1_id);


--
-- TOC entry 7307 (class 1259 OID 111665)
-- Name: fki_cc_rels_class_2_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_cc_rels_class_2_fk ON empty.cc_rels USING btree (class_2_id);


--
-- TOC entry 7308 (class 1259 OID 111666)
-- Name: fki_cc_rels_type_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_cc_rels_type_fk ON empty.cc_rels USING btree (type_id);


--
-- TOC entry 7314 (class 1259 OID 111667)
-- Name: fki_class_annots_class_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_class_annots_class_fk ON empty.class_annots USING btree (class_id);


--
-- TOC entry 7273 (class 1259 OID 111668)
-- Name: fki_classes_ns_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_classes_ns_fk ON empty.classes USING btree (ns_id);


--
-- TOC entry 7274 (class 1259 OID 111669)
-- Name: fki_classes_superclass_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_classes_superclass_fk ON empty.classes USING btree (principal_super_class_id);


--
-- TOC entry 7283 (class 1259 OID 111670)
-- Name: fki_cp_rels_class_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_cp_rels_class_fk ON empty.cp_rels USING btree (class_id);


--
-- TOC entry 7290 (class 1259 OID 111671)
-- Name: fki_cp_rels_domain_classes_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_cp_rels_domain_classes_fk ON empty.properties USING btree (domain_class_id);


--
-- TOC entry 7284 (class 1259 OID 111672)
-- Name: fki_cp_rels_property_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_cp_rels_property_fk ON empty.cp_rels USING btree (property_id);


--
-- TOC entry 7291 (class 1259 OID 111673)
-- Name: fki_cp_rels_range_classes_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_cp_rels_range_classes_fk ON empty.properties USING btree (range_class_id);


--
-- TOC entry 7285 (class 1259 OID 111674)
-- Name: fki_cp_rels_type_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_cp_rels_type_fk ON empty.cp_rels USING btree (type_id);


--
-- TOC entry 7331 (class 1259 OID 111675)
-- Name: fki_datatypes_ns_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_datatypes_ns_fk ON empty.datatypes USING btree (ns_id);


--
-- TOC entry 7356 (class 1259 OID 111676)
-- Name: fki_pp_rels_property_1_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_pp_rels_property_1_fk ON empty.pp_rels USING btree (property_1_id);


--
-- TOC entry 7357 (class 1259 OID 111677)
-- Name: fki_pp_rels_property_2_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_pp_rels_property_2_fk ON empty.pp_rels USING btree (property_2_id);


--
-- TOC entry 7358 (class 1259 OID 111678)
-- Name: fki_pp_rels_type_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_pp_rels_type_fk ON empty.pp_rels USING btree (type_id);


--
-- TOC entry 7292 (class 1259 OID 111679)
-- Name: fki_properties_ns_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_properties_ns_fk ON empty.properties USING btree (ns_id);


--
-- TOC entry 7370 (class 1259 OID 111680)
-- Name: fki_property_annots_class_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_property_annots_class_fk ON empty.property_annots USING btree (property_id);


--
-- TOC entry 7309 (class 1259 OID 111681)
-- Name: idx_cc_rels_data; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_cc_rels_data ON empty.cc_rels USING gin (data);


--
-- TOC entry 7275 (class 1259 OID 111682)
-- Name: idx_classes_cnt; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_classes_cnt ON empty.classes USING btree (cnt);


--
-- TOC entry 7276 (class 1259 OID 111683)
-- Name: idx_classes_data; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_classes_data ON empty.classes USING gin (data);


--
-- TOC entry 7277 (class 1259 OID 111684)
-- Name: idx_classes_iri; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_classes_iri ON empty.classes USING btree (iri);


--
-- TOC entry 7278 (class 1259 OID 111685)
-- Name: idx_classes_large_superclass_id; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_classes_large_superclass_id ON empty.classes USING btree (large_superclass_id) INCLUDE (id);


--
-- TOC entry 7286 (class 1259 OID 111686)
-- Name: idx_cp_rels_class_prop_data; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_cp_rels_class_prop_data ON empty.cp_rels USING btree (class_id, type_id, data_cnt DESC NULLS LAST) INCLUDE (property_id);


--
-- TOC entry 7287 (class 1259 OID 111687)
-- Name: idx_cp_rels_class_prop_object; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_cp_rels_class_prop_object ON empty.cp_rels USING btree (class_id, type_id, object_cnt DESC NULLS LAST) INCLUDE (property_id);


--
-- TOC entry 7288 (class 1259 OID 111688)
-- Name: idx_cp_rels_data; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_cp_rels_data ON empty.cp_rels USING gin (data);


--
-- TOC entry 7289 (class 1259 OID 111689)
-- Name: idx_cp_rels_prop_class; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_cp_rels_prop_class ON empty.cp_rels USING btree (property_id, type_id, cnt DESC NULLS LAST) INCLUDE (class_id);


--
-- TOC entry 7332 (class 1259 OID 111690)
-- Name: idx_instances_local_name; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_instances_local_name ON empty.instances USING btree (local_name text_pattern_ops);


--
-- TOC entry 7333 (class 1259 OID 111691)
-- Name: idx_instances_test; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_instances_test ON empty.instances USING gin (test);


--
-- TOC entry 7359 (class 1259 OID 111692)
-- Name: idx_pp_rels_data; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_pp_rels_data ON empty.pp_rels USING gin (data);


--
-- TOC entry 7360 (class 1259 OID 111693)
-- Name: idx_pp_rels_p1_t_p2; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_pp_rels_p1_t_p2 ON empty.pp_rels USING btree (property_1_id, type_id, cnt DESC NULLS LAST) INCLUDE (property_2_id);


--
-- TOC entry 7361 (class 1259 OID 111694)
-- Name: idx_pp_rels_p2_t_p1; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_pp_rels_p2_t_p1 ON empty.pp_rels USING btree (property_2_id, type_id, cnt DESC NULLS LAST) INCLUDE (property_1_id);


--
-- TOC entry 7362 (class 1259 OID 111695)
-- Name: idx_pp_rels_property_1_type; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_pp_rels_property_1_type ON empty.pp_rels USING btree (property_1_id) INCLUDE (type_id);


--
-- TOC entry 7363 (class 1259 OID 111696)
-- Name: idx_pp_rels_property_1_type_; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_pp_rels_property_1_type_ ON empty.pp_rels USING btree (property_1_id, type_id);


--
-- TOC entry 7364 (class 1259 OID 111697)
-- Name: idx_pp_rels_property_2_type; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_pp_rels_property_2_type ON empty.pp_rels USING btree (property_2_id) INCLUDE (type_id);


--
-- TOC entry 7365 (class 1259 OID 111698)
-- Name: idx_pp_rels_property_2_type_; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_pp_rels_property_2_type_ ON empty.pp_rels USING btree (property_2_id, type_id);


--
-- TOC entry 7293 (class 1259 OID 111699)
-- Name: idx_properties_cnt; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_properties_cnt ON empty.properties USING btree (cnt);


--
-- TOC entry 7294 (class 1259 OID 111700)
-- Name: idx_properties_data; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_properties_data ON empty.properties USING gin (data);


--
-- TOC entry 7295 (class 1259 OID 111701)
-- Name: idx_properties_iri; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_properties_iri ON empty.properties USING btree (iri);


--
-- TOC entry 7375 (class 2606 OID 111702)
-- Name: annot_types annot_types_ns_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.annot_types
    ADD CONSTRAINT annot_types_ns_fk FOREIGN KEY (ns_id) REFERENCES empty.ns(id) ON DELETE SET NULL;


--
-- TOC entry 7385 (class 2606 OID 111707)
-- Name: cc_rels cc_rels_class_1_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cc_rels
    ADD CONSTRAINT cc_rels_class_1_fk FOREIGN KEY (class_1_id) REFERENCES empty.classes(id) ON DELETE CASCADE;


--
-- TOC entry 7386 (class 2606 OID 111712)
-- Name: cc_rels cc_rels_class_2_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cc_rels
    ADD CONSTRAINT cc_rels_class_2_fk FOREIGN KEY (class_2_id) REFERENCES empty.classes(id) ON DELETE CASCADE;


--
-- TOC entry 7387 (class 2606 OID 111717)
-- Name: cc_rels cc_rels_type_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cc_rels
    ADD CONSTRAINT cc_rels_type_fk FOREIGN KEY (type_id) REFERENCES empty.cc_rel_types(id) ON DELETE CASCADE;


--
-- TOC entry 7388 (class 2606 OID 111722)
-- Name: class_annots class_annots_class_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.class_annots
    ADD CONSTRAINT class_annots_class_fk FOREIGN KEY (class_id) REFERENCES empty.classes(id) ON DELETE CASCADE;


--
-- TOC entry 7389 (class 2606 OID 111727)
-- Name: class_annots class_annots_type_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.class_annots
    ADD CONSTRAINT class_annots_type_fk FOREIGN KEY (type_id) REFERENCES empty.annot_types(id) ON DELETE CASCADE;


--
-- TOC entry 7376 (class 2606 OID 111732)
-- Name: classes classes_datatype_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.classes
    ADD CONSTRAINT classes_datatype_fk FOREIGN KEY (datatype_id) REFERENCES empty.datatypes(id) ON DELETE SET NULL;


--
-- TOC entry 7377 (class 2606 OID 111737)
-- Name: classes classes_ns_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.classes
    ADD CONSTRAINT classes_ns_fk FOREIGN KEY (ns_id) REFERENCES empty.ns(id) ON DELETE SET NULL;


--
-- TOC entry 7378 (class 2606 OID 111742)
-- Name: classes classes_superclass_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.classes
    ADD CONSTRAINT classes_superclass_fk FOREIGN KEY (principal_super_class_id) REFERENCES empty.classes(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;


--
-- TOC entry 7379 (class 2606 OID 111747)
-- Name: cp_rels cp_rels_class_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cp_rels
    ADD CONSTRAINT cp_rels_class_fk FOREIGN KEY (class_id) REFERENCES empty.classes(id) ON DELETE CASCADE;


--
-- TOC entry 7380 (class 2606 OID 111752)
-- Name: cp_rels cp_rels_property_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cp_rels
    ADD CONSTRAINT cp_rels_property_fk FOREIGN KEY (property_id) REFERENCES empty.properties(id) ON DELETE CASCADE;


--
-- TOC entry 7381 (class 2606 OID 111757)
-- Name: cp_rels cp_rels_type_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cp_rels
    ADD CONSTRAINT cp_rels_type_fk FOREIGN KEY (type_id) REFERENCES empty.cp_rel_types(id);


--
-- TOC entry 7390 (class 2606 OID 111762)
-- Name: cpc_rels cpc_rels_cp_rel_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cpc_rels
    ADD CONSTRAINT cpc_rels_cp_rel_fk FOREIGN KEY (cp_rel_id) REFERENCES empty.cp_rels(id) ON DELETE CASCADE;


--
-- TOC entry 7391 (class 2606 OID 111767)
-- Name: cpc_rels cpc_rels_other_class_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cpc_rels
    ADD CONSTRAINT cpc_rels_other_class_fk FOREIGN KEY (other_class_id) REFERENCES empty.classes(id) ON DELETE CASCADE;


--
-- TOC entry 7392 (class 2606 OID 111772)
-- Name: cpd_rels cpd_rels_cp_rel_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cpd_rels
    ADD CONSTRAINT cpd_rels_cp_rel_fk FOREIGN KEY (cp_rel_id) REFERENCES empty.cp_rels(id) ON DELETE CASCADE;


--
-- TOC entry 7393 (class 2606 OID 111777)
-- Name: cpd_rels cpd_rels_datatype_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cpd_rels
    ADD CONSTRAINT cpd_rels_datatype_fk FOREIGN KEY (datatype_id) REFERENCES empty.datatypes(id) ON DELETE CASCADE;


--
-- TOC entry 7394 (class 2606 OID 111782)
-- Name: datatypes datatypes_ns_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.datatypes
    ADD CONSTRAINT datatypes_ns_fk FOREIGN KEY (ns_id) REFERENCES empty.ns(id) ON DELETE SET NULL;


--
-- TOC entry 7395 (class 2606 OID 111787)
-- Name: instances instances_class_id_fkey; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.instances
    ADD CONSTRAINT instances_class_id_fkey FOREIGN KEY (class_id) REFERENCES empty.classes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- TOC entry 7396 (class 2606 OID 111792)
-- Name: instances instances_ns_id_fkey; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.instances
    ADD CONSTRAINT instances_ns_id_fkey FOREIGN KEY (ns_id) REFERENCES empty.ns(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- TOC entry 7397 (class 2606 OID 111797)
-- Name: pd_rels pd_rels_datatype_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pd_rels
    ADD CONSTRAINT pd_rels_datatype_fk FOREIGN KEY (datatype_id) REFERENCES empty.datatypes(id) ON DELETE CASCADE;


--
-- TOC entry 7398 (class 2606 OID 111802)
-- Name: pd_rels pd_rels_property_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pd_rels
    ADD CONSTRAINT pd_rels_property_fk FOREIGN KEY (property_id) REFERENCES empty.properties(id) ON DELETE CASCADE;


--
-- TOC entry 7399 (class 2606 OID 111807)
-- Name: pp_rels pp_rels_property_1_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pp_rels
    ADD CONSTRAINT pp_rels_property_1_fk FOREIGN KEY (property_1_id) REFERENCES empty.properties(id) ON DELETE CASCADE;


--
-- TOC entry 7400 (class 2606 OID 111812)
-- Name: pp_rels pp_rels_property_2_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pp_rels
    ADD CONSTRAINT pp_rels_property_2_fk FOREIGN KEY (property_2_id) REFERENCES empty.properties(id) ON DELETE CASCADE;


--
-- TOC entry 7401 (class 2606 OID 111817)
-- Name: pp_rels pp_rels_type_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pp_rels
    ADD CONSTRAINT pp_rels_type_fk FOREIGN KEY (type_id) REFERENCES empty.pp_rel_types(id);


--
-- TOC entry 7382 (class 2606 OID 111822)
-- Name: properties properties_domain_class_id_fkey; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.properties
    ADD CONSTRAINT properties_domain_class_id_fkey FOREIGN KEY (domain_class_id) REFERENCES empty.classes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- TOC entry 7383 (class 2606 OID 111827)
-- Name: properties properties_ns_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.properties
    ADD CONSTRAINT properties_ns_fk FOREIGN KEY (ns_id) REFERENCES empty.ns(id) ON DELETE SET NULL;


--
-- TOC entry 7384 (class 2606 OID 111832)
-- Name: properties properties_range_class_id_fkey; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.properties
    ADD CONSTRAINT properties_range_class_id_fkey FOREIGN KEY (range_class_id) REFERENCES empty.classes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- TOC entry 7402 (class 2606 OID 111837)
-- Name: property_annots property_annots_property_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.property_annots
    ADD CONSTRAINT property_annots_property_fk FOREIGN KEY (property_id) REFERENCES empty.properties(id) ON DELETE CASCADE;


--
-- TOC entry 7403 (class 2606 OID 111842)
-- Name: property_annots property_annots_type_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.property_annots
    ADD CONSTRAINT property_annots_type_fk FOREIGN KEY (type_id) REFERENCES empty.annot_types(id) ON DELETE CASCADE;


-- Completed on 2024-04-15 12:43:59 EEST

--
-- PostgreSQL database dump complete
--

