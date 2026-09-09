(function () {
  "use strict";

  var DATA_URL = "/assets/data/arxiv.json";
  var STORAGE_KEY = "arxivDigest.categories";
  var DEFAULT_CATEGORIES = ["math.AG", "math.NT"];

  var searchInput = document.getElementById("arxiv-search");
  var categoryListEl = document.getElementById("arxiv-category-list");
  var metaEl = document.getElementById("arxiv-meta");
  var resultsEl = document.getElementById("arxiv-results");

  var allCategories = [];
  var selected = new Set();
  var papersByCategory = null; // populated once data loads

  function categoriesFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var raw = params.get("cats");
    if (!raw) return null;
    return raw.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function categoriesFromStorage() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function persistSelection() {
    var codes = Array.from(selected);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
    } catch (e) { /* ignore (private browsing, etc.) */ }

    var url = new URL(window.location.href);
    if (codes.length) {
      url.searchParams.set("cats", codes.join(","));
    } else {
      url.searchParams.delete("cats");
    }
    window.history.replaceState(null, "", url.toString());
  }

  function renderCategoryChips(filterText) {
    var query = (filterText || "").trim().toLowerCase();
    categoryListEl.innerHTML = "";

    allCategories
      .filter(function (cat) {
        if (!query) return true;
        return (
          cat.code.toLowerCase().indexOf(query) !== -1 ||
          cat.name.toLowerCase().indexOf(query) !== -1
        );
      })
      .forEach(function (cat) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chip" + (selected.has(cat.code) ? " chip-selected" : "");
        btn.setAttribute("aria-pressed", selected.has(cat.code) ? "true" : "false");
        btn.textContent = cat.code + " — " + cat.name;
        btn.addEventListener("click", function () {
          if (selected.has(cat.code)) {
            selected.delete(cat.code);
          } else {
            selected.add(cat.code);
          }
          persistSelection();
          renderCategoryChips(searchInput.value);
          renderResults();
        });
        categoryListEl.appendChild(btn);
      });
  }

  function formatDateHeading(isoDate) {
    var d = new Date(isoDate + "T00:00:00Z");
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  function paperCard(paper, badgeLabel) {
    var authors = paper.authors.join(", ");
    var extras = [];
    if (paper.comment) extras.push(escapeHtml(paper.comment));
    if (paper.journal_ref) extras.push(escapeHtml(paper.journal_ref));
    if (paper.doi) extras.push("doi:" + escapeHtml(paper.doi));

    var categoryBadges = paper.categories
      .map(function (c) {
        return '<span class="arxiv-badge' + (c === paper.primary_category ? " arxiv-badge-primary" : "") + '">' + escapeHtml(c) + "</span>";
      })
      .join(" ");

    return (
      '<article class="arxiv-paper">' +
        '<div class="arxiv-paper-head">' +
          '<span class="arxiv-tag arxiv-tag-' + badgeLabel.toLowerCase().replace(/[^a-z]/g, "-") + '">' + badgeLabel + "</span>" +
          categoryBadges +
        "</div>" +
        '<h3 class="arxiv-paper-title"><a href="' + paper.abs_url + '" target="_blank" rel="noopener">' + escapeHtml(paper.title) + "</a></h3>" +
        '<p class="arxiv-paper-authors">' + escapeHtml(authors) + "</p>" +
        "<details class=\"arxiv-abstract\"><summary>Abstract</summary><p>" + escapeHtml(paper.abstract) + "</p></details>" +
        (extras.length ? '<p class="arxiv-paper-extra">' + extras.join(" &middot; ") + "</p>" : "") +
        '<p class="arxiv-paper-links"><a href="' + paper.abs_url + '" target="_blank" rel="noopener">abstract</a> &middot; <a href="' + paper.pdf_url + '" target="_blank" rel="noopener">pdf</a></p>' +
      "</article>"
    );
  }

  function renderResults() {
    if (!papersByCategory) return;

    if (!selected.size) {
      resultsEl.innerHTML = '<p class="section-note">Pick at least one category above to see recent submissions.</p>';
      return;
    }

    // date -> { new: [...], cross: [...] }
    var byDate = {};
    var seen = new Set();

    papersByCategory.forEach(function (paper) {
      if (seen.has(paper.id)) return;
      var isNew = selected.has(paper.primary_category);
      var isCross = !isNew && paper.categories.some(function (c) { return selected.has(c); });
      if (!isNew && !isCross) return;
      seen.add(paper.id);

      var date = paper.published.slice(0, 10);
      if (!byDate[date]) byDate[date] = { fresh: [], cross: [] };
      byDate[date][isNew ? "fresh" : "cross"].push(paper);
    });

    var dates = Object.keys(byDate).sort().reverse();
    if (!dates.length) {
      resultsEl.innerHTML = '<p class="section-note">No recent submissions found for the selected categories.</p>';
      return;
    }

    var html = "";
    dates.forEach(function (date) {
      var group = byDate[date];
      html += '<div class="arxiv-date-group">';
      html += "<h2>" + formatDateHeading(date) + "</h2>";
      if (group.fresh.length) {
        html += '<h3 class="arxiv-subhead">New submissions (' + group.fresh.length + ")</h3>";
        html += group.fresh.map(function (p) { return paperCard(p, "New"); }).join("");
      }
      if (group.cross.length) {
        html += '<h3 class="arxiv-subhead">Cross-lists (' + group.cross.length + ")</h3>";
        html += group.cross.map(function (p) { return paperCard(p, "Cross"); }).join("");
      }
      html += "</div>";
    });

    resultsEl.innerHTML = html;
  }

  function init(data) {
    allCategories = data.categories;
    papersByCategory = data.papers;

    var initial = categoriesFromUrl() || categoriesFromStorage() || DEFAULT_CATEGORIES;
    var validCodes = new Set(allCategories.map(function (c) { return c.code; }));
    initial.forEach(function (code) {
      if (validCodes.has(code)) selected.add(code);
    });

    renderCategoryChips("");
    renderResults();

    var generated = new Date(data.generated_at);
    metaEl.textContent =
      "Showing submissions from the last " + data.window_days + " days, as of " +
      generated.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) + ".";

    searchInput.addEventListener("input", function () {
      renderCategoryChips(searchInput.value);
    });
  }

  fetch(DATA_URL)
    .then(function (resp) {
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      return resp.json();
    })
    .then(init)
    .catch(function (err) {
      metaEl.textContent = "Couldn't load the digest data. Please try again later.";
      console.error(err);
    });
})();
