This is a repo for my personal site.

- The professional pages (`index.html`, `404.html`) are plain static HTML/CSS,
  no build step, no dependencies.
- The `/writing/` blog section is built with Jekyll: posts live in `_posts/`
  as Markdown files and are rendered to HTML on push. GitHub Pages builds
  this automatically.

To preview locally:

```
bundle install
bundle exec jekyll serve
```
