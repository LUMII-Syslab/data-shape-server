--
-- PostgreSQL database dump
--

-- Dumped from database version 12.11 (Ubuntu 12.11-0ubuntu0.20.04.1)
-- Dumped by pg_dump version 12.9

-- Started on 2022-05-27 17:26:56 EEST

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
-- TOC entry 11 (class 2615 OID 1964891)
-- Name: empty; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA empty;


--
-- TOC entry 5521 (class 0 OID 0)
-- Dependencies: 11
-- Name: SCHEMA empty; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA empty IS 'schema for rdf endpoint meta info; v0.1';


--
-- TOC entry 953 (class 1255 OID 1964892)
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


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 733 (class 1259 OID 1964893)
-- Name: _h_classes; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty._h_classes (
    a integer NOT NULL,
    b integer NOT NULL
);


--
-- TOC entry 5523 (class 0 OID 0)
-- Dependencies: 733
-- Name: TABLE _h_classes; Type: COMMENT; Schema: empty; Owner: -
--

COMMENT ON TABLE empty._h_classes IS '-- Helper table for large subclass id computation';


--
-- TOC entry 734 (class 1259 OID 1964896)
-- Name: annot_types; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.annot_types (
    id integer NOT NULL,
    iri text NOT NULL,
    ns_id integer,
    local_name text
);


--
-- TOC entry 735 (class 1259 OID 1964902)
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
-- TOC entry 736 (class 1259 OID 1964904)
-- Name: classes; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.classes (
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
    large_superclass_id integer,
    hide_in_main boolean DEFAULT false
);


--
-- TOC entry 737 (class 1259 OID 1964913)
-- Name: cp_rels; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.cp_rels (
    id integer NOT NULL,
    class_id integer NOT NULL,
    property_id integer NOT NULL,
    type_id integer NOT NULL,
    cnt bigint,
    data jsonb,
    object_cnt integer,
    data_cnt_calc integer GENERATED ALWAYS AS ((cnt - object_cnt)) STORED,
    max_cardinality integer,
    min_cardinality integer,
    cover_set_index integer,
    add_link_slots integer DEFAULT 1 NOT NULL,
    details_level integer DEFAULT 0 NOT NULL,
    sub_cover_complete boolean DEFAULT false NOT NULL,
    data_cnt integer
);


--
-- TOC entry 738 (class 1259 OID 1964923)
-- Name: properties; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.properties (
    id integer NOT NULL,
    iri text NOT NULL,
    cnt integer,
    data jsonb,
    ns_id integer,
    display_name text,
    local_name text,
    is_unique boolean DEFAULT false NOT NULL,
    object_cnt integer,
    data_cnt_calc integer GENERATED ALWAYS AS ((cnt - object_cnt)) STORED,
    max_cardinality integer,
    inverse_max_cardinality integer,
    source_cover_complete boolean DEFAULT false NOT NULL,
    target_cover_complete boolean DEFAULT false NOT NULL,
    domain_class_id integer,
    range_class_id integer,
    data_cnt integer,
    classes_in_schema boolean DEFAULT false NOT NULL
);


--
-- TOC entry 739 (class 1259 OID 1964933)
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
-- TOC entry 740 (class 1259 OID 1964938)
-- Name: cc_rel_types; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.cc_rel_types (
    id integer NOT NULL,
    name text
);


--
-- TOC entry 741 (class 1259 OID 1964944)
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
-- TOC entry 742 (class 1259 OID 1964946)
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
-- TOC entry 743 (class 1259 OID 1964952)
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
-- TOC entry 744 (class 1259 OID 1964954)
-- Name: class_annots; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.class_annots (
    id integer NOT NULL,
    class_id integer NOT NULL,
    type_id integer NOT NULL,
    annotation text NOT NULL,
    language_code text DEFAULT 'en'::text NOT NULL
);


--
-- TOC entry 745 (class 1259 OID 1964961)
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
-- TOC entry 746 (class 1259 OID 1964963)
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
-- TOC entry 747 (class 1259 OID 1964965)
-- Name: cp_rel_types; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.cp_rel_types (
    id integer NOT NULL,
    name text
);


--
-- TOC entry 748 (class 1259 OID 1964971)
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
-- TOC entry 749 (class 1259 OID 1964973)
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
-- TOC entry 750 (class 1259 OID 1964975)
-- Name: cpc_rels; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.cpc_rels (
    id integer NOT NULL,
    cp_rel_id integer NOT NULL,
    other_class_id integer NOT NULL,
    cnt integer,
    data jsonb,
    cover_set_index integer
);


--
-- TOC entry 751 (class 1259 OID 1964981)
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
-- TOC entry 752 (class 1259 OID 1964983)
-- Name: cpd_rels; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.cpd_rels (
    id integer NOT NULL,
    cp_rel_id integer NOT NULL,
    datatype_id integer NOT NULL,
    cnt integer,
    data jsonb
);


--
-- TOC entry 753 (class 1259 OID 1964989)
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
-- TOC entry 754 (class 1259 OID 1964991)
-- Name: datatypes; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.datatypes (
    id integer NOT NULL,
    iri text NOT NULL,
    ns_id integer,
    local_name text
);


--
-- TOC entry 755 (class 1259 OID 1964997)
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
-- TOC entry 795 (class 1259 OID 1965921)
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
-- TOC entry 794 (class 1259 OID 1965919)
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
-- TOC entry 756 (class 1259 OID 1964999)
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
-- TOC entry 757 (class 1259 OID 1965007)
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
-- TOC entry 758 (class 1259 OID 1965009)
-- Name: pd_rels; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.pd_rels (
    id integer NOT NULL,
    property_id integer NOT NULL,
    datatype_id integer NOT NULL,
    cnt integer,
    data jsonb
);


--
-- TOC entry 759 (class 1259 OID 1965015)
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
-- TOC entry 760 (class 1259 OID 1965017)
-- Name: pp_rel_types; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.pp_rel_types (
    id integer NOT NULL,
    name text
);


--
-- TOC entry 761 (class 1259 OID 1965023)
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
-- TOC entry 762 (class 1259 OID 1965025)
-- Name: pp_rels; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.pp_rels (
    id integer NOT NULL,
    property_1_id integer NOT NULL,
    property_2_id integer NOT NULL,
    type_id integer NOT NULL,
    cnt bigint,
    data jsonb
);


--
-- TOC entry 763 (class 1259 OID 1965031)
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
-- TOC entry 764 (class 1259 OID 1965033)
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
-- TOC entry 765 (class 1259 OID 1965035)
-- Name: property_annots; Type: TABLE; Schema: empty; Owner: -
--

