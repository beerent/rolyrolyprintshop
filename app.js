const DB_NAME = "print-parade";
const DB_VERSION = 1;
const STORE_NAME = "images";

const appShell = document.querySelector(".app-shell");
const uploadButton = document.querySelector("#uploadButton");
const emptyUploadButton = document.querySelector("#emptyUploadButton");
const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const grid = document.querySelector("#imageGrid");
const emptyState = document.querySelector("#emptyState");
const imageCount = document.querySelector("#imageCount");
const statusText = document.querySelector("#statusText");
const saveState = document.querySelector("#saveState");
const toast = document.querySelector("#toast");

let images = [];
let openMenuId = null;
let toastTimer = 0;

function makeId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 2800);
}

function formatCount(count) {
  if (count === 0) return "No images";
  if (count === 1) return "1 image";
  return `${count} images`;
}

function setSaving(isSaving) {
  saveState.textContent = isSaving ? "Saving" : "";
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Image storage is blocked."));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadRecords() {
  if (!("indexedDB" in window)) return [];

  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const done = transactionDone(transaction);
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll());
    await done;
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } finally {
    db.close();
  }
}

async function saveRecords(records) {
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const done = transactionDone(transaction);
    records.forEach((record) => store.put(record));
    await done;
  } finally {
    db.close();
  }
}

async function deleteRecord(id) {
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const done = transactionDone(transaction);
    transaction.objectStore(STORE_NAME).delete(id);
    await done;
  } finally {
    db.close();
  }
}

function toView(record) {
  return {
    ...record,
    src: URL.createObjectURL(record.blob)
  };
}

function revokeImage(image) {
  if (image?.src) URL.revokeObjectURL(image.src);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function printImage(image) {
  const frame = document.createElement("iframe");
  frame.title = `Print ${image.name}`;
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  frame.style.opacity = "0";
  document.body.appendChild(frame);

  const printWindow = frame.contentWindow;
  const printDocument = printWindow?.document;
  if (!printWindow || !printDocument) {
    frame.remove();
    showToast("Could not start print.");
    return;
  }

  const cleanup = () => {
    window.setTimeout(() => frame.remove(), 400);
  };

  const runPrint = () => {
    printWindow.focus();
    printWindow.print();
    window.setTimeout(() => {
      if (document.body.contains(frame)) frame.remove();
    }, 60000);
  };

  printWindow.addEventListener("afterprint", cleanup, { once: true });
  printDocument.open();
  printDocument.write(`<!doctype html>
<html>
  <head>
    <title>${escapeHtml(image.name)}</title>
    <style>
      @page { margin: 0; }
      html, body { width: 100%; height: 100%; margin: 0; }
      body { display: flex; align-items: center; justify-content: center; background: white; }
      img { max-width: 100vw; max-height: 100vh; object-fit: contain; }
    </style>
  </head>
  <body>
    <img alt="" src="${escapeHtml(image.src)}">
  </body>
</html>`);
  printDocument.close();

  const img = printDocument.querySelector("img");
  if (!img) {
    frame.remove();
    showToast("Could not prepare image.");
    return;
  }

  img.addEventListener("error", () => {
    frame.remove();
    showToast("Could not load image.");
  }, { once: true });

  if (img.complete) {
    window.setTimeout(runPrint, 100);
  } else {
    img.addEventListener("load", () => window.setTimeout(runPrint, 100), { once: true });
  }
}

function createTile(image) {
  const tile = document.createElement("article");
  tile.className = "tile";
  tile.dataset.id = image.id;

  const imageButton = document.createElement("button");
  imageButton.className = "image-button";
  imageButton.type = "button";
  imageButton.setAttribute("aria-label", `Print ${image.name}`);
  imageButton.addEventListener("click", () => printImage(image));

  const img = document.createElement("img");
  img.src = image.src;
  img.alt = image.name;
  imageButton.append(img);

  const caption = document.createElement("div");
  caption.className = "caption";
  caption.textContent = image.name;

  const menuWrap = document.createElement("div");
  menuWrap.className = "menu-wrap";
  menuWrap.dataset.menu = "";

  const menuButton = document.createElement("button");
  menuButton.className = "menu-button";
  menuButton.type = "button";
  menuButton.textContent = "...";
  menuButton.setAttribute("aria-label", `${image.name} settings`);
  menuButton.setAttribute("aria-expanded", String(openMenuId === image.id));
  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    openMenuId = openMenuId === image.id ? null : image.id;
    render();
  });

  const menu = document.createElement("div");
  menu.className = "menu";
  menu.role = "menu";
  menu.hidden = openMenuId !== image.id;

  const deleteButton = document.createElement("button");
  deleteButton.className = "menu-item";
  deleteButton.type = "button";
  deleteButton.role = "menuitem";
  deleteButton.textContent = "Delete";
  deleteButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    await removeImage(image.id);
  });

  menu.append(deleteButton);
  menuWrap.append(menuButton, menu);
  tile.append(imageButton, caption, menuWrap);
  return tile;
}

function render() {
  grid.replaceChildren(...images.map(createTile));
  imageCount.textContent = formatCount(images.length);
  statusText.textContent = images.length ? "Ready" : "Empty";
  emptyState.hidden = images.length > 0;
  appShell.dataset.state = images.length ? "ready" : "empty";
}

async function addFiles(fileList) {
  const files = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
  if (!files.length) {
    showToast("Choose image files.");
    return;
  }

  setSaving(true);
  try {
    const records = files.map((file) => ({
      id: makeId(),
      name: file.name || "picture",
      type: file.type,
      size: file.size,
      createdAt: new Date().toISOString(),
      blob: file
    }));

    await saveRecords(records);
    const views = records.map(toView);
    images = [...views, ...images];
    openMenuId = null;
    render();
    showToast(`${formatCount(views.length)} added.`);
  } catch (error) {
    console.error(error);
    showToast("Could not save images.");
  } finally {
    setSaving(false);
    fileInput.value = "";
  }
}

async function removeImage(id) {
  const image = images.find((item) => item.id === id);
  if (!image) return;

  setSaving(true);
  try {
    await deleteRecord(id);
    images = images.filter((item) => item.id !== id);
    revokeImage(image);
    openMenuId = null;
    render();
    showToast("Deleted.");
  } catch (error) {
    console.error(error);
    showToast("Could not delete image.");
  } finally {
    setSaving(false);
  }
}

async function boot() {
  try {
    const records = await loadRecords();
    images = records.map(toView);
    render();
  } catch (error) {
    console.error(error);
    showToast("Could not load images.");
    statusText.textContent = "Storage unavailable";
  }
}

uploadButton.addEventListener("click", () => fileInput.click());
emptyUploadButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => addFiles(fileInput.files ?? []));

dropZone.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dropZone.classList.add("is-dragging");
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
});

dropZone.addEventListener("dragleave", (event) => {
  if (!dropZone.contains(event.relatedTarget)) {
    dropZone.classList.remove("is-dragging");
  }
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("is-dragging");
  addFiles(event.dataTransfer?.files ?? []);
});

document.addEventListener("pointerdown", (event) => {
  if (!openMenuId) return;
  if (event.target.closest("[data-menu]")) return;
  openMenuId = null;
  render();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && openMenuId) {
    openMenuId = null;
    render();
  }
});

window.addEventListener("beforeunload", () => {
  images.forEach(revokeImage);
});

boot();
