# ZIP centroids

`zcta-centroids.json` maps a five-digit US ZIP Code Tabulation Area to the
centroid of that area, rounded to four decimal places (about eleven metres,
which is far finer than anything CardFlare shows).

**Source:** US Census Bureau, 2023 Gazetteer Files, ZIP Code Tabulation Areas
(`2023_Gaz_zcta_national.zip`). Works of the US federal government are in the
**public domain**, so there is no licence to carry and no attribution required —
though saying where it came from is the point of this file.

**Why bundled rather than an API.** A geocoding service would see a user's
location on every lookup, cost money per request, and be a third party we asked
the founder to approve. A ZIP is coarse by construction and the table is a
megabyte, so it ships with the app instead.

**Why a ZCTA and not a "ZIP code".** The Postal Service does not publish ZIP
boundaries; a ZCTA is the Census Bureau's approximation of one from the blocks
it covers. For "which stores are near this person" that difference is invisible.

Regenerate with `scripts/build-zip-centroids.ts` if a newer Gazetteer lands.