CREATE TABLE empty.property_annots (
    id integer NOT NULL,
    property_id integer NOT NULL,
    type_id integer NOT NULL,
    annotation text NOT NULL,
    language_code text DEFAULT 'en'::text NOT NULL
);


--
-- TOC entry 766 (class 1259 OID 1965042)
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
-- TOC entry 767 (class 1259 OID 1965044)
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
    c2.iri AS iri2
   FROM empty.cc_rels r,
    empty.classes c1,
    empty.classes c2
  WHERE ((r.class_1_id = c1.id) AND (r.class_2_id = c2.id));


--
-- TOC entry 768 (class 1259 OID 1965048)
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
    c.indirect_members,
    c.is_unique,
    concat(n.name, ',', c.local_name, ',', c.display_name, ',', lower(c.display_name)) AS namestring,
    empty.tapprox(c.cnt) AS cnt_x,
    n.is_local,
    c.large_superclass_id
   FROM (empty.classes c
     LEFT JOIN empty.ns n ON ((c.ns_id = n.id)));


--
-- TOC entry 769 (class 1259 OID 1965053)
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
    v.indirect_members,
    v.is_unique,
    v.namestring,
    v.cnt_x,
    v.is_local,
    v.large_superclass_id
   FROM empty.v_classes_ns v
  WHERE (NOT (EXISTS ( SELECT cc_rels.id
           FROM empty.cc_rels
          WHERE ((cc_rels.class_1_id = v.id) AND (cc_rels.type_id = 2)))));


--
-- TOC entry 770 (class 1259 OID 1965057)
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
    c.large_superclass_id
   FROM (empty.classes c
     LEFT JOIN empty.ns n ON ((c.ns_id = n.id)));


--
-- TOC entry 771 (class 1259 OID 1965062)
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
    v.indirect_members,
    v.is_unique,
    v.namestring,
    v.cnt_x,
    v.is_local,
    v.has_subclasses,
    v.large_superclass_id
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
-- TOC entry 772 (class 1259 OID 1965067)
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
    v.indirect_members,
    v.is_unique,
    v.namestring,
    v.cnt_x,
    v.is_local
   FROM (empty.v_classes_ns v
     LEFT JOIN empty.cc_rels r ON (((r.class_1_id = v.id) AND (r.type_id = 2))))
  WHERE (r.class_2_id IS NULL);


--
-- TOC entry 773 (class 1259 OID 1965072)
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
    c.iri AS class_iri,
    p.iri AS property_iri
   FROM empty.cp_rels r,
    empty.classes c,
    empty.properties p
  WHERE ((r.class_id = c.id) AND (r.property_id = p.id));


--
-- TOC entry 820 (class 1259 OID 1967640)
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
        END, '-1'::integer) AS x_max_cardinality
   FROM empty.cp_rels r,
    empty.properties p
  WHERE (r.property_id = p.id);


--
-- TOC entry 774 (class 1259 OID 1965077)
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
-- TOC entry 775 (class 1259 OID 1965081)
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
    n.basic_order_level,
        CASE
            WHEN (p.max_cardinality IS NOT NULL) THEN p.max_cardinality
            ELSE '-1'::integer
        END AS max_cardinality,
        CASE
            WHEN (p.inverse_max_cardinality IS NOT NULL) THEN p.inverse_max_cardinality
            ELSE '-1'::integer
        END AS inverse_max_cardinality
   FROM (empty.properties p
     LEFT JOIN empty.ns n ON ((p.ns_id = n.id)));


--
-- TOC entry 776 (class 1259 OID 1965086)
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
            c_1.indirect_members,
            c_1.is_unique,
            c_1.namestring,
            c_1.is_local
           FROM empty.cp_rels r,
            empty.v_classes_ns c_1
          WHERE ((r.class_id = c_1.id) AND (r.type_id = 2))) c ON (((v.id = c.property_id) AND (c.cover_set_index > 0) AND (v.target_cover_complete = true))));


--
-- TOC entry 777 (class 1259 OID 1965091)
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
-- TOC entry 778 (class 1259 OID 1965096)
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
            c_1.indirect_members,
            c_1.is_unique,
            c_1.namestring,
            c_1.is_local
           FROM empty.cp_rels r,
            empty.v_classes_ns c_1
          WHERE ((r.class_id = c_1.id) AND (r.type_id = 1))) c ON (((v.id = c.property_id) AND (c.cover_set_index > 0) AND (v.target_cover_complete = true))));


--
-- TOC entry 779 (class 1259 OID 1965101)
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
-- TOC entry 5481 (class 0 OID 1964893)
-- Dependencies: 733
-- Data for Name: _h_classes; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty._h_classes (a, b) FROM stdin;
\.


--
-- TOC entry 5482 (class 0 OID 1964896)
-- Dependencies: 734
-- Data for Name: annot_types; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.annot_types (id, iri, ns_id, local_name) FROM stdin;
1	http://www.w3.org/2000/01/rdf-schema#label	8	label
2	http://www.w3.org/2000/01/rdf-schema#comment	8	comment
\.


--
-- TOC entry 5487 (class 0 OID 1964938)
-- Dependencies: 740
-- Data for Name: cc_rel_types; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.cc_rel_types (id, name) FROM stdin;
1	sub_class_of
2	equivalent_class
\.


--
-- TOC entry 5489 (class 0 OID 1964946)
-- Dependencies: 742
-- Data for Name: cc_rels; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.cc_rels (id, class_1_id, class_2_id, type_id, cnt, data) FROM stdin;
\.


--
-- TOC entry 5491 (class 0 OID 1964954)
-- Dependencies: 744
-- Data for Name: class_annots; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.class_annots (id, class_id, type_id, annotation, language_code) FROM stdin;
\.


--
-- TOC entry 5484 (class 0 OID 1964904)
-- Dependencies: 736
-- Data for Name: classes; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.classes (id, iri, cnt, data, props_in_schema, ns_id, local_name, display_name, indirect_members, is_unique, large_superclass_id, hide_in_main) FROM stdin;
\.


--
-- TOC entry 5494 (class 0 OID 1964965)
-- Dependencies: 747
-- Data for Name: cp_rel_types; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.cp_rel_types (id, name) FROM stdin;
1	incoming
2	outgoing
3	type_constraint
4	value_type_constraint
\.


