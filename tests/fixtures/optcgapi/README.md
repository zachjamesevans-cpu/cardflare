# OPTCG API fixtures

**These are hand-written stand-ins, not real provider responses.**

`npm run cards:probe` overwrites them with genuine (redacted) records from the
live API. Until that has been run, nothing here describes optcgapi.com's actual
schema — it exercises the adapter's handling of shapes any provider might
produce: strings where numbers belong, absent optional fields, a record that is
not an object at all.

The tests that use them assert _behaviour under those shapes_, which is valid
regardless of the real field names. They cannot and do not confirm the field
mapping. That is what the probe is for, and why `MAPPING_STATUS` gates the sync.
