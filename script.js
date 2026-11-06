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
  const swapNamesCheckbox = document.querySelector(
    ".sidebar-options-swap-name-checkbox",
  );

  const STORAGE_KEY = "gdtopster.grid.v1";
  const MIN_COLS = 1;
  const MAX_COLS = 12;
  const MIN_ROWS = 1;
  const MAX_ROWS = 12;
  const MIN_TILE = 60;
  const MAX_TILE = 260;
  const CUSTOM_IMAGE_SIZE = 512;

  const state = {
    cols: 5,
    rows: 5,
    swapNames: false,
    items: [],
  };

  let saveTimer = null;
  let toastTimer = null;

  const UPLOAD_ICON = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round"
      stroke-linejoin="round" aria-hidden="true">
      <path d="M12 16V4"></path>
      <path d="m7 9 5-5 5 5"></path>
      <path d="M5 20h14"></path>
    </svg>`;

  const REMOVE_ICON = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round"
      stroke-linejoin="round" aria-hidden="true">
      <path d="M6 6l12 12"></path>
      <path d="M18 6 6 18"></path>
    </svg>`;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function thumbUrl(id) {
    return `https://levelthumbs.prevter.me/thumbnail/${id}/small`;
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

  function ensureItemCapacity() {
    const capacity = state.cols * state.rows;
    while (state.items.length < capacity) state.items.push(null);
  }

  function normalizeStoredItem(item) {
    if (!item || typeof item !== "object") return null;

    const id = Number(item.id) || null;
    const customImage =
      typeof item.customImage === "string" &&
      item.customImage.startsWith("data:image/")
        ? item.customImage
        : null;

    if (!id && !customImage) return null;

    return {
      id,
      name: typeof item.name === "string" ? item.name : id ? `Level ${id}` : "",
      author: typeof item.author === "string" ? item.author : "",
      stars: Number(item.stars) || 0,
      demon: Boolean(item.demon),
      thumb:
        typeof item.thumb === "string" && item.thumb
          ? item.thumb
          : id
            ? thumbUrl(id)
            : "",
      customImage,
      custom: Boolean(item.custom || customImage),
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;

      state.cols = clamp(Number(parsed.cols) || 5, MIN_COLS, MAX_COLS);
      state.rows = clamp(Number(parsed.rows) || 5, MIN_ROWS, MAX_ROWS);
      state.swapNames = Boolean(parsed.swapNames);
      state.items = Array.isArray(parsed.items)
        ? parsed.items.map(normalizeStoredItem)
        : [];

      ensureItemCapacity();
    } catch (error) {
      console.warn("Could not load the saved grid.", error);
    }
  }

  function syncControlsFromState() {
    heightRange.value = String(state.rows);
    widthRange.value = String(state.cols);
    heightValue.textContent = String(state.rows);
    widthValue.textContent = String(state.cols);
    if (swapNamesCheckbox) swapNamesCheckbox.checked = state.swapNames;
  }

  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            version: 1,
            cols: state.cols,
            rows: state.rows,
            swapNames: state.swapNames,
            items: state.items,
          }),
        );
      } catch (error) {
        console.warn("Could not save the grid.", error);
        toast("Could not save the grid. A custom image may be too large.");
      }
    }, 150);
  }

  function updateTileSize() {
    const { cols, rows } = getGridSize();
    const gridStyle = getComputedStyle(grid);
    const gap = Number.parseFloat(gridStyle.getPropertyValue("--grid-gap")) || 20;
    const labelCell = grid.querySelector(".grid-row-labels");
    const labelPadding = labelCell
      ? Number.parseFloat(getComputedStyle(labelCell).paddingLeft) +
        Number.parseFloat(getComputedStyle(labelCell).paddingRight)
      : 0;
    let labelTextWidth = 0;
    for (const list of grid.querySelectorAll(".grid-row-label-list")) {
      labelTextWidth = Math.max(labelTextWidth, list.scrollWidth);
    }
    const labelWidth = labelTextWidth
      ? Math.ceil(labelTextWidth + labelPadding)
      : 0;

    grid.style.setProperty("--label-width", `${labelWidth}px`);

    const areaStyle = getComputedStyle(gridArea);
    const padX =
      Number.parseFloat(areaStyle.paddingLeft) +
      Number.parseFloat(areaStyle.paddingRight);
    const padY =
      Number.parseFloat(areaStyle.paddingTop) +
      Number.parseFloat(areaStyle.paddingBottom);

    const availableWidth =
      gridArea.clientWidth - padX - labelWidth - (cols + 2) * gap;
    const availableHeight = gridArea.clientHeight - padY - (rows + 1) * gap;

    const tile = clamp(
      Math.min(availableWidth / cols, availableHeight / rows),
      MIN_TILE,
      MAX_TILE,
    );

    grid.style.setProperty("--tile", `${Math.floor(tile * 100) / 100}px`);
    grid.style.gridTemplateColumns = `${Array.from(
      { length: cols },
      () => `${tile}px`,
    ).join(" ")} ${labelWidth}px`;
  }

  function renderGrid() {
    const { cols, rows } = getGridSize();
    state.cols = cols;
    state.rows = rows;
    ensureItemCapacity();

    widthValue.textContent = String(cols);
    heightValue.textContent = String(rows);
    grid.style.setProperty("--cols", String(cols));
    grid.style.setProperty("--rows", String(rows));

    const fragment = document.createDocumentFragment();
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < cols; column += 1) {
        const index = row * cols + column;
        fragment.appendChild(createCell(index, state.items[index]));
      }

      fragment.appendChild(
        createRowLabels(
          row,
          cols,
          state.items.slice(row * cols, row * cols + cols),
        ),
      );
    }

    grid.replaceChildren(fragment);
    updateTileSize();
    saveState();
  }

  function createCell(index, item) {
    const cell = document.createElement("div");
    cell.className = "grid-cell";
    cell.dataset.index = String(index);

    if (item) {
      cell.classList.add("grid-cell--filled");
      if (item.id) cell.classList.add("grid-cell--level");
      if (item.custom) {
        cell.classList.add("grid-cell--custom");
        cell.dataset.custom = "true";
      }
      cell.setAttribute("aria-label", itemLabel(item));
    } else {
      cell.classList.add("grid-cell--empty");
    }

    const media = createMedia(index, item);
    cell.appendChild(media);
    if (item) {
      cell.appendChild(createActions(index));
      cell.appendChild(createFileInput(index));
    }
    attachDropTarget(cell, index);

    return cell;
  }

  function createRowLabels(row, cols, items) {
    const cell = document.createElement("div");
    cell.className = "grid-row-labels";
    cell.setAttribute("role", "group");
    cell.setAttribute("aria-label", `Row ${row + 1} level labels`);

    if (!items.some(Boolean)) return cell;

    const list = document.createElement("ol");
    list.className = "grid-row-label-list";

    for (let column = 0; column < cols; column += 1) {
      const item = items[column];
      const label = document.createElement("li");
      label.className = "grid-row-label";

      if (item) {
        label.textContent = formatRowLabel(item);
        label.title = label.textContent;
      } else {
        label.textContent = "";
        label.setAttribute("aria-hidden", "true");
      }

      list.appendChild(label);
    }

    cell.appendChild(list);
    return cell;
  }

  function formatRowLabel(item) {
    const name = item.name || (item.custom ? "Custom image" : "Level");
    const creator = item.author || "";

    if (!creator) return name;
    return state.swapNames ? `${name} - ${creator}` : `${creator} - ${name}`;
  }

  function itemLabel(item) {
    const name = item.name || (item.custom ? "Custom image" : "Level");
    return item.author ? `${name} by ${item.author}` : name;
  }

  function createMedia(index, item) {
    const media = document.createElement(item ? "div" : "button");
    media.className = "grid-cell-media";

    if (!item) {
      media.type = "button";
      media.classList.add("grid-cell-media--empty");
      media.setAttribute(
        "aria-label",
        `Empty slot ${index + 1}. Drop a level here or click to search.`,
      );
      media.addEventListener("click", () => {
        activateTab("add-level");
        searchInput.focus();
      });
      return media;
    }

    if (item.custom) media.classList.add("grid-cell-media--custom");

    const source = item.customImage || item.thumb;

    if (source) {
      const image = document.createElement("img");
      image.src = source;
      image.alt = itemLabel(item);
      image.draggable = false;
      image.loading = "lazy";
      image.decoding = "async";
      image.crossOrigin = "anonymous";
      image.addEventListener("error", () => {
        image.remove();
        media.classList.add("grid-cell-media--missing");
        media.appendChild(createMissingThumbnail(item));
      });
      media.appendChild(image);
    } else {
      media.classList.add("grid-cell-media--missing");
      media.appendChild(createMissingThumbnail(item));
    }

    media.draggable = true;

    media.addEventListener("dragstart", (event) => {
      const cell = media.closest(".grid-cell");
      cell?.classList.add("grid-cell--dragging");

      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData(
        "application/x-gd-grid-index",
        String(index),
      );
      event.dataTransfer.setData(
        "text/plain",
        JSON.stringify({ source: "grid", index }),
      );

      if (media.offsetWidth > 0) {
        event.dataTransfer.setDragImage(
          media,
          media.offsetWidth / 2,
          media.offsetHeight / 2,
        );
      }
    });

    media.addEventListener("dragend", () => {
      media.closest(".grid-cell")?.classList.remove("grid-cell--dragging");
    });

    return media;
  }

  function createMissingThumbnail(item) {
    const fallback = document.createElement("span");
    fallback.className = "grid-cell-fallback";
    fallback.textContent = item.name || "No thumbnail";
    return fallback;
  }

  function createActions(index) {
    const actions = document.createElement("div");
    actions.className = "grid-cell-actions";
    actions.setAttribute("data-html2canvas-ignore", "");

    const upload = document.createElement("button");
    upload.type = "button";
    upload.className = "grid-cell-action grid-cell-action--upload";
    upload.title = "Upload or replace image";
    upload.setAttribute("aria-label", "Upload or replace image");
    upload.innerHTML = UPLOAD_ICON;
    upload.addEventListener("click", (event) => {
      event.stopPropagation();
      actions.parentElement.querySelector(".grid-cell-file")?.click();
    });
    actions.appendChild(upload);

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "grid-cell-action grid-cell-action--remove";
    remove.title = "Remove from chart";
    remove.setAttribute("aria-label", "Remove from chart");
    remove.innerHTML = REMOVE_ICON;
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      state.items[index] = null;
      renderGrid();
    });
    actions.appendChild(remove);

    return actions;
  }

  function createFileInput(index) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.className = "grid-cell-file";
    input.hidden = true;
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.value = "";
      if (file) handleImageUpload(index, file);
    });
    return input;
  }

  function attachDropTarget(cell, index) {
    cell.addEventListener("dragover", (event) => {
      event.preventDefault();
      if (event.dataTransfer) {
        const types = Array.from(event.dataTransfer.types || []);
        event.dataTransfer.dropEffect = types.includes(
          "application/x-gd-grid-index",
        )
          ? "move"
          : "copy";
      }
      cell.classList.add("grid-cell--drop-target");
    });

    cell.addEventListener("dragleave", (event) => {
      if (!event.relatedTarget || !cell.contains(event.relatedTarget)) {
        cell.classList.remove("grid-cell--drop-target");
      }
    });

    cell.addEventListener("drop", (event) => {
      event.preventDefault();
      cell.classList.remove("grid-cell--drop-target");

      const gridIndex = event.dataTransfer?.getData(
        "application/x-gd-grid-index",
      );
      if (gridIndex) {
        moveItem(Number(gridIndex), index);
        return;
      }

      const raw =
        event.dataTransfer?.getData("application/x-gd-level") ||
        event.dataTransfer?.getData("text/plain");
      if (!raw) return;

      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return;
      }

      if (payload?.source === "grid") {
        moveItem(Number(payload.index), index);
        return;
      }

      addLevel(index, payload);
    });
  }

  function normalizeLevel(level) {
    const id = Number(level?.id) || null;
    if (!id) return null;

    return {
      id,
      name:
        typeof level.name === "string" && level.name
          ? level.name
          : `Level ${id}`,
      author: typeof level.author === "string" ? level.author : "",
      stars: Number(level.stars) || 0,
      demon: Boolean(level.demon),
      thumb:
        typeof level.thumb === "string" && level.thumb
          ? level.thumb
          : thumbUrl(id),
      customImage: null,
      custom: false,
    };
  }

  function addLevel(index, level) {
    const normalized = normalizeLevel(level);
    if (!normalized) return false;

    let target = index;
    if (
      !Number.isInteger(target) ||
      target < 0 ||
      target >= state.cols * state.rows
    ) {
      target = firstEmptyIndex();
      if (target === -1) {
        toast("The chart is full.");
        return false;
      }
    }

    state.items[target] = normalized;
    renderGrid();
    toast(`Added ${normalized.name}.`);
    return true;
  }

  function firstEmptyIndex() {
    const capacity = state.cols * state.rows;
    for (let index = 0; index < capacity; index += 1) {
      if (!state.items[index]) return index;
    }
    return -1;
  }

  function moveItem(from, to) {
    const capacity = state.cols * state.rows;
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from === to ||
      from < 0 ||
      to < 0 ||
      from >= capacity ||
      to >= capacity
    ) {
      return false;
    }

    const source = state.items[from];
    if (!source) return false;

    const target = state.items[to] || null;
    state.items[to] = source;
    state.items[from] = target;
    renderGrid();
    return true;
  }

  function addLevelToFirstEmpty(level) {
    const index = firstEmptyIndex();
    if (index === -1) {
      toast("The chart is full.");
      return false;
    }
    return addLevel(index, level);
  }

  async function handleImageUpload(index, file) {
    if (!file.type.startsWith("image/")) {
      toast("Please choose an image file.");
      return;
    }

    try {
      const customImage = await cropImageToSquare(file, CUSTOM_IMAGE_SIZE);
      const existing = state.items[index];

      if (existing) {
        existing.customImage = customImage;
        existing.custom = true;
      } else {
        state.items[index] = {
          id: null,
          name: "",
          author: "",
          stars: 0,
          demon: false,
          thumb: "",
          customImage,
          custom: true,
        };
      }

      renderGrid();
      toast("Image uploaded.");
    } catch (error) {
      console.error(error);
      toast(error.message || "Could not read that image.");
    }
  }

  function cropImageToSquare(file, size) {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        const side = Math.min(image.naturalWidth, image.naturalHeight);
        if (!side) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("That image has no readable dimensions."));
          return;
        }

        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext("2d");

        if (!context) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Could not prepare the image."));
          return;
        }

        context.imageSmoothingQuality = "high";
        context.drawImage(
          image,
          (image.naturalWidth - side) / 2,
          (image.naturalHeight - side) / 2,
          side,
          side,
          0,
          0,
          size,
          size,
        );

        URL.revokeObjectURL(objectUrl);
        resolve(canvas.toDataURL("image/webp", 0.9));
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not read that image."));
      };

      image.src = objectUrl;
    });
  }

  function toast(message) {
    let element = document.querySelector(".gd-toast");
    if (!element) {
      element = document.createElement("div");
      element.className = "gd-toast";
      element.setAttribute("role", "status");
      document.body.appendChild(element);
    }

    element.textContent = message;
    element.classList.add("gd-toast--visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      element.classList.remove("gd-toast--visible");
    }, 2600);
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

  if (swapNamesCheckbox) {
    swapNamesCheckbox.addEventListener("change", () => {
      state.swapNames = swapNamesCheckbox.checked;
      renderGrid();
    });
  }

  unratedLevelsCheckbox.addEventListener("change", syncUnratedWarning);

  const observer =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(updateTileSize)
      : null;
  if (observer) observer.observe(gridArea);
  window.addEventListener("resize", updateTileSize);

  loadState();
  syncControlsFromState();
  syncUnratedWarning();
  activateTab("add-level");
  renderGrid();

  window.GDTopsterGrid = {
    addLevel,
    addLevelToFirstEmpty,
    getState: () =>
      JSON.parse(
        JSON.stringify({
          version: 1,
          cols: state.cols,
          rows: state.rows,
          swapNames: state.swapNames,
          items: state.items.slice(0, state.cols * state.rows),
        }),
      ),
    toast,
  };
})();