--
-- TOC entry 5485 (class 0 OID 1964913)
-- Dependencies: 737
-- Data for Name: cp_rels; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.cp_rels (id, class_id, property_id, type_id, cnt, data, object_cnt, max_cardinality, min_cardinality, cover_set_index, add_link_slots, details_level, sub_cover_complete, data_cnt) FROM stdin;
\.


--
-- TOC entry 5497 (class 0 OID 1964975)
-- Dependencies: 750
-- Data for Name: cpc_rels; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.cpc_rels (id, cp_rel_id, other_class_id, cnt, data, cover_set_index) FROM stdin;
\.


--
-- TOC entry 5499 (class 0 OID 1964983)
-- Dependencies: 752
-- Data for Name: cpd_rels; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.cpd_rels (id, cp_rel_id, datatype_id, cnt, data) FROM stdin;
\.


--
-- TOC entry 5501 (class 0 OID 1964991)
-- Dependencies: 754
-- Data for Name: datatypes; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.datatypes (id, iri, ns_id, local_name) FROM stdin;
\.


--
-- TOC entry 5515 (class 0 OID 1965921)
-- Dependencies: 795
-- Data for Name: instances; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.instances (id, iri, ns_id, local_name, local_name_lowercase, class_id, class_iri) FROM stdin;
\.


--
-- TOC entry 5503 (class 0 OID 1964999)
-- Dependencies: 756
-- Data for Name: ns; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.ns (id, name, value, priority, is_local, basic_order_level) FROM stdin;
1	dbp	http://dbpedia.org/property/	0	f	0
2	dbr	http://dbpedia.org/resource/	0	f	0
3	dbt	http://dbpedia.org/resource/Template:	0	f	0
4	dbc	http://dbpedia.org/resource/Category:	0	f	0
5	rdf	http://www.w3.org/1999/02/22-rdf-syntax-ns#	0	f	0
6	rdfs	http://www.w3.org/2000/01/rdf-schema#	0	f	0
7	sh	http://www.w3.org/ns/shacl#	0	f	0
8	shsh	http://www.w3.org/ns/shacl-shacl#	0	f	0
9	skos	http://www.w3.org/2004/02/skos/core#	0	f	0
10	xsd	http://www.w3.org/2001/XMLSchema#	0	f	0
11	owl	http://www.w3.org/2002/07/owl#	0	f	0
12	virtrdf	http://www.openlinksw.com/schemas/virtrdf#	0	f	0
13	dct	http://purl.org/dc/terms/	0	f	0
14	dc	http://purl.org/dc/elements/1.1/	0	f	0
15	foaf	http://xmlns.com/foaf/0.1/	0	f	0
16	schema	http://schema.org/	0	f	0
17	yago	http://dbpedia.org/class/yago/	0	f	0
18	umbel-rc	http://umbel.org/umbel/rc/	0	f	0
19	wikidata	http://www.wikidata.org/entity/	0	f	0
20	vann	http://purl.org/vocab/vann/	0	f	0
21	geo	http://www.w3.org/2003/01/geo/wgs84_pos#	0	f	0
22	prov	http://www.w3.org/ns/prov#	0	f	0
23	sd	http://www.w3.org/ns/sparql-service-description#	0	f	0
24	frbr	http://vocab.org/frbr/core#	0	f	0
25	georss	http://www.georss.org/georss/	0	f	0
26	gold	http://purl.org/linguistics/gold/	0	f	0
27	rdrel	http://rdvocab.info/RDARelationshipsWEMI/	0	f	0
28	bibo	http://purl.org/ontology/bibo/	0	f	0
29	umbel	http://umbel.org/umbel#	0	f	0
30	cc	http://creativecommons.org/ns#	0	f	0
31	dav	http://www.openlinksw.com/schemas/DAV#	0	f	0
32	dul	http://www.ontologydesignpatterns.org/ont/dul/DUL.owl#	0	f	0
33	voaf	http://purl.org/vocommons/voaf#	0	f	0
34	dbo	http://dbpedia.org/ontology/	0	f	0
35	dbo_Astronaut	http://dbpedia.org/ontology/Astronaut/	0	f	0
36	dbo_Automobile	http://dbpedia.org/ontology/Automobile/	0	f	0
37	dbo_Building	http://dbpedia.org/ontology/Building/	0	f	0
38	dbo_ChemicalSubstance	http://dbpedia.org/ontology/ChemicalSubstance/	0	f	0
39	dbo_Engine	http://dbpedia.org/ontology/Engine/	0	f	0
40	dbo_GrandPrix	http://dbpedia.org/ontology/GrandPrix/	0	f	0
41	dbo_Infrastructure	http://dbpedia.org/ontology/Infrastructure/	0	f	0
42	dbo_Lake	http://dbpedia.org/ontology/Lake/	0	f	0
43	dbo_MeanOfTransportation	http://dbpedia.org/ontology/MeanOfTransportation/	0	f	0
44	dbo_Person	http://dbpedia.org/ontology/Person/	0	f	0
45	dbo_Planet	http://dbpedia.org/ontology/Planet/	0	f	0
46	dbo_PopulatedPlace	http://dbpedia.org/ontology/PopulatedPlace/	0	f	0
47	dbo_Rocket	http://dbpedia.org/ontology/Rocket/	0	f	0
48	dbo_School	http://dbpedia.org/ontology/School/	0	f	0
49	dbo_Software	http://dbpedia.org/ontology/Software/	0	f	0
50	dbo_SpaceMission	http://dbpedia.org/ontology/SpaceMission/	0	f	0
51	dbo_SpaceShuttle	http://dbpedia.org/ontology/SpaceShuttle/	0	f	0
52	dbo_SpaceStation	http://dbpedia.org/ontology/SpaceStation/	0	f	0
53	dbo_Stream	http://dbpedia.org/ontology/Stream/	0	f	0
54	dbo_Weapon	http://dbpedia.org/ontology/Weapon/	0	f	0
55	dbo_Work	http://dbpedia.org/ontology/Work/	0	f	0
56	en_wiki	http://en.wikipedia.org/wiki/	0	f	0
57	schema_s	https://schema.org/	0	f	0
\.


--
-- TOC entry 5505 (class 0 OID 1965009)
-- Dependencies: 758
-- Data for Name: pd_rels; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.pd_rels (id, property_id, datatype_id, cnt, data) FROM stdin;
\.


--
-- TOC entry 5507 (class 0 OID 1965017)
-- Dependencies: 760
-- Data for Name: pp_rel_types; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.pp_rel_types (id, name) FROM stdin;
1	followed_by
2	common_subject
3	common_object
4	sub_property_of
\.


