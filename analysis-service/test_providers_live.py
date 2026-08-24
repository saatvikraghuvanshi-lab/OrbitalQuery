"""
Live provider reachability test.

Tests each registered provider with a real STAC search:
  - Hyderabad bbox: [78.3, 17.2, 78.6, 17.5]
  - Collection: sentinel-2-l2a
  - Date: 2024-01-01 to 2024-06-30
  - Cloud cover: < 30%

Run:
  cd analysis-service
  ./venv/Scripts/python.exe test_providers_live.py
"""

import sys
import time

# Hyderabad bbox
BBOX = [78.3, 17.2, 78.6, 17.5]
DATETIME = "2024-01-01/2024-06-30"
COLLECTION = "sentinel-2-l2a"
MAX_CLOUD = 30
LIMIT = 3


def test_planetary_computer():
    """Test Planetary Computer STAC API."""
    print("\n📡 Testing Planetary Computer...")
    try:
        from pystac_client import Client
        import planetary_computer as pc

        client = Client.open(
            "https://planetarycomputer.microsoft.com/api/stac/v1",
            modifier=pc.sign_inplace,
        )
        results = client.search(
            collections=[COLLECTION],
            bbox=BBOX,
            datetime=DATETIME,
            query={"eo:cloud_cover": {"lt": MAX_CLOUD}},
            max_items=LIMIT,
        )
        items = list(results.items())
        total = results.matched()

        if items:
            item = items[0]
            print(f"  ✅ Found {total} matches, returned {len(items)}")
            print(f"  📌 First scene: {item.id}")
            print(f"  📅 Date: {item.properties.get('datetime', 'N/A')}")
            print(f"  ☁️  Cloud: {item.properties.get('eo:cloud_cover', 'N/A')}%")
            print(f"  🛰️  Platform: {item.properties.get('platform', 'N/A')}")
            # Check if assets exist
            assets = list(item.assets.keys())
            print(f"  📦 Assets: {len(assets)} ({', '.join(assets[:5])}...)")
            return True, total
        else:
            print(f"  ⚠️  No results found")
            return False, 0

    except Exception as e:
        print(f"  ❌ Failed: {e}")
        return False, 0


def test_aws_earth_search():
    """Test AWS Earth Search STAC API."""
    print("\n📡 Testing AWS Earth Search...")
    try:
        from pystac_client import Client

        client = Client.open("https://earth-search.aws.element84.com/v1")
        results = client.search(
            collections=[COLLECTION],
            bbox=BBOX,
            datetime=DATETIME,
            query={"eo:cloud_cover": {"lt": MAX_CLOUD}},
            max_items=LIMIT,
        )
        items = list(results.items())
        total = results.matched()

        if items:
            item = items[0]
            print(f"  ✅ Found {total} matches, returned {len(items)}")
            print(f"  📌 First scene: {item.id}")
            print(f"  📅 Date: {item.properties.get('datetime', 'N/A')}")
            print(f"  ☁️  Cloud: {item.properties.get('eo:cloud_cover', 'N/A')}%")
            print(f"  🛰️  Platform: {item.properties.get('platform', 'N/A')}")
            assets = list(item.assets.keys())
            print(f"  📦 Assets: {len(assets)} ({', '.join(assets[:5])}...)")
            # Check if assets are accessible
            if 'visual' in item.assets:
                href = item.assets['visual'].href
                print(f"  🔗 Visual href: {href[:80]}...")
            return True, total
        else:
            print(f"  ⚠️  No results found")
            return False, 0

    except Exception as e:
        print(f"  ❌ Failed: {e}")
        return False, 0


