-- add a table for tag definitions

drop table if exists public.schemata_tags;

create table if not exists public.schemata_tags (
  id integer not null generated always as identity,
  name text not null,
  display_name text not null,
  description text,
  is_active boolean not null default true,
  constraint schemata_tags_pkey primary key(id),
  constraint schemata_tags_display_name_unique unique(display_name),
  constraint schemata_tags_name_unique unique(name)
);
-- insert into public.schemata_tags (name, display_name) values ('test1', 'test 1');
-- insert into public.schemata_tags (name, display_name) values ('test2', 'test two');

alter table if exists public.schemata_tags
    owner to rdf;

grant all on
table public.schemata_tags to rdf;
-- add a 'tags' column to the 'schemata' table

alter table public.schemata add column tags text[] not null default '{}';
-- update the schemata view

drop view if exists public.v_configurations;

create or replace
view public.v_configurations
 as
 select
	s.id,
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
from
	schemata s,
	endpoints e
where
	e.id = s.endpoint_id
order by
	s.order_inx,
	s.id;

alter table public.v_configurations
    owner to rdf;
