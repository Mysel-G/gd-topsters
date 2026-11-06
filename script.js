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
  const titleInput = document.querySelector(".sidebar-options-title-input");
  const roundedCornersCheckbox = document.querySelector(
    ".sidebar-options-rounded-corners-checkbox",
  );
  const saveDataButton = document.querySelector(".sidebar-save-data-btn");
  const importDataButton = document.querySelector(".sidebar-import-data-btn");
  const exportPngButton = document.querySelector(".sidebar-export-png-btn");
  const resetGridButton = document.querySelector(".sidebar-reset-btn");
  const importFileInput = document.querySelector(".sidebar-import-file");

  const STORAGE_KEY = "gdtopster.grid.v1";
  const MIN_COLS = 1;
  const MAX_COLS = 12;
  const MIN_ROWS = 1;
  const MAX_ROWS = 12;
  const TILE_SIZE = 260;
  const CUSTOM_IMAGE_SIZE = 512;

  const state = {
    title: "",
    cols: 5,
    rows: 5,
    swapNames: false,
    rounded: false,
    items: [],
  };

  let saveTimer = null;
  let toastTimer = null;
  let layoutFrame = 0;

  const UPLOAD_ICON = `
  <svg viewBox="0 0 32 32" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true">
    <path d="M16 20V8"></path>
    <path d="m11 13 5-5 5 5"></path>
    <path d="M9 24h14"></path>
  </svg>`;

  const REMOVE_ICON = `
  <svg viewBox="0 0 32 32" fill="none"
    stroke="currentColor" stroke-width="2" stroke-linecap="round"
    stroke-linejoin="round" aria-hidden="true">
    <path d="M10 10l12 12"></path>
    <path d="M22 10 10 22"></path>
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
      state.title = typeof parsed.title === "string" ? parsed.title : "";
      state.swapNames = Boolean(parsed.swapNames);
      state.rounded = Boolean(parsed.rounded);
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
    if (roundedCornersCheckbox) {
      roundedCornersCheckbox.checked = state.rounded;
    }
    if (titleInput) titleInput.value = state.title;
  }

  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            version: 1,
            title: state.title,
            cols: state.cols,
            rows: state.rows,
            swapNames: state.swapNames,
            rounded: state.rounded,
            items: state.items,
          }),
        );
      } catch (error) {
        console.warn("Could not save the grid.", error);
        toast("Could not save the grid. A custom image may be too large.");
      }
    }, 150);
  }

  function updateGridGeometry() {
    const { cols } = getGridSize();
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
    grid.style.gridTemplateColumns = `${Array.from(
      { length: cols },
      () => `${TILE_SIZE}px`,
    ).join(" ")} ${labelWidth}px`;
  }

  function updateChartScale() {
    const stage = grid.parentElement;
    const baseWidth = grid.offsetWidth;
    const baseHeight = grid.offsetHeight;
    if (!stage || !baseWidth || !baseHeight) return;

    const areaStyle = getComputedStyle(gridArea);
    const padX =
      Number.parseFloat(areaStyle.paddingLeft) +
      Number.parseFloat(areaStyle.paddingRight);
    const padY =
      Number.parseFloat(areaStyle.paddingTop) +
      Number.parseFloat(areaStyle.paddingBottom);

    const availableWidth = Math.max(0, gridArea.clientWidth - padX);
    const availableHeight = Math.max(0, gridArea.clientHeight - padY);
    const isMobile = window.matchMedia("(max-width: 1000px)").matches;
    const widthScale = availableWidth / baseWidth;
    const scale = Math.max(
      0.05,
      isMobile
        ? widthScale
        : Math.min(widthScale, availableHeight / baseHeight),
    );

    grid.style.setProperty("--chart-scale", String(scale));
    grid.style.transform = `scale(${scale})`;
    grid.style.visibility = "visible";
    stage.style.width = `${Math.floor(baseWidth * scale)}px`;
    stage.style.height = `${Math.floor(baseHeight * scale)}px`;
    grid.classList.add("is-scaled");
  }

  function scheduleChartLayout() {
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = requestAnimationFrame(() => {
        updateGridGeometry();
        updateChartScale();
      });
    });
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

    if (state.title.trim()) {
      fragment.appendChild(createTitleRow(state.title));
    }

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
    updateGridGeometry();
    updateChartScale();
    scheduleChartLayout();
    saveState();
  }

  function createTitleRow(title) {
    const row = document.createElement("div");
    row.className = "chart-title-row";
    row.textContent = title;
    return row;
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

  function startPointerDrag(event, options) {
    if (event.pointerType === "mouse") return;

    const source = options.source;
    const delay = options.delay ?? 180;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    let active = false;
    let finished = false;
    let ghost = null;
    let targetCell = null;
    let timer = null;

    function clearTarget() {
      targetCell?.classList.remove("grid-cell--drop-target");
      targetCell = null;
    }

    function findCell(x, y) {
      return document.elementFromPoint(x, y)?.closest(".grid-cell") || null;
    }

    function updateGhost(x, y) {
      if (!ghost) return;
      const size = ghost.offsetWidth;
      ghost.style.left = `${x - size / 2}px`;
      ghost.style.top = `${y - size / 2}px`;
    }

    function createGhost() {
      const rect = source.getBoundingClientRect();
      const size = Math.min(128, Math.max(64, rect.width || 64));
      const image = source.querySelector("img");
      const element = document.createElement("div");
      element.className = "pointer-drag-ghost";
      element.style.width = `${size}px`;
      element.style.height = `${size}px`;

      if (image?.currentSrc || image?.src) {
        element.style.backgroundImage = `url("${image.currentSrc || image.src}")`;
      } else {
        element.textContent = source.textContent.trim().slice(0, 60);
      }

      document.body.appendChild(element);
      return element;
    }

    function cleanup() {
      if (finished) return;
      finished = true;

      if (timer) clearTimeout(timer);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", cleanup);
      ghost?.remove();
      ghost = null;
      clearTarget();
      source.classList.remove("is-dragging");
      source.closest(".grid-cell")?.classList.remove("grid-cell--dragging");
      document.body.classList.remove("is-pointer-dragging");
      options.onDragEnd?.();
      try {
        source.releasePointerCapture?.(pointerId);
      } catch {
        // Ignore browsers that reject releasing a capture they do not own.
      }
    }

    function begin() {
      if (finished) return;
      active = true;
      timer = null;
      ghost = createGhost();
      source.classList.add("is-dragging");
      source.closest(".grid-cell")?.classList.add("grid-cell--dragging");
      document.body.classList.add("is-pointer-dragging");
      options.onDragStart?.();
      updateGhost(startX, startY);
      try {
        source.setPointerCapture?.(pointerId);
      } catch {
        // Pointer capture is optional; document listeners still track the drag.
      }
    }

    function onMove(moveEvent) {
      if (!active) {
        const distance = Math.hypot(
          moveEvent.clientX - startX,
          moveEvent.clientY - startY,
        );
        if (distance > 9) cleanup();
        return;
      }

      moveEvent.preventDefault();
      updateGhost(moveEvent.clientX, moveEvent.clientY);

      const cell = findCell(moveEvent.clientX, moveEvent.clientY);
      if (cell !== targetCell) {
        clearTarget();
        targetCell = cell;
        targetCell?.classList.add("grid-cell--drop-target");
      }
    }

    function onUp(upEvent) {
      if (!active) {
        cleanup();
        return;
      }

      upEvent.preventDefault();
      const cell = findCell(upEvent.clientX, upEvent.clientY);
      cleanup();
      if (cell) options.onDrop?.(cell);
    }

    document.addEventListener("pointermove", onMove, { passive: false });
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", cleanup);

    if (delay > 0) {
      timer = setTimeout(begin, delay);
    } else {
      begin();
    }
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
      image.src = source;
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
      event.dataTransfer.setData("application/x-gd-grid-index", String(index));
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

    media.addEventListener("pointerdown", (event) => {
      startPointerDrag(event, {
        source: media,
        delay: 0,
        onDrop: (cell) => {
          const target = Number(cell.dataset.index);
          if (Number.isInteger(target)) moveItem(index, target);
        },
      });
    });

    return media;
  }

  function createMissingThumbnail(item) {
    const fallback = document.createElement("span");
    fallback.className = "grid-cell-fallback";

    const name = document.createElement("span");
    name.className = "grid-cell-fallback-name";
    name.textContent = item.name || "No thumbnail";

    const author = document.createElement("span");
    author.className = "grid-cell-fallback-author";
    author.textContent = item.author || "Unknown";

    fallback.append(name, author);
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

  function slugify(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function getState() {
    return JSON.parse(
      JSON.stringify({
        version: 1,
        title: state.title,
        cols: state.cols,
        rows: state.rows,
        swapNames: state.swapNames,
        rounded: state.rounded,
        items: state.items.slice(0, state.cols * state.rows),
      }),
    );
  }

  function exportTopsterData() {
    const data = {
      format: "gdtopster",
      ...getState(),
      savedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const formattedDate =
      `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}` +
      `-${pad(today.getHours())}-${pad(today.getMinutes())}`;

    downloadBlob(
      blob,
      `${slugify(state.title) || "gd-topster"}-${formattedDate}.json`,
    );
    toast("Topster data saved.");
  }

  function importTopsterData(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.items)) {
      throw new Error("Invalid topster file.");
    }

    const cols = clamp(Number(data.cols) || 5, MIN_COLS, MAX_COLS);
    const rows = clamp(Number(data.rows) || 5, MIN_ROWS, MAX_ROWS);
    const items = data.items.map(normalizeStoredItem);

    state.title = typeof data.title === "string" ? data.title : "";
    state.cols = cols;
    state.rows = rows;
    state.swapNames = Boolean(data.swapNames);
    state.rounded = Boolean(data.rounded);
    state.items = items;
    ensureItemCapacity();
    syncControlsFromState();
    renderGrid();
  }

  function resetGrid() {
    if (
      !window.confirm(
        "Reset the entire grid to its default settings? This cannot be undone.",
      )
    ) {
      return;
    }

    state.title = "";
    state.cols = 5;
    state.rows = 5;
    state.swapNames = false;
    state.rounded = false;
    state.items = [];
    ensureItemCapacity();
    syncControlsFromState();

    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // The in-memory reset still stands if storage is unavailable.
    }

    renderGrid();
    toast("Grid reset.");
  }

  function waitForImage(image) {
    if (image.complete) return Promise.resolve();
    return new Promise((resolve) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", resolve, { once: true });
    });
  }

  function replaceImagesWithCanvases(root) {
    for (const image of root.querySelectorAll(".grid-cell-media img")) {
      if (!image.complete || !image.naturalWidth) continue;

      try {
        const canvas = document.createElement("canvas");
        canvas.width = 520;
        canvas.height = 520;
        const context = canvas.getContext("2d");
        const side = Math.min(image.naturalWidth, image.naturalHeight);

        context.imageSmoothingQuality = "high";
        context.drawImage(
          image,
          (image.naturalWidth - side) / 2,
          (image.naturalHeight - side) / 2,
          side,
          side,
          0,
          0,
          canvas.width,
          canvas.height,
        );

        canvas.className = image.className;
        canvas.style.width = "100%";
        canvas.style.height = "100%";
        canvas.style.display = "block";
        image.replaceWith(canvas);
      } catch (error) {
        console.warn("Could not prepare an image for PNG export.", error);
      }
    }
  }

  async function exportPng() {
    if (typeof window.html2canvas !== "function") {
      toast("PNG export is unavailable. Check your connection and try again.");
      return;
    }

    const label = exportPngButton.textContent.trim();
    exportPngButton.disabled = true;
    exportPngButton.textContent = "Exporting…";
    let clone;

    try {
      if (document.fonts?.ready) await document.fonts.ready;

      clone = grid.cloneNode(true);
      clone.style.position = "fixed";
      clone.style.left = "-10000px";
      clone.style.top = "0";
      clone.style.transform = "none";
      clone.style.visibility = "visible";
      clone.classList.add("is-scaled");
      clone.setAttribute("aria-hidden", "true");
      for (const image of clone.querySelectorAll("img")) {
        image.loading = "eager";
      }
      document.body.appendChild(clone);

      await Promise.all(
        Array.from(clone.querySelectorAll(".grid-cell-media img")).map(
          waitForImage,
        ),
      );
      replaceImagesWithCanvases(clone);

      const today = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      const formattedDate =
        `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}` +
        `-${pad(today.getHours())}-${pad(today.getMinutes())}`;

      const canvas = await window.html2canvas(clone, {
        backgroundColor: "#000000",
        useCORS: true,
        scale: 2,
        logging: false,
        width: clone.offsetWidth,
        height: clone.offsetHeight,
      });

      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (!blob) throw new Error("Could not create PNG.");

      downloadBlob(
        blob,
        `${slugify(state.title) || "gd-topster"}-${formattedDate}.png`,
      );
      toast("PNG exported.");
    } catch (error) {
      console.error(error);
      toast("Could not export PNG.");
    } finally {
      clone?.remove();
      exportPngButton.disabled = false;
      exportPngButton.textContent = label;
    }
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

  if (roundedCornersCheckbox) {
    roundedCornersCheckbox.addEventListener("change", () => {
      state.rounded = roundedCornersCheckbox.checked;
      saveState();
    });
  }

  unratedLevelsCheckbox.addEventListener("change", syncUnratedWarning);

  if (titleInput) {
    titleInput.addEventListener("input", () => {
      state.title = titleInput.value;
      renderGrid();
    });
  }

  if (saveDataButton) {
    saveDataButton.addEventListener("click", exportTopsterData);
  }

  if (importDataButton && importFileInput) {
    importDataButton.addEventListener("click", () => importFileInput.click());
  }

  if (importFileInput) {
    importFileInput.addEventListener("change", async () => {
      const file = importFileInput.files?.[0];
      importFileInput.value = "";
      if (!file) return;

      try {
        importTopsterData(JSON.parse(await file.text()));
        toast("Topster imported.");
      } catch (error) {
        console.error(error);
        toast("Could not import that topster.");
      }
    });
  }

  if (exportPngButton) {
    exportPngButton.addEventListener("click", exportPng);
  }

  if (resetGridButton) {
    resetGridButton.addEventListener("click", resetGrid);
  }

  const observer =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(updateChartScale)
      : null;
  if (observer) observer.observe(gridArea);
  window.addEventListener("resize", updateChartScale);

  loadState();
  syncControlsFromState();
  syncUnratedWarning();
  activateTab("add-level");
  renderGrid();

  window.GDTopsterGrid = {
    addLevel,
    addLevelToFirstEmpty,
    getState,
    startPointerDrag,
    toast,
  };
})();
