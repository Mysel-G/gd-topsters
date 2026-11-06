(() => {
  const searchInput = document.querySelector(".sidebar-addlvl-input");
  const searchButton = document.querySelector(".sidebar-addlvl-btn");
  const resultContainer = document.querySelector(".sidebar-addlvl-result");
  const allowUnratedCheckbox = document.querySelector(
    ".sidebar-options-allow-unrated-checkbox",
  );
  const pagination = document.querySelector(".sidebar-addlvl-pagination");
  const previousPageButton = document.querySelector(
    ".sidebar-addlvl-page-prev",
  );
  const nextPageButton = document.querySelector(".sidebar-addlvl-page-next");
  const pageNumber = document.querySelector(".sidebar-addlvl-page-number");

  let isLoading = false;
  let currentPage = 0;
  let hasNextPage = false;
  let activeSearch = null;

  searchButton.addEventListener("click", startSearch);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    startSearch();
  });

  previousPageButton.addEventListener("click", () => {
    if (!activeSearch || isLoading || currentPage <= 0) return;
    loadPage(currentPage - 1);
  });

  nextPageButton.addEventListener("click", () => {
    if (!activeSearch || isLoading || !hasNextPage) return;
    loadPage(currentPage + 1);
  });

  function startSearch() {
    if (isLoading) return;

    if (window.location.protocol === "file:") {
      setStatus(
        "Start the local server with `npm run dev` and open http://localhost:3000.",
      );
      return;
    }

    const query = toServerQuery(searchInput.value);
    if (!query) {
      setStatus(
        "Enter a level name using letters, numbers, spaces, `-` or `,`.",
      );
      return;
    }

    activeSearch = {
      query,
      rated: allowUnratedCheckbox.checked ? "0" : "1",
    };
    currentPage = 0;
    hasNextPage = false;
    loadPage(0, true);
  }

  async function loadPage(page, isNewSearch = false) {
    if (isLoading || !activeSearch) return;

    const targetPage = Math.max(0, Math.min(50, page));
    const params = new URLSearchParams({
      q: activeSearch.query,
      page: String(targetPage),
      rated: activeSearch.rated,
    });

    setLoading(true);
    if (isNewSearch) {
      setStatus("Searching…");
    } else {
      updatePagination();
    }

    try {
      const response = await fetch(`/api/gd/search?${params.toString()}`);
      if (!response.ok) {
        let message = `Search failed (HTTP ${response.status}).`;
        try {
          const payload = await response.json();
          if (payload.message) message = payload.message;
        } catch {
          // Keep the status-based message if the body is not JSON.
        }
        throw new Error(message);
      }

      const levels = parseLevels(await response.text());

      if (targetPage > 0 && levels.length === 0) {
        currentPage = targetPage - 1;
        hasNextPage = false;
        updatePagination();
        window.GDTopsterGrid?.toast("No more results.");
        return;
      }

      currentPage = targetPage;

      if (levels.length === 0) {
        hasNextPage = false;
        setStatus("No levels found.");
        return;
      }

      renderResults(levels);
      hasNextPage = levels.length === 10 && currentPage < 50;
      showPagination();
    } catch (error) {
      console.error(error);
      if (isNewSearch) {
        setStatus(
          error.message || "Search failed. Is the local proxy running?",
        );
      } else {
        window.GDTopsterGrid?.toast(
          error.message || "Search failed. Is the local proxy running?",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  function showPagination() {
    pagination.hidden = false;
    updatePagination();
  }

  function updatePagination() {
    if (pagination.hidden) return;
    previousPageButton.disabled = isLoading || currentPage <= 0;
    nextPageButton.disabled = isLoading || !hasNextPage;
    pageNumber.textContent = String(currentPage + 1);
  }

  function setLoading(loading) {
    isLoading = loading;
    searchButton.disabled = loading;
    resultContainer.setAttribute("aria-busy", String(loading));
    updatePagination();
  }

  function setStatus(message) {
    pagination.hidden = true;
    resultContainer.replaceChildren();
    const status = document.createElement("p");
    status.className = "sidebar-addlvl-status";
    status.textContent = message;
    resultContainer.appendChild(status);
  }

  function renderResults(levels) {
    if (levels.length === 0) {
      setStatus("No levels found.");
      return;
    }

    const fragment = document.createDocumentFragment();

    for (const level of levels) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "sidebar-addlvl-result-item";
      button.dataset.levelId = String(level.id);
      button.draggable = true;

      const label = level.author
        ? `${level.name} by ${level.author}`
        : level.name;
      button.title = label;
      button.setAttribute("aria-label", label);

      const image = document.createElement("img");
      image.src = level.thumb;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      image.draggable = true;

      let dragged = false;
      let pointerDragAt = 0;

      button.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse") return;

        window.GDTopsterGrid?.startPointerDrag(event, {
          source: button,
          delay: 180,
          onDragStart: () => {
            pointerDragAt = Date.now();
          },
          onDrop: (cell) => {
            const index = Number(cell.dataset.index);
            if (Number.isInteger(index)) {
              window.GDTopsterGrid.addLevel(index, level);
            }
          },
        });
      });

      button.addEventListener("dragstart", (event) => {
        dragged = true;
        button.classList.add("is-dragging");

        const payload = JSON.stringify(level);
        event.dataTransfer.effectAllowed = "copy";
        event.dataTransfer.setData("application/x-gd-level", payload);
        event.dataTransfer.setData("text/plain", payload);

        if (image.complete && image.naturalWidth > 0) {
          event.dataTransfer.setDragImage(image, 45, 45);
        }
      });

      button.addEventListener("dragend", () => {
        button.classList.remove("is-dragging");
        setTimeout(() => {
          dragged = false;
        }, 100);
      });

      button.addEventListener("click", () => {
        if (dragged || Date.now() - pointerDragAt < 600) {
          dragged = false;
          return;
        }
        window.GDTopsterGrid?.addLevelToFirstEmpty(level);
      });

      image.addEventListener("error", () => {
        image.remove();
        button.classList.add("is-missing");
        button.textContent = level.name;
      });

      const caption = document.createElement("span");
      caption.className = "sidebar-addlvl-result-caption";
      caption.setAttribute("aria-hidden", "true");

      const nameLine = document.createElement("span");
      nameLine.className = "sidebar-addlvl-result-name";
      nameLine.textContent = level.name || "Level";

      const authorLine = document.createElement("span");
      authorLine.className = "sidebar-addlvl-result-author";
      authorLine.textContent = level.author || "Unknown";

      caption.append(nameLine, authorLine);
      button.appendChild(image);
      button.appendChild(caption);
      fragment.appendChild(button);
    }

    resultContainer.replaceChildren(fragment);
  }

  function toServerQuery(input) {
    return input
      .replace(/['’`]/g, "")
      .replace(/[^A-Za-z0-9 ,\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100);
  }

  function parseLevels(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed || trimmed === "-1") return [];

    const [levelsRaw = "", creatorsRaw = ""] = trimmed.split("#");

    const creators = new Map();
    for (const entry of creatorsRaw.split("|").filter(Boolean)) {
      const [userID, username] = entry.split(":");
      creators.set(userID, decodeEntities(username || ""));
    }

    return levelsRaw
      .split("|")
      .filter(Boolean)
      .map((chunk) => {
        const parts = chunk.split(":");
        const values = {};

        for (let index = 0; index + 1 < parts.length; index += 2) {
          values[parts[index]] = parts[index + 1];
        }

        const id = Number(values["1"]);
        if (!Number.isInteger(id) || id <= 0) return null;

        return {
          id,
          name: decodeEntities(values["2"] || `Level ${id}`),
          author: creators.get(values["6"]) || "",
          stars: Number(values["18"]) || 0,
          demon: values["17"] === "1",
          thumb: `https://levelthumbs.prevter.me/thumbnail/${id}/small`,
        };
      })
      .filter(Boolean);
  }

  function decodeEntities(value) {
    return value
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }
})();
