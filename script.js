(() => {
  const tabs = Array.from(document.querySelectorAll("[data-tab]"));
  const panels = Array.from(document.querySelectorAll("[data-panel]"));
  const grid = document.querySelector(".main-grid");
  const gridArea = document.querySelector(".main-container");
  const searchInput = document.querySelector(".sidebar-addlvl-input");
  const heightRange = document.querySelector(".sidebar-options-height-range");
  const widthRange = document.querySelector(".sidebar-options-width-range");
  const heightValue = document.querySelector(".sidebar-options-height-value");
  const widthValue = document.querySelector(".sidebar-options-width-value");
  const unratedLevelsCheckbox = document.querySelector(
    ".sidebar-options-allow-unrated-checkbox",
  );
  const unratedLevelsWarning = document.querySelector(
    ".sidebar-options-allow-unrated-warning",
  );

  const MIN_COLS = 1;
  const MAX_COLS = 12;
  const MIN_ROWS = 1;
  const MAX_ROWS = 12;
  const MIN_TILE = 60;
  const MAX_TILE = 260;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function syncUnratedWarning() {
    unratedLevelsWarning.hidden = !unratedLevelsCheckbox.checked;
  }

  function activateTab(name) {
    for (const tab of tabs) {
      const active = tab.dataset.tab === name;
      tab.classList.toggle("sidebar-action-btn-active", active);
      tab.setAttribute("aria-selected", String(active));
    }

    for (const panel of panels) {
      panel.hidden = panel.dataset.panel !== name;
    }
  }

  function getGridSize() {
    return {
      cols: clamp(Number(widthRange.value) || 5, MIN_COLS, MAX_COLS),
      rows: clamp(Number(heightRange.value) || 5, MIN_ROWS, MAX_ROWS),
    };
  }

  function updateTileSize() {
    const { cols, rows } = getGridSize();
    const gap =
      Number.parseFloat(
        getComputedStyle(grid).getPropertyValue("--grid-gap"),
      ) || 20;
    const areaStyle = getComputedStyle(gridArea);
    const padX =
      Number.parseFloat(areaStyle.paddingLeft) +
      Number.parseFloat(areaStyle.paddingRight);
    const padY =
      Number.parseFloat(areaStyle.paddingTop) +
      Number.parseFloat(areaStyle.paddingBottom);

    const availableWidth = gridArea.clientWidth - padX - (cols + 1) * gap;
    const availableHeight = gridArea.clientHeight - padY - (rows + 1) * gap;

    const tile = clamp(
      Math.min(availableWidth / cols, availableHeight / rows),
      MIN_TILE,
      MAX_TILE,
    );

    grid.style.setProperty("--tile", `${Math.floor(tile * 100) / 100}px`);
  }

  function renderGrid() {
    const { cols, rows } = getGridSize();

    widthValue.textContent = String(cols);
    heightValue.textContent = String(rows);
    grid.style.setProperty("--cols", String(cols));
    grid.style.setProperty("--rows", String(rows));

    const cells = document.createDocumentFragment();
    for (let index = 0; index < cols * rows; index += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "grid-cell grid-cell-empty";
      cell.dataset.index = String(index);
      cell.setAttribute("aria-label", `Empty slot ${index + 1}`);
      cells.appendChild(cell);
    }

    grid.replaceChildren(cells);
    updateTileSize();
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => activateTab(tab.dataset.tab));

    tab.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

      event.preventDefault();
      const current = tabs.indexOf(tab);
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(current + offset + tabs.length) % tabs.length];
      next.focus();
      activateTab(next.dataset.tab);
    });
  }

  heightRange.addEventListener("input", renderGrid);
  widthRange.addEventListener("input", renderGrid);

  unratedLevelsCheckbox.addEventListener("change", syncUnratedWarning);

  grid.addEventListener("click", (event) => {
    const cell = event.target.closest(".grid-cell-empty");
    if (!cell) return;

    activateTab("add-level");
    searchInput.focus();
  });

  const observer =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(updateTileSize)
      : null;
  if (observer) observer.observe(gridArea);
  window.addEventListener("resize", updateTileSize);

  syncUnratedWarning();
  activateTab("add-level");
  renderGrid();
})();
