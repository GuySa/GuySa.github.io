#!/usr/bin/env python3
"""Fetch recent arXiv math submissions and write them to a static JSON file.

Runs once a day from a GitHub Actions workflow (see .github/workflows/pages.yml).
The output is consumed client-side by /arxiv/ so visitors can pick their own
categories without another network round trip to arXiv (whose API doesn't send
CORS headers, so it can't be fetched from the browser directly).
"""
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone

API_URL = "https://export.arxiv.org/api/query"
ATOM_NS = "{http://www.w3.org/2005/Atom}"
ARXIV_NS = "{http://arxiv.org/schemas/atom}"

# The rolling window of "new" submissions to keep, based on original
# submission (v1) date. 4 days comfortably bridges weekends/holidays when
# arXiv doesn't announce.
WINDOW_DAYS = 4

MAX_RESULTS = 1000

# All arXiv math.* categories (the site's audience), with display names.
CATEGORIES = [
    ("math.AC", "Commutative Algebra"),
    ("math.AG", "Algebraic Geometry"),
    ("math.AP", "Analysis of PDEs"),
    ("math.AT", "Algebraic Topology"),
    ("math.CA", "Classical Analysis and ODEs"),
    ("math.CO", "Combinatorics"),
    ("math.CT", "Category Theory"),
    ("math.CV", "Complex Variables"),
    ("math.DG", "Differential Geometry"),
    ("math.DS", "Dynamical Systems"),
    ("math.FA", "Functional Analysis"),
    ("math.GM", "General Mathematics"),
    ("math.GN", "General Topology"),
    ("math.GR", "Group Theory"),
    ("math.GT", "Geometric Topology"),
    ("math.HO", "History and Overview"),
    ("math.IT", "Information Theory"),
    ("math.KT", "K-Theory and Homology"),
    ("math.LO", "Logic"),
    ("math.MG", "Metric Geometry"),
    ("math.MP", "Mathematical Physics"),
    ("math.NA", "Numerical Analysis"),
    ("math.NT", "Number Theory"),
    ("math.OA", "Operator Algebras"),
    ("math.OC", "Optimization and Control"),
    ("math.PR", "Probability"),
    ("math.QA", "Quantum Algebra"),
    ("math.RA", "Rings and Algebras"),
    ("math.RT", "Representation Theory"),
    ("math.SG", "Symplectic Geometry"),
    ("math.SP", "Spectral Theory"),
    ("math.ST", "Statistics Theory"),
]


def fetch_page(start, max_results):
    search_query = " OR ".join(f"cat:{code}" for code, _ in CATEGORIES)
    params = {
        "search_query": search_query,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
        "start": start,
        "max_results": max_results,
    }
    url = API_URL + "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote_plus)
    req = urllib.request.Request(url, headers={"User-Agent": "guysa-arxiv-digest/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def parse_entries(xml_bytes):
    root = ET.fromstring(xml_bytes)
    for entry in root.findall(f"{ATOM_NS}entry"):
        raw_id = entry.findtext(f"{ATOM_NS}id", "")
        arxiv_id = raw_id.rsplit("/", 1)[-1]
        arxiv_id_noversion = arxiv_id.split("v")[0]

        title = " ".join(entry.findtext(f"{ATOM_NS}title", "").split())
        abstract = " ".join(entry.findtext(f"{ATOM_NS}summary", "").split())
        published = entry.findtext(f"{ATOM_NS}published", "")
        updated = entry.findtext(f"{ATOM_NS}updated", "")

        authors = [
            a.findtext(f"{ATOM_NS}name", "").strip()
            for a in entry.findall(f"{ATOM_NS}author")
        ]

        primary_elem = entry.find(f"{ARXIV_NS}primary_category")
        primary_category = primary_elem.get("term") if primary_elem is not None else None

        categories = [c.get("term") for c in entry.findall(f"{ATOM_NS}category")]

        comment = entry.findtext(f"{ARXIV_NS}comment")
        journal_ref = entry.findtext(f"{ARXIV_NS}journal_ref")
        doi = entry.findtext(f"{ARXIV_NS}doi")

        pdf_url = None
        for link in entry.findall(f"{ATOM_NS}link"):
            if link.get("title") == "pdf":
                pdf_url = link.get("href")

        yield {
            "id": arxiv_id_noversion,
            "title": title,
            "authors": authors,
            "abstract": abstract,
            "primary_category": primary_category,
            "categories": categories,
            "published": published,
            "updated": updated,
            "comment": comment,
            "journal_ref": journal_ref,
            "doi": doi,
            "abs_url": f"https://arxiv.org/abs/{arxiv_id_noversion}",
            "pdf_url": pdf_url or f"https://arxiv.org/pdf/{arxiv_id_noversion}",
        }


def main():
    cutoff = datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)

    # arXiv's sortBy=submittedDate is keyed on the returned version's
    # announce/update timestamp, not the original (v1) published date, so a
    # recently-revised old paper can surface ahead of genuinely new ones.
    # Rather than stop as soon as we see one paper below the cutoff, page
    # through everything (up to MAX_RESULTS) and filter by published date
    # afterwards, so a stray old-but-updated entry can't cut the fetch short.
    papers = {}
    start = 0
    page_size = 200
    while start < MAX_RESULTS:
        batch = min(page_size, MAX_RESULTS - start)
        try:
            xml_bytes = fetch_page(start, batch)
            entries = list(parse_entries(xml_bytes))
        except (OSError, ET.ParseError) as exc:
            print(f"error fetching start={start}: {exc}", file=sys.stderr)
            break

        if not entries:
            break
        for paper in entries:
            try:
                published_dt = datetime.fromisoformat(paper["published"].replace("Z", "+00:00"))
            except ValueError:
                continue
            if published_dt < cutoff:
                continue
            # Keep the newest-seen record per paper id (dedupes across pages).
            papers[paper["id"]] = paper

        start += batch
        time.sleep(3)  # be polite to arXiv's API

    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "window_days": WINDOW_DAYS,
        "categories": [{"code": code, "name": name} for code, name in CATEGORIES],
        "papers": sorted(papers.values(), key=lambda p: p["published"], reverse=True),
    }

    with open("assets/data/arxiv.json", "w") as f:
        json.dump(result, f, indent=0, separators=(",", ":"))

    print(f"wrote {len(result['papers'])} papers to assets/data/arxiv.json")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001 - a stale/missing digest beats blocking the whole site deploy
        print(f"fetch_arxiv.py failed: {exc}", file=sys.stderr)
