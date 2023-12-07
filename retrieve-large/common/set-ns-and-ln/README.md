# set-ns-and-ln

This module goes over entries in the tables `classes` and `properties`, deriving `ns_id` and `display_name` values from the `iri` value.

As this operation relies on the `ns` table, columns `name` and `value` for the prefix abbreviation and the prefix itself, you should prepopulate its entries accoringly to the endpoint specifics.

# Hot to run

- Using the `.env` file, print the module to the correct database and schema.

- Run the module as follows:

```
cd set-ns-and-ln
node .
```