def test_copernicus_cdse():
    """Test Copernicus Data Space STAC API (CCM collections)."""
    print("\nTesting Copernicus CDSE (CCM collections)...")
    try:
        import httpx

        # CDSE STAC only has CCM collections, not raw Sentinel
        # Use OData catalogue for Sentinel data verification
        resp = httpx.get(
            "https://catalogue.dataspace.copernicus.eu/odata/v1/Products",
            params={
                "$filter": (
                    "Collection/Name eq 'SENTINEL-2' "
                    "and OData.CSC.Intersects(area=geography'SRID=4326;POINT(78.45 17.35)') "
                    "and ContentDate/Start gt 2024-01-01T00:00:00.000Z "
                    "and ContentDate/Start lt 2024-03-01T00:00:00.000Z"
                ),
                "$top": str(LIMIT),
                "$orderby": "ContentDate/Start desc",
            },
            timeout=15,
        )
        data = resp.json()
        products = data.get("value", [])

        if products:
            p = products[0]
            print(f"  OK - Found {len(products)} products via OData catalogue")
            print(f"  First scene: {p.get('Name', 'N/A')[:60]}")
            print(f"  Date: {p.get('ContentDate', {}).get('Start', 'N/A')}")
            print(f"  Id: {p.get('Id', 'N/A')[:40]}...")
            return True, len(products)
        else:
            print("  No results found")
            return False, 0

    except Exception as e:
        print(f"  Failed: {e}")
        return False, 0


def test_nasa_cmr():
    """Test NASA CMR — MODIS NDVI."""
    print("\nTesting NASA CMR (MODIS NDVI)...")
    try:
        import httpx

        resp = httpx.get(
            "https://cmr.earthdata.nasa.gov/search/granules.json",
            params={
                "collection_concept_id": "C1748066515-LPCLOUD",
                "bounding_box": "78.3,17.2,78.6,17.5",
                "temporal": "2024-01-01T00:00:00Z,2024-06-30T00:00:00Z",
                "page_size": str(LIMIT),
                "sort_key": "-start_date",
            },
            timeout=15,
        )
        data = resp.json()
        entries = data.get("feed", {}).get("entry", [])
        hits = data.get("feed", {}).get("hits", 0)

        if entries:
            e = entries[0]
            print(f"  OK - Found {hits} granules, returned {len(entries)}")
            print(f"  First granule: {e.get('title', 'N/A')[:60]}")
            print(f"  Date: {e.get('time_start', 'N/A')}")
            links = e.get("links", [])
            print(f"  Links: {len(links)}")
            return True, hits
        else:
            print("  No results found")
            return False, 0

    except Exception as e:
        print(f"  Failed: {e}")
        return False, 0


def main():
    import io
    import os
    if os.name == 'nt':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    print("=" * 60)
    print("OrbitalQuery - Live Provider Reachability Test")
    print("=" * 60)
    print(f"AOI: Hyderabad [{', '.join(str(b) for b in BBOX)}]")
    print(f"Period: {DATETIME}")
    print(f"Collection: {COLLECTION}")
    print(f"Max cloud: {MAX_CLOUD}%")

    results = {}

    for name, test_fn in [
        ("Planetary Computer", test_planetary_computer),
        ("AWS Earth Search", test_aws_earth_search),
        ("Copernicus CDSE", test_copernicus_cdse),
        ("NASA CMR", test_nasa_cmr),
    ]:
        start = time.time()
        ok, count = test_fn()
        elapsed = time.time() - start
        results[name] = {"ok": ok, "count": count, "time": elapsed}

    # Summary
    print("\n" + "=" * 60)
    print("📊 Summary")
    print("=" * 60)
    for name, r in results.items():
        status = "✅" if r["ok"] else "❌"
        count_str = f"{r['count']} scenes" if r["count"] and r["count"] > 0 else "no data"
        print(f"  {status} {name}: {count_str} ({r['time']:.1f}s)")

    reachable = sum(1 for r in results.values() if r["ok"])
    print(f"\n  {reachable}/{len(results)} providers reachable")

    if reachable == 0:
        print("\n  ⚠️  No providers reachable. Check network connectivity.")
        sys.exit(1)
    else:
        print("\n  ✅ At least one provider is working.")
        sys.exit(0)


if __name__ == "__main__":
    main()