--
-- TOC entry 5509 (class 0 OID 1965025)
-- Dependencies: 762
-- Data for Name: pp_rels; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.pp_rels (id, property_1_id, property_2_id, type_id, cnt, data) FROM stdin;
\.


--
-- TOC entry 5486 (class 0 OID 1964923)
-- Dependencies: 738
-- Data for Name: properties; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.properties (id, iri, cnt, data, ns_id, display_name, local_name, is_unique, object_cnt, max_cardinality, inverse_max_cardinality, source_cover_complete, target_cover_complete, domain_class_id, range_class_id, data_cnt, classes_in_schema) FROM stdin;
\.


--
-- TOC entry 5512 (class 0 OID 1965035)
-- Dependencies: 765
-- Data for Name: property_annots; Type: TABLE DATA; Schema: empty; Owner: -
--

COPY empty.property_annots (id, property_id, type_id, annotation, language_code) FROM stdin;
\.


--
-- TOC entry 5557 (class 0 OID 0)
-- Dependencies: 735
-- Name: annot_types_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.annot_types_id_seq', 2, true);


--
-- TOC entry 5558 (class 0 OID 0)
-- Dependencies: 741
-- Name: cc_rel_types_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.cc_rel_types_id_seq', 2, true);


--
-- TOC entry 5559 (class 0 OID 0)
-- Dependencies: 743
-- Name: cc_rels_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.cc_rels_id_seq', 1, false);


--
-- TOC entry 5560 (class 0 OID 0)
-- Dependencies: 745
-- Name: class_annots_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.class_annots_id_seq', 1, false);


--
-- TOC entry 5561 (class 0 OID 0)
-- Dependencies: 746
-- Name: classes_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.classes_id_seq', 1, false);


--
-- TOC entry 5562 (class 0 OID 0)
-- Dependencies: 748
-- Name: cp_rel_types_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.cp_rel_types_id_seq', 4, true);


--
-- TOC entry 5563 (class 0 OID 0)
-- Dependencies: 749
-- Name: cp_rels_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.cp_rels_id_seq', 1, false);


--
-- TOC entry 5564 (class 0 OID 0)
-- Dependencies: 751
-- Name: cpc_rels_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.cpc_rels_id_seq', 1, false);


--
-- TOC entry 5565 (class 0 OID 0)
-- Dependencies: 753
-- Name: cpd_rels_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.cpd_rels_id_seq', 1, false);


--
-- TOC entry 5566 (class 0 OID 0)
-- Dependencies: 755
-- Name: datatypes_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.datatypes_id_seq', 1, false);


--
-- TOC entry 5567 (class 0 OID 0)
-- Dependencies: 794
-- Name: instances_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.instances_id_seq', 1, false);


--
-- TOC entry 5568 (class 0 OID 0)
-- Dependencies: 757
-- Name: ns_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.ns_id_seq', 57, true);


--
-- TOC entry 5569 (class 0 OID 0)
-- Dependencies: 759
-- Name: pd_rels_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.pd_rels_id_seq', 1, false);


--
-- TOC entry 5570 (class 0 OID 0)
-- Dependencies: 761
-- Name: pp_rel_types_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.pp_rel_types_id_seq', 4, true);


--
-- TOC entry 5571 (class 0 OID 0)
-- Dependencies: 763
-- Name: pp_rels_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.pp_rels_id_seq', 1, false);


--
-- TOC entry 5572 (class 0 OID 0)
-- Dependencies: 764
-- Name: properties_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.properties_id_seq', 1, false);


--
-- TOC entry 5573 (class 0 OID 0)
-- Dependencies: 766
-- Name: property_annots_id_seq; Type: SEQUENCE SET; Schema: empty; Owner: -
--

SELECT pg_catalog.setval('empty.property_annots_id_seq', 1, false);


--
-- TOC entry 5028 (class 2606 OID 1965107)
-- Name: _h_classes _h_classes_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty._h_classes
    ADD CONSTRAINT _h_classes_pkey PRIMARY KEY (a, b);


--
-- TOC entry 5030 (class 2606 OID 1965109)
-- Name: annot_types annot_types_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.annot_types
    ADD CONSTRAINT annot_types_pkey PRIMARY KEY (id);


--
-- TOC entry 5063 (class 2606 OID 1965111)
-- Name: cc_rel_types cc_rel_types_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cc_rel_types
    ADD CONSTRAINT cc_rel_types_pkey PRIMARY KEY (id);


--
-- TOC entry 5065 (class 2606 OID 1965113)
-- Name: cc_rels cc_rels_class_1_id_class_2_id_type_id_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cc_rels
    ADD CONSTRAINT cc_rels_class_1_id_class_2_id_type_id_key UNIQUE (class_1_id, class_2_id, type_id);


--
-- TOC entry 5067 (class 2606 OID 1965115)
-- Name: cc_rels cc_rels_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cc_rels
    ADD CONSTRAINT cc_rels_pkey PRIMARY KEY (id);


--
-- TOC entry 5073 (class 2606 OID 1965117)
-- Name: class_annots class_annots_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.class_annots
    ADD CONSTRAINT class_annots_pkey PRIMARY KEY (id);


--
-- TOC entry 5033 (class 2606 OID 1965119)
-- Name: classes classes_iri_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.classes
    ADD CONSTRAINT classes_iri_key UNIQUE (iri);


--
-- TOC entry 5035 (class 2606 OID 1965121)
-- Name: classes classes_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);


--
-- TOC entry 5076 (class 2606 OID 1980530)
-- Name: cp_rel_types cp_rel_types_name_unique; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cp_rel_types
    ADD CONSTRAINT cp_rel_types_name_unique UNIQUE (name);


--
-- TOC entry 5078 (class 2606 OID 1965123)
-- Name: cp_rel_types cp_rel_types_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cp_rel_types
    ADD CONSTRAINT cp_rel_types_pkey PRIMARY KEY (id);


--
-- TOC entry 5042 (class 2606 OID 1965125)
-- Name: cp_rels cp_rels_class_id_property_id_type_id_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cp_rels
    ADD CONSTRAINT cp_rels_class_id_property_id_type_id_key UNIQUE (class_id, property_id, type_id);


--
-- TOC entry 5044 (class 2606 OID 1965127)
-- Name: cp_rels cp_rels_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cp_rels
    ADD CONSTRAINT cp_rels_pkey PRIMARY KEY (id);


--
-- TOC entry 5080 (class 2606 OID 1965129)
-- Name: cpc_rels cpc_rels_cp_rel_id_other_class_id_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cpc_rels
    ADD CONSTRAINT cpc_rels_cp_rel_id_other_class_id_key UNIQUE (cp_rel_id, other_class_id);


