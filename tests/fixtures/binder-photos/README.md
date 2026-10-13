# Real binder photos

Photos of real binder pages, for `tests/unit/real-binder-photos.test.ts`
and `npm run scan:compare`. Drop a photo here (`page-1.jpg`) with its
right answers beside it (`page-1.json`):

```json
{
  "pockets": [
    { "slot": "A1", "number": "OP01-120" },
    { "slot": "A2", "empty": true },
    { "slot": "B2", "number": "OP06-118" }
  ]
}
```

Every pocket should be listed: `empty: true`, or the collector number
printed on the card. The unit test checks that the page is found (or that
the player would be asked to line it up, never a wrong guess) and that
exactly the empty pockets come out empty. It needs no keys and spends
nothing. `npm run scan:compare -- tests/fixtures/binder-photos/page-1.jpg`
reads the cards too, with real API credit, and scores each mode against
the numbers.
