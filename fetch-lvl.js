(() => {
  const searchInput = document.querySelector(".sidebar-addlvl-input");
  const searchButton = document.querySelector(".sidebar-addlvl-btn");
  const resultContainer = document.querySelector(".sidebar-addlvl-result");
  const allowUnratedCheckbox = document.querySelector(
    ".sidebar-options-allow-unrated-checkbox",
  );

  let isLoading = false;

  searchButton.addEventListener("click", fetchLevels);
  searchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    fetchLevels();
  });

  async function fetchLevels() {
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

    const rated = allowUnratedCheckbox.checked ? "0" : "1";
    const params = new URLSearchParams({
      q: query,
      page: "0",
      rated,
    });

    setLoading(true);
    setStatus("Searching…");

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

      renderResults(parseLevels(await response.text()));
    } catch (error) {
      console.error(error);
      setStatus(error.message || "Search failed. Is the local proxy running?");
    } finally {
      setLoading(false);
    }
  }

  function setLoading(loading) {
    isLoading = loading;
    searchButton.disabled = loading;
    resultContainer.setAttribute("aria-busy", String(loading));
  }

  function setStatus(message) {
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
        if (dragged) return;
        window.GDTopsterGrid?.addLevelToFirstEmpty(level);
      });

      image.addEventListener("error", () => {
        image.remove();
        button.classList.add("is-missing");
        button.textContent = level.name;
      });

      button.appendChild(image);
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