--
-- TOC entry 5082 (class 2606 OID 1965131)
-- Name: cpc_rels cpc_rels_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cpc_rels
    ADD CONSTRAINT cpc_rels_pkey PRIMARY KEY (id);


--
-- TOC entry 5084 (class 2606 OID 1965133)
-- Name: cpd_rels cpd_rels_cp_rel_id_datatype_id_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cpd_rels
    ADD CONSTRAINT cpd_rels_cp_rel_id_datatype_id_key UNIQUE (cp_rel_id, datatype_id);


--
-- TOC entry 5086 (class 2606 OID 1965135)
-- Name: cpd_rels cpd_rels_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cpd_rels
    ADD CONSTRAINT cpd_rels_pkey PRIMARY KEY (id);


--
-- TOC entry 5088 (class 2606 OID 1965137)
-- Name: datatypes datatypes_iri_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.datatypes
    ADD CONSTRAINT datatypes_iri_key UNIQUE (iri);


--
-- TOC entry 5090 (class 2606 OID 1965139)
-- Name: datatypes datatypes_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.datatypes
    ADD CONSTRAINT datatypes_pkey PRIMARY KEY (id);


--
-- TOC entry 5126 (class 2606 OID 1965940)
-- Name: instances instances_iri_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.instances
    ADD CONSTRAINT instances_iri_key UNIQUE (iri);


--
-- TOC entry 5128 (class 2606 OID 1965928)
-- Name: instances instances_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.instances
    ADD CONSTRAINT instances_pkey PRIMARY KEY (id);


--
-- TOC entry 5093 (class 2606 OID 1965141)
-- Name: ns ns_name_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.ns
    ADD CONSTRAINT ns_name_key UNIQUE (name);


--
-- TOC entry 5095 (class 2606 OID 1965143)
-- Name: ns ns_name_unique; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.ns
    ADD CONSTRAINT ns_name_unique UNIQUE (name);


--
-- TOC entry 5097 (class 2606 OID 1965145)
-- Name: ns ns_value_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.ns
    ADD CONSTRAINT ns_value_key UNIQUE (value);


--
-- TOC entry 5101 (class 2606 OID 1965147)
-- Name: pd_rels pd_rels_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pd_rels
    ADD CONSTRAINT pd_rels_pkey PRIMARY KEY (id);


--
-- TOC entry 5103 (class 2606 OID 1965149)
-- Name: pd_rels pd_rels_property_id_datatype_id_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pd_rels
    ADD CONSTRAINT pd_rels_property_id_datatype_id_key UNIQUE (property_id, datatype_id);


--
-- TOC entry 5105 (class 2606 OID 1965151)
-- Name: pp_rel_types pp_rel_types_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pp_rel_types
    ADD CONSTRAINT pp_rel_types_pkey PRIMARY KEY (id);


--
-- TOC entry 5117 (class 2606 OID 1965153)
-- Name: pp_rels pp_rels_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pp_rels
    ADD CONSTRAINT pp_rels_pkey PRIMARY KEY (id);


--
-- TOC entry 5119 (class 2606 OID 1965155)
-- Name: pp_rels pp_rels_property_1_id_property_2_id_type_id_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pp_rels
    ADD CONSTRAINT pp_rels_property_1_id_property_2_id_type_id_key UNIQUE (property_1_id, property_2_id, type_id);


--
-- TOC entry 5099 (class 2606 OID 1965157)
-- Name: ns prefixes_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.ns
    ADD CONSTRAINT prefixes_pkey PRIMARY KEY (id);


--
-- TOC entry 5059 (class 2606 OID 1965159)
-- Name: properties properties_iri_key; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.properties
    ADD CONSTRAINT properties_iri_key UNIQUE (iri);


--
-- TOC entry 5061 (class 2606 OID 1965161)
-- Name: properties properties_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.properties
    ADD CONSTRAINT properties_pkey PRIMARY KEY (id);


--
-- TOC entry 5122 (class 2606 OID 1965163)
-- Name: property_annots property_annots_pkey; Type: CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.property_annots
    ADD CONSTRAINT property_annots_pkey PRIMARY KEY (id);


--
-- TOC entry 5031 (class 1259 OID 1965164)
-- Name: fki_annot_types_ns_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_annot_types_ns_fk ON empty.annot_types USING btree (ns_id);


--
-- TOC entry 5068 (class 1259 OID 1965165)
-- Name: fki_cc_rels_class_1_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_cc_rels_class_1_fk ON empty.cc_rels USING btree (class_1_id);


--
-- TOC entry 5069 (class 1259 OID 1965166)
-- Name: fki_cc_rels_class_2_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_cc_rels_class_2_fk ON empty.cc_rels USING btree (class_2_id);


--
-- TOC entry 5070 (class 1259 OID 1965167)
-- Name: fki_cc_rels_type_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_cc_rels_type_fk ON empty.cc_rels USING btree (type_id);


--
-- TOC entry 5074 (class 1259 OID 1965168)
-- Name: fki_class_annots_class_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_class_annots_class_fk ON empty.class_annots USING btree (class_id);


--
-- TOC entry 5036 (class 1259 OID 1965169)
-- Name: fki_classes_ns_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_classes_ns_fk ON empty.classes USING btree (ns_id);


--
-- TOC entry 5045 (class 1259 OID 1965170)
-- Name: fki_cp_rels_class_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_cp_rels_class_fk ON empty.cp_rels USING btree (class_id);


--
-- TOC entry 5052 (class 1259 OID 1965171)
-- Name: fki_cp_rels_domain_classes_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_cp_rels_domain_classes_fk ON empty.properties USING btree (domain_class_id);


--
-- TOC entry 5046 (class 1259 OID 1965172)
-- Name: fki_cp_rels_property_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_cp_rels_property_fk ON empty.cp_rels USING btree (property_id);


--
-- TOC entry 5053 (class 1259 OID 1965173)
-- Name: fki_cp_rels_range_classes_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_cp_rels_range_classes_fk ON empty.properties USING btree (range_class_id);


--
-- TOC entry 5047 (class 1259 OID 1965174)
-- Name: fki_cp_rels_type_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_cp_rels_type_fk ON empty.cp_rels USING btree (type_id);


--
-- TOC entry 5091 (class 1259 OID 1965175)
-- Name: fki_datatypes_ns_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_datatypes_ns_fk ON empty.datatypes USING btree (ns_id);


--
-- TOC entry 5106 (class 1259 OID 1965176)
-- Name: fki_pp_rels_property_1_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_pp_rels_property_1_fk ON empty.pp_rels USING btree (property_1_id);


