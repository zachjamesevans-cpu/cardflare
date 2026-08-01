# OPTCG API fixtures

`allSetCards.json` is a **real record**, observed from
`https://optcgapi.com/api/allSetCards/` on 2 August 2026. It is one record, kept
deliberately small; the endpoint returns thousands.

`synthetic-cards.json` is hand-written and is **not** provider output. It
exercises shapes the adapter must survive — numbers as strings, `"-"` for
inapplicable, absent optional fields, an insecure image URL, a record that is
not an object — which a single real record cannot cover.

`npm run cards:probe` regenerates observed fixtures for every endpoint. Only
`allSetCards` has been observed so far: the starter-deck, promo and DON!!
shapes are still unverified.
