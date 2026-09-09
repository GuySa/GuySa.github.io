(function () {
  "use strict";

  var DATA_URL = "/assets/data/arxiv.json";
  var STORAGE_KEY = "arxivDigest.categories";
  var RANGE_STORAGE_KEY = "arxivDigest.range";
  var DEFAULT_CATEGORIES = ["math.AG", "math.NT"];
  var DEFAULT_RANGE = "latest"; // "latest" (most recent announcement day) or "all" (the full fetch window)

  var searchInput = document.getElementById("arxiv-search");
  var selectedChipsEl = document.getElementById("arxiv-selected");
  var dropdownEl = document.getElementById("arxiv-dropdown");
  var rangeEl = document.getElementById("arxiv-range");
  var metaEl = document.getElementById("arxiv-meta");
  var resultsEl = document.getElementById("arxiv-results");

  var allCategories = [];
  var selected = new Set();
  var rangeMode = DEFAULT_RANGE;
  var papersByCategory = null; // populated once data loads
  var windowDays = null;

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

  function rangeFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var raw = params.get("range");
    return raw === "latest" || raw === "all" ? raw : null;
  }

  function rangeFromStorage() {
    try {
      var raw = window.localStorage.getItem(RANGE_STORAGE_KEY);
      return raw === "latest" || raw === "all" ? raw : null;
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

  function persistRange() {
    try {
      window.localStorage.setItem(RANGE_STORAGE_KEY, rangeMode);
    } catch (e) { /* ignore (private browsing, etc.) */ }

    var url = new URL(window.location.href);
    url.searchParams.set("range", rangeMode);
    window.history.replaceState(null, "", url.toString());
  }

  function setRange(mode) {
    rangeMode = mode;
    persistRange();
    renderRangeButtons();
    renderResults();
  }

  function renderRangeButtons() {
    Array.prototype.forEach.call(rangeEl.querySelectorAll(".arxiv-range-btn"), function (btn) {
      var isActive = btn.getAttribute("data-range") === rangeMode;
      btn.classList.toggle("arxiv-range-btn-active", isActive);
      btn.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function toggleCategory(code) {
    if (selected.has(code)) {
      selected.delete(code);
    } else {
      selected.add(code);
    }
    persistSelection();
    renderSelectedChips();
    renderDropdown(searchInput.value);
    renderResults();
  }

  function renderSelectedChips() {
    selectedChipsEl.innerHTML = "";
    if (!selected.size) {
      selectedChipsEl.hidden = true;
      return;
    }
    selectedChipsEl.hidden = false;

    var byCode = {};
    allCategories.forEach(function (cat) { byCode[cat.code] = cat; });

    Array.from(selected)
      .sort()
      .forEach(function (code) {
        var cat = byCode[code] || { code: code, name: "" };
        var chip = document.createElement("button");
        chip.type = "button";
        chip.className = "chip chip-selected";
        chip.setAttribute("aria-label", "Remove " + cat.code);
        chip.innerHTML = escapeHtml(cat.code) + (cat.name ? " — " + escapeHtml(cat.name) : "") + ' <span aria-hidden="true">&times;</span>';
        chip.addEventListener("click", function () {
          toggleCategory(code);
        });
        selectedChipsEl.appendChild(chip);
      });
  }

  function renderDropdown(filterText) {
    var query = (filterText || "").trim().toLowerCase();
    dropdownEl.innerHTML = "";

    var matches = allCategories.filter(function (cat) {
      if (!query) return true;
      return (
        cat.code.toLowerCase().indexOf(query) !== -1 ||
        cat.name.toLowerCase().indexOf(query) !== -1
      );
    });

    if (!matches.length) {
      var empty = document.createElement("div");
      empty.className = "arxiv-dropdown-empty";
      empty.textContent = "No matching categories";
      dropdownEl.appendChild(empty);
      return;
    }

    matches.forEach(function (cat) {
      var isSelected = selected.has(cat.code);
      var item = document.createElement("button");
      item.type = "button";
      item.className = "arxiv-dropdown-item" + (isSelected ? " arxiv-dropdown-item-selected" : "");
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", isSelected ? "true" : "false");
      item.innerHTML = (isSelected ? "&check; " : "") + escapeHtml(cat.code) + " — " + escapeHtml(cat.name);
      // mousedown fires before the input's blur, so the click still lands.
      item.addEventListener("mousedown", function (e) {
        e.preventDefault();
        searchInput.value = "";
        toggleCategory(cat.code);
        searchInput.focus();
      });
      dropdownEl.appendChild(item);
    });
  }

  function openDropdown() {
    dropdownEl.hidden = false;
  }

  function closeDropdown() {
    dropdownEl.hidden = true;
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
    var absUrl = escapeHtml(paper.abs_url);
    var pdfUrl = escapeHtml(paper.pdf_url);
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
        '<h3 class="arxiv-paper-title"><a href="' + absUrl + '" target="_blank" rel="noopener">' + escapeHtml(paper.title) + "</a></h3>" +
        '<p class="arxiv-paper-authors">' + escapeHtml(authors) + "</p>" +
        "<details class=\"arxiv-abstract\"><summary>Abstract</summary><p>" + escapeHtml(paper.abstract) + "</p></details>" +
        (extras.length ? '<p class="arxiv-paper-extra">' + extras.join(" &middot; ") + "</p>" : "") +
        '<p class="arxiv-paper-links"><a href="' + absUrl + '" target="_blank" rel="noopener">abstract</a> &middot; <a href="' + pdfUrl + '" target="_blank" rel="noopener">pdf</a></p>' +
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

    if (rangeMode === "latest") {
      dates = dates.slice(0, 1);
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
    windowDays = data.window_days;

    var initial = categoriesFromUrl() || categoriesFromStorage() || DEFAULT_CATEGORIES;
    var validCodes = new Set(allCategories.map(function (c) { return c.code; }));
    initial.forEach(function (code) {
      if (validCodes.has(code)) selected.add(code);
    });

    rangeMode = rangeFromUrl() || rangeFromStorage() || DEFAULT_RANGE;

    renderSelectedChips();
    renderDropdown("");
    renderRangeButtons();
    renderResults();

    var generated = new Date(data.generated_at);
    metaEl.textContent =
      "Data fetched " + generated.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) +
      " (arXiv's last " + windowDays + " days of submissions).";

    rangeEl.addEventListener("click", function (e) {
      var btn = e.target.closest(".arxiv-range-btn");
      if (!btn) return;
      setRange(btn.getAttribute("data-range"));
    });

    searchInput.addEventListener("input", function () {
      renderDropdown(searchInput.value);
      openDropdown();
    });
    searchInput.addEventListener("focus", function () {
      renderDropdown(searchInput.value);
      openDropdown();
    });
    searchInput.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeDropdown();
        searchInput.blur();
      }
    });
    searchInput.addEventListener("blur", function () {
      // Let a dropdown-item mousedown register first (it calls
      // preventDefault so blur still fires, but after its own handler).
      setTimeout(closeDropdown, 0);
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
      searchInput.disabled = true;
      searchInput.placeholder = "Digest data unavailable";
      console.error(err);
    });
})();