--
-- TOC entry 5107 (class 1259 OID 1965177)
-- Name: fki_pp_rels_property_2_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_pp_rels_property_2_fk ON empty.pp_rels USING btree (property_2_id);


--
-- TOC entry 5108 (class 1259 OID 1965178)
-- Name: fki_pp_rels_type_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_pp_rels_type_fk ON empty.pp_rels USING btree (type_id);


--
-- TOC entry 5054 (class 1259 OID 1965179)
-- Name: fki_properties_ns_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_properties_ns_fk ON empty.properties USING btree (ns_id);


--
-- TOC entry 5120 (class 1259 OID 1965180)
-- Name: fki_property_annots_class_fk; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX fki_property_annots_class_fk ON empty.property_annots USING btree (property_id);


--
-- TOC entry 5071 (class 1259 OID 1965181)
-- Name: idx_cc_rels_data; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_cc_rels_data ON empty.cc_rels USING gin (data);


--
-- TOC entry 5037 (class 1259 OID 1965182)
-- Name: idx_classes_cnt; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_classes_cnt ON empty.classes USING btree (cnt);


--
-- TOC entry 5038 (class 1259 OID 1965183)
-- Name: idx_classes_data; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_classes_data ON empty.classes USING gin (data);


--
-- TOC entry 5039 (class 1259 OID 1965184)
-- Name: idx_classes_iri; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_classes_iri ON empty.classes USING btree (iri);


--
-- TOC entry 5040 (class 1259 OID 1965185)
-- Name: idx_classes_large_superclass_id; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_classes_large_superclass_id ON empty.classes USING btree (large_superclass_id) INCLUDE (id);


--
-- TOC entry 5048 (class 1259 OID 1965186)
-- Name: idx_cp_rels_class_prop_data; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_cp_rels_class_prop_data ON empty.cp_rels USING btree (class_id, type_id, data_cnt DESC NULLS LAST) INCLUDE (property_id);


--
-- TOC entry 5049 (class 1259 OID 1965187)
-- Name: idx_cp_rels_class_prop_object; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_cp_rels_class_prop_object ON empty.cp_rels USING btree (class_id, type_id, object_cnt DESC NULLS LAST) INCLUDE (property_id);


--
-- TOC entry 5050 (class 1259 OID 1965188)
-- Name: idx_cp_rels_data; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_cp_rels_data ON empty.cp_rels USING gin (data);


--
-- TOC entry 5051 (class 1259 OID 1965189)
-- Name: idx_cp_rels_prop_class; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_cp_rels_prop_class ON empty.cp_rels USING btree (property_id, type_id, cnt DESC NULLS LAST) INCLUDE (class_id);


--
-- TOC entry 5123 (class 1259 OID 1966523)
-- Name: idx_instances_local_name; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_instances_local_name ON empty.instances USING btree (local_name text_pattern_ops);


--
-- TOC entry 5124 (class 1259 OID 1966534)
-- Name: idx_instances_test; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_instances_test ON empty.instances USING gin (test);


--
-- TOC entry 5109 (class 1259 OID 1965190)
-- Name: idx_pp_rels_data; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_pp_rels_data ON empty.pp_rels USING gin (data);


--
-- TOC entry 5110 (class 1259 OID 1965191)
-- Name: idx_pp_rels_p1_t_p2; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_pp_rels_p1_t_p2 ON empty.pp_rels USING btree (property_1_id, type_id, cnt DESC NULLS LAST) INCLUDE (property_2_id);


--
-- TOC entry 5111 (class 1259 OID 1965192)
-- Name: idx_pp_rels_p2_t_p1; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_pp_rels_p2_t_p1 ON empty.pp_rels USING btree (property_2_id, type_id, cnt DESC NULLS LAST) INCLUDE (property_1_id);


--
-- TOC entry 5112 (class 1259 OID 1965193)
-- Name: idx_pp_rels_property_1_type; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_pp_rels_property_1_type ON empty.pp_rels USING btree (property_1_id) INCLUDE (type_id);


--
-- TOC entry 5113 (class 1259 OID 1965194)
-- Name: idx_pp_rels_property_1_type_; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_pp_rels_property_1_type_ ON empty.pp_rels USING btree (property_1_id, type_id);


--
-- TOC entry 5114 (class 1259 OID 1965195)
-- Name: idx_pp_rels_property_2_type; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_pp_rels_property_2_type ON empty.pp_rels USING btree (property_2_id) INCLUDE (type_id);


--
-- TOC entry 5115 (class 1259 OID 1965196)
-- Name: idx_pp_rels_property_2_type_; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_pp_rels_property_2_type_ ON empty.pp_rels USING btree (property_2_id, type_id);


--
-- TOC entry 5055 (class 1259 OID 1965197)
-- Name: idx_properties_cnt; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_properties_cnt ON empty.properties USING btree (cnt);


--
-- TOC entry 5056 (class 1259 OID 1965198)
-- Name: idx_properties_data; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_properties_data ON empty.properties USING gin (data);


--
-- TOC entry 5057 (class 1259 OID 1965199)
-- Name: idx_properties_iri; Type: INDEX; Schema: empty; Owner: -
--

CREATE INDEX idx_properties_iri ON empty.properties USING btree (iri);


--
-- TOC entry 5129 (class 2606 OID 1965200)
-- Name: annot_types annot_types_ns_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.annot_types
    ADD CONSTRAINT annot_types_ns_fk FOREIGN KEY (ns_id) REFERENCES empty.ns(id) ON DELETE SET NULL NOT VALID;


--
-- TOC entry 5137 (class 2606 OID 1965205)
-- Name: cc_rels cc_rels_class_1_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cc_rels
    ADD CONSTRAINT cc_rels_class_1_fk FOREIGN KEY (class_1_id) REFERENCES empty.classes(id) ON DELETE CASCADE;


--
-- TOC entry 5138 (class 2606 OID 1965210)
-- Name: cc_rels cc_rels_class_2_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cc_rels
    ADD CONSTRAINT cc_rels_class_2_fk FOREIGN KEY (class_2_id) REFERENCES empty.classes(id) ON DELETE CASCADE;


--
-- TOC entry 5139 (class 2606 OID 1965215)
-- Name: cc_rels cc_rels_type_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cc_rels
    ADD CONSTRAINT cc_rels_type_fk FOREIGN KEY (type_id) REFERENCES empty.cc_rel_types(id) ON DELETE CASCADE;


