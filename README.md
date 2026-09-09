This is a repo for my personal site.

- The professional pages (`index.html`, `404.html`) are plain static HTML/CSS,
  no build step, no dependencies.
- The `/writing/` blog section is built with Jekyll: posts live in `_posts/`
  as Markdown files and are rendered to HTML on push. GitHub Pages builds
  this automatically.
- The `/arxiv/` digest page reads `assets/data/arxiv.json`, which is
  regenerated on every deploy by `.github/workflows/pages.yml` (via
  `scripts/fetch_arxiv.py`) and is gitignored — it's never committed. If it's
  missing, the page's category search has nothing to load and silently does
  nothing.

To preview locally:

```
bundle install
python3 scripts/fetch_arxiv.py
bundle exec jekyll serve
```
