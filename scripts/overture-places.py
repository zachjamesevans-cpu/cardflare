"""
Reads candidate places out of Overture Maps, for the Store Discovery console.

WHY THIS IS A SCRIPT AND NOT A ROUTE. Overture Places has no hosted query
API: it is GeoParquet on S3, and the way to ask it a question is DuckDB
over remote files. That does not belong in a Next.js request - it wants
real memory and takes as long as it takes - so discovery is an admin act
run from a terminal, which is also the shape the founder chose.

NOT A SCRAPER. It reads one published open dataset over its documented
S3 path. No crawling, no browser, no other provider.

Licence, per the Overture attribution docs: the Places theme is published
under a MIX of CDLA Permissive 2.0, Apache 2.0 and CC0 1.0, and carries no
OpenStreetMap data or ODbL obligation. Attribution travels with the
records: "Overture Maps Foundation, overturemaps.org".

Prints JSON on stdout. It never writes to CardFlare's database - importing
is a separate, human decision in the console.
"""

import json
import math
import sys

import duckdb

RELEASE = "2026-08-19.0"
PLACES = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*"

MILES_PER_DEGREE_LAT = 69.0


def bounding_box(lat: float, lon: float, radius_miles: float):
    lat_span = radius_miles / MILES_PER_DEGREE_LAT
    shrink = max(math.cos(math.radians(lat)), 0.01)
    lon_span = radius_miles / (MILES_PER_DEGREE_LAT * shrink)
    return (lat - lat_span, lat + lat_span, lon - lon_span, lon + lon_span)


def main() -> int:
    if len(sys.argv) < 4:
        print("usage: overture-places.py <lat> <lon> <radius_miles>", file=sys.stderr)
        return 2

    lat, lon, radius = float(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3])
    min_lat, max_lat, min_lon, max_lon = bounding_box(lat, lon, radius)

    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")

    # The schema has moved: `categories` is deprecated in favour of
    # `taxonomy` and `basic_category`. Ask what this release actually has
    # rather than assuming, so a rename is a smaller column list and not a
    # crash.
    columns = {
        row[0]
        for row in con.execute(
            f"DESCRIBE SELECT * FROM read_parquet('{PLACES}', hive_partitioning=1) LIMIT 0"
        ).fetchall()
    }

    # `taxonomy.primary` is where the real signal is. `basic_category` is
    # a ~280-value coarse label and far too blunt on its own: Austin's
    # best-known game store is not under it at all, and its
    # `toys_and_games_store` is mostly actual toy shops. Both are read,
    # and `operating_status` too - which the release HAS, whatever the
    # published field list says.
    for needed in ("taxonomy", "basic_category", "operating_status"):
        if needed not in columns:
            print(f"release is missing {needed}", file=sys.stderr)
            return 1

    query = f"""
      SELECT
        id,
        names.primary                      AS name,
        taxonomy.primary                   AS category,
        basic_category                     AS basic_category,
        operating_status                   AS operating_status,
        confidence,
        addresses[1].freeform              AS address_line,
        addresses[1].locality              AS city,
        addresses[1].region                AS region,
        addresses[1].postcode              AS postal_code,
        addresses[1].country               AS country,
        bbox.xmin                          AS lon,
        bbox.ymin                          AS lat,
        websites[1]                        AS website,
        phones[1]                          AS phone,
        sources
      FROM read_parquet('{PLACES}', hive_partitioning=1)
      WHERE bbox.ymin BETWEEN {min_lat} AND {max_lat}
        AND bbox.xmin BETWEEN {min_lon} AND {max_lon}
        -- A prefilter, so the review set is a few hundred rows rather
        -- than a hundred thousand. Deliberately generous - it is the
        -- relevance rules that judge, not this - but keyed on the exact
        -- taxonomy values the data actually uses plus a name sweep.
        AND (
          CAST(taxonomy.primary AS VARCHAR) IN (
            'hobby_shop', 'comic_books_store', 'toy_store',
            'collectibles_store', 'game_store', 'board_game_store',
            'trading_card_store', 'toys_and_games_store'
          )
          OR regexp_matches(
            lower(names.primary),
            '(^| )(game|games|gaming|tcg|comic|comics|hobby|collectibles|dice|guild|tabletop)( |$)'
          )
        )
    """

    rows = con.execute(query).fetchall()
    names = [d[0] for d in con.description]

    out = []
    for row in rows:
        record = dict(zip(names, row))
        out.append(record)

    print(json.dumps(out, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