--
-- TOC entry 5140 (class 2606 OID 1965220)
-- Name: class_annots class_annots_class_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.class_annots
    ADD CONSTRAINT class_annots_class_fk FOREIGN KEY (class_id) REFERENCES empty.classes(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 5141 (class 2606 OID 1965225)
-- Name: class_annots class_annots_type_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.class_annots
    ADD CONSTRAINT class_annots_type_fk FOREIGN KEY (type_id) REFERENCES empty.annot_types(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 5130 (class 2606 OID 1965230)
-- Name: classes classes_ns_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.classes
    ADD CONSTRAINT classes_ns_fk FOREIGN KEY (ns_id) REFERENCES empty.ns(id) ON DELETE SET NULL NOT VALID;


--
-- TOC entry 5131 (class 2606 OID 1965235)
-- Name: cp_rels cp_rels_class_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cp_rels
    ADD CONSTRAINT cp_rels_class_fk FOREIGN KEY (class_id) REFERENCES empty.classes(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 5132 (class 2606 OID 1965240)
-- Name: cp_rels cp_rels_property_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cp_rels
    ADD CONSTRAINT cp_rels_property_fk FOREIGN KEY (property_id) REFERENCES empty.properties(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 5133 (class 2606 OID 1965245)
-- Name: cp_rels cp_rels_type_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cp_rels
    ADD CONSTRAINT cp_rels_type_fk FOREIGN KEY (type_id) REFERENCES empty.cp_rel_types(id) NOT VALID;


--
-- TOC entry 5142 (class 2606 OID 1965250)
-- Name: cpc_rels cpc_rels_cp_rel_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cpc_rels
    ADD CONSTRAINT cpc_rels_cp_rel_fk FOREIGN KEY (cp_rel_id) REFERENCES empty.cp_rels(id) ON DELETE CASCADE;


--
-- TOC entry 5143 (class 2606 OID 1965255)
-- Name: cpc_rels cpc_rels_other_class_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cpc_rels
    ADD CONSTRAINT cpc_rels_other_class_fk FOREIGN KEY (other_class_id) REFERENCES empty.classes(id) ON DELETE CASCADE;


--
-- TOC entry 5144 (class 2606 OID 1965260)
-- Name: cpd_rels cpd_rels_cp_rel_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cpd_rels
    ADD CONSTRAINT cpd_rels_cp_rel_fk FOREIGN KEY (cp_rel_id) REFERENCES empty.cp_rels(id) ON DELETE CASCADE;


--
-- TOC entry 5145 (class 2606 OID 1965265)
-- Name: cpd_rels cpd_rels_datatype_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.cpd_rels
    ADD CONSTRAINT cpd_rels_datatype_fk FOREIGN KEY (datatype_id) REFERENCES empty.datatypes(id) ON DELETE CASCADE;


--
-- TOC entry 5146 (class 2606 OID 1965270)
-- Name: datatypes datatypes_ns_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.datatypes
    ADD CONSTRAINT datatypes_ns_fk FOREIGN KEY (ns_id) REFERENCES empty.ns(id) ON DELETE SET NULL NOT VALID;


--
-- TOC entry 5154 (class 2606 OID 1965934)
-- Name: instances instances_class_id_fkey; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.instances
    ADD CONSTRAINT instances_class_id_fkey FOREIGN KEY (class_id) REFERENCES empty.classes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- TOC entry 5155 (class 2606 OID 1965929)
-- Name: instances instances_ns_id_fkey; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.instances
    ADD CONSTRAINT instances_ns_id_fkey FOREIGN KEY (ns_id) REFERENCES empty.ns(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- TOC entry 5147 (class 2606 OID 1965275)
-- Name: pd_rels pd_rels_datatype_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pd_rels
    ADD CONSTRAINT pd_rels_datatype_fk FOREIGN KEY (datatype_id) REFERENCES empty.datatypes(id) ON DELETE CASCADE;


--
-- TOC entry 5148 (class 2606 OID 1965280)
-- Name: pd_rels pd_rels_property_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pd_rels
    ADD CONSTRAINT pd_rels_property_fk FOREIGN KEY (property_id) REFERENCES empty.properties(id) ON DELETE CASCADE;


--
-- TOC entry 5149 (class 2606 OID 1965285)
-- Name: pp_rels pp_rels_property_1_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pp_rels
    ADD CONSTRAINT pp_rels_property_1_fk FOREIGN KEY (property_1_id) REFERENCES empty.properties(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 5150 (class 2606 OID 1965290)
-- Name: pp_rels pp_rels_property_2_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pp_rels
    ADD CONSTRAINT pp_rels_property_2_fk FOREIGN KEY (property_2_id) REFERENCES empty.properties(id) ON DELETE CASCADE NOT VALID;


--
-- TOC entry 5151 (class 2606 OID 1965295)
-- Name: pp_rels pp_rels_type_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.pp_rels
    ADD CONSTRAINT pp_rels_type_fk FOREIGN KEY (type_id) REFERENCES empty.pp_rel_types(id) NOT VALID;


--
-- TOC entry 5134 (class 2606 OID 1965300)
-- Name: properties properties_domain_class_id_fkey; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.properties
    ADD CONSTRAINT properties_domain_class_id_fkey FOREIGN KEY (domain_class_id) REFERENCES empty.classes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- TOC entry 5135 (class 2606 OID 1965305)
-- Name: properties properties_ns_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.properties
    ADD CONSTRAINT properties_ns_fk FOREIGN KEY (ns_id) REFERENCES empty.ns(id) ON DELETE SET NULL NOT VALID;


--
-- TOC entry 5136 (class 2606 OID 1965310)
-- Name: properties properties_range_class_id_fkey; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.properties
    ADD CONSTRAINT properties_range_class_id_fkey FOREIGN KEY (range_class_id) REFERENCES empty.classes(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- TOC entry 5152 (class 2606 OID 1965315)
-- Name: property_annots property_annots_property_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.property_annots
    ADD CONSTRAINT property_annots_property_fk FOREIGN KEY (property_id) REFERENCES empty.properties(id) ON DELETE CASCADE;


--
-- TOC entry 5153 (class 2606 OID 1965320)
-- Name: property_annots property_annots_type_fk; Type: FK CONSTRAINT; Schema: empty; Owner: -
--

ALTER TABLE ONLY empty.property_annots
    ADD CONSTRAINT property_annots_type_fk FOREIGN KEY (type_id) REFERENCES empty.annot_types(id) ON DELETE CASCADE;


--
-- TOC entry 5522 (class 0 OID 0)
-- Dependencies: 11
-- Name: SCHEMA empty; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA empty TO rdfgroup;


--
-- TOC entry 5524 (class 0 OID 0)
-- Dependencies: 733
-- Name: TABLE _h_classes; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty._h_classes TO rdfgroup;


--
-- TOC entry 5525 (class 0 OID 0)
-- Dependencies: 734
-- Name: TABLE annot_types; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.annot_types TO rdfgroup;


--
-- TOC entry 5526 (class 0 OID 0)
-- Dependencies: 736
-- Name: TABLE classes; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.classes TO rdfgroup;


--
-- TOC entry 5527 (class 0 OID 0)
-- Dependencies: 737
-- Name: TABLE cp_rels; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.cp_rels TO rdfgroup;


--
-- TOC entry 5528 (class 0 OID 0)
-- Dependencies: 738
-- Name: TABLE properties; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.properties TO rdfgroup;


--
-- TOC entry 5529 (class 0 OID 0)
-- Dependencies: 739
-- Name: TABLE c_links; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.c_links TO rdfgroup;


--
-- TOC entry 5530 (class 0 OID 0)
-- Dependencies: 740
-- Name: TABLE cc_rel_types; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.cc_rel_types TO rdfgroup;


--
-- TOC entry 5531 (class 0 OID 0)
-- Dependencies: 742
-- Name: TABLE cc_rels; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.cc_rels TO rdfgroup;


--
-- TOC entry 5532 (class 0 OID 0)
-- Dependencies: 744
-- Name: TABLE class_annots; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.class_annots TO rdfgroup;


--
-- TOC entry 5533 (class 0 OID 0)
-- Dependencies: 747
-- Name: TABLE cp_rel_types; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.cp_rel_types TO rdfgroup;


--
-- TOC entry 5534 (class 0 OID 0)
-- Dependencies: 750
-- Name: TABLE cpc_rels; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.cpc_rels TO rdfgroup;


--
-- TOC entry 5535 (class 0 OID 0)
-- Dependencies: 752
-- Name: TABLE cpd_rels; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.cpd_rels TO rdfgroup;


--
-- TOC entry 5536 (class 0 OID 0)
-- Dependencies: 754
-- Name: TABLE datatypes; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.datatypes TO rdfgroup;


--
-- TOC entry 5537 (class 0 OID 0)
-- Dependencies: 795
-- Name: TABLE instances; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.instances TO rdfgroup;


--
-- TOC entry 5538 (class 0 OID 0)
-- Dependencies: 756
-- Name: TABLE ns; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.ns TO rdfgroup;


--
-- TOC entry 5539 (class 0 OID 0)
-- Dependencies: 758
-- Name: TABLE pd_rels; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.pd_rels TO rdfgroup;


--
-- TOC entry 5540 (class 0 OID 0)
-- Dependencies: 760
-- Name: TABLE pp_rel_types; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.pp_rel_types TO rdfgroup;


--
-- TOC entry 5541 (class 0 OID 0)
-- Dependencies: 762
-- Name: TABLE pp_rels; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.pp_rels TO rdfgroup;


--
-- TOC entry 5542 (class 0 OID 0)
-- Dependencies: 765
-- Name: TABLE property_annots; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.property_annots TO rdfgroup;


--
-- TOC entry 5543 (class 0 OID 0)
-- Dependencies: 767
-- Name: TABLE v_cc_rels; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.v_cc_rels TO rdfgroup;


--
-- TOC entry 5544 (class 0 OID 0)
-- Dependencies: 768
-- Name: TABLE v_classes_ns; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.v_classes_ns TO rdfgroup;


--
-- TOC entry 5545 (class 0 OID 0)
-- Dependencies: 769
-- Name: TABLE v_classes_ns_main; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.v_classes_ns_main TO rdfgroup;


--
-- TOC entry 5546 (class 0 OID 0)
-- Dependencies: 770
-- Name: TABLE v_classes_ns_plus; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.v_classes_ns_plus TO rdfgroup;


--
-- TOC entry 5547 (class 0 OID 0)
-- Dependencies: 771
-- Name: TABLE v_classes_ns_main_plus; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.v_classes_ns_main_plus TO rdfgroup;


--
-- TOC entry 5548 (class 0 OID 0)
-- Dependencies: 772
-- Name: TABLE v_classes_ns_main_v01; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.v_classes_ns_main_v01 TO rdfgroup;


--
-- TOC entry 5549 (class 0 OID 0)
-- Dependencies: 773
-- Name: TABLE v_cp_rels; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.v_cp_rels TO rdfgroup;


--
-- TOC entry 5550 (class 0 OID 0)
-- Dependencies: 820
-- Name: TABLE v_cp_rels_card; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.v_cp_rels_card TO rdfgroup;


--
-- TOC entry 5551 (class 0 OID 0)
-- Dependencies: 774
-- Name: TABLE v_pp_rels_names; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.v_pp_rels_names TO rdfgroup;


--
-- TOC entry 5552 (class 0 OID 0)
-- Dependencies: 775
-- Name: TABLE v_properties_ns; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.v_properties_ns TO rdfgroup;


--
-- TOC entry 5553 (class 0 OID 0)
-- Dependencies: 776
-- Name: TABLE v_properties_sources; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.v_properties_sources TO rdfgroup;


--
-- TOC entry 5554 (class 0 OID 0)
-- Dependencies: 777
-- Name: TABLE v_properties_sources_single; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.v_properties_sources_single TO rdfgroup;


--
-- TOC entry 5555 (class 0 OID 0)
-- Dependencies: 778
-- Name: TABLE v_properties_targets; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.v_properties_targets TO rdfgroup;


--
-- TOC entry 5556 (class 0 OID 0)
-- Dependencies: 779
-- Name: TABLE v_properties_targets_single; Type: ACL; Schema: empty; Owner: -
--

GRANT SELECT ON TABLE empty.v_properties_targets_single TO rdfgroup;


--
-- TOC entry 3923 (class 826 OID 1965325)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: empty; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA empty GRANT USAGE ON SEQUENCES  TO rdf;


--
-- TOC entry 3924 (class 826 OID 1965326)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: empty; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE rdf IN SCHEMA empty GRANT SELECT,INSERT,DELETE,UPDATE ON TABLES  TO rdf;


--
-- TOC entry 3925 (class 826 OID 1965327)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: empty; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA empty GRANT ALL ON TABLES  TO rdf;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA empty GRANT SELECT ON TABLES  TO rdfgroup;


-- Completed on 2022-05-27 17:27:12 EEST

--
-- PostgreSQL database dump complete
--

