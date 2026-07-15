import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  deleteObject,
  getBlob,
  getStorage,
  ref as storageRef,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";

const firebaseConfig = {
  projectId: "rolyrolyprintshop",
  appId: "1:392025179670:web:f0c8c06d97f298f098d737",
  storageBucket: "rolyrolyprintshop.firebasestorage.app",
  apiKey: "AIzaSyB-laHbRGF5HDmSuoUqUipTiamOmuB9jNs",
  authDomain: "rolyrolyprintshop.firebaseapp.com",
  messagingSenderId: "392025179670"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const firestore = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);

const DB_NAME = "rollie-pollie-print-shop";
const DB_VERSION = 1;
const STORE_NAME = "images";
const LEGACY_DB_NAMES = ["print-parade"];
const MAX_FILE_SIZE = 20 * 1024 * 1024;

const appShell = document.querySelector(".app-shell");
const appActions = document.querySelector("#appActions");
const authView = document.querySelector("#authView");
const authForm = document.querySelector("#authForm");
const authTitle = document.querySelector("#authTitle");
const authEmail = document.querySelector("#authEmail");
const authPassword = document.querySelector("#authPassword");
const authSubmit = document.querySelector("#authSubmit");
const authMessage = document.querySelector("#authMessage");
const resetPasswordButton = document.querySelector("#resetPasswordButton");
const authTabs = Array.from(document.querySelectorAll("[data-auth-mode]"));
const workspace = document.querySelector("#workspace");
const userInitial = document.querySelector("#userInitial");
const userEmail = document.querySelector("#userEmail");
const signOutButton = document.querySelector("#signOutButton");
const uploadButton = document.querySelector("#uploadButton");
const emptyUploadButton = document.querySelector("#emptyUploadButton");
const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const grid = document.querySelector("#imageGrid");
const emptyState = document.querySelector("#emptyState");
const imageCount = document.querySelector("#imageCount");
const statusText = document.querySelector("#statusText");
const saveState = document.querySelector("#saveState");
const migrationBanner = document.querySelector("#migrationBanner");
const migrationText = document.querySelector("#migrationText");
const importMigrationButton = document.querySelector("#importMigrationButton");
const dismissMigrationButton = document.querySelector("#dismissMigrationButton");
const toast = document.querySelector("#toast");

let authMode = "signin";
let currentUser = null;
let images = [];
let localRecords = [];
let migrationDismissed = false;
let openMenuId = null;
let pastedImageCount = 0;
let toastTimer = 0;
let unsubscribeImages = null;
let imageLoadVersion = 0;

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
  }, 3200);
}

function formatCount(count) {
  if (count === 0) return "No images";
  if (count === 1) return "1 image";
  return `${count} images`;
}

function extensionForType(type) {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  if (type === "image/svg+xml") return "svg";
  return "jpg";
}

function setSaving(isSaving, label = "Saving") {
  saveState.textContent = isSaving ? label : "";
  uploadButton.disabled = isSaving;
  emptyUploadButton.disabled = isSaving;
  importMigrationButton.disabled = isSaving;
}

function setAuthMessage(message, isError = false) {
  authMessage.textContent = message;
  authMessage.classList.toggle("is-error", isError);
}

function setAuthBusy(isBusy) {
  authEmail.disabled = isBusy;
  authPassword.disabled = isBusy;
  authSubmit.disabled = isBusy;
  resetPasswordButton.disabled = isBusy;
  authSubmit.textContent = isBusy
    ? authMode === "signup" ? "Creating account" : "Signing in"
    : authMode === "signup" ? "Create account" : "Sign in";
}

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === "signup";
  authTitle.textContent = isSignup ? "Create your print shop account" : "Sign in to your shop";
  authPassword.autocomplete = isSignup ? "new-password" : "current-password";
  authSubmit.textContent = isSignup ? "Create account" : "Sign in";
  resetPasswordButton.hidden = isSignup;
  setAuthMessage("");

  authTabs.forEach((tab) => {
    const isActive = tab.dataset.authMode === mode;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
}

function formatAuthError(error) {
  const messages = {
    "auth/email-already-in-use": "An account already exists for that email.",
    "auth/invalid-credential": "That email and password do not match.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/network-request-failed": "Could not reach Firebase. Check your connection and try again.",
    "auth/too-many-requests": "Too many attempts. Wait a moment and try again.",
    "auth/user-not-found": "That email and password do not match.",
    "auth/weak-password": "Use a password with at least 6 characters.",
    "auth/wrong-password": "That email and password do not match."
  };
  return messages[error?.code] ?? "Could not complete that request. Try again.";
}

function openDb(name = DB_NAME) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DB_VERSION);

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

async function databaseExists(name) {
  if (!indexedDB.databases) return true;
  const databases = await indexedDB.databases();
  return databases.some((database) => database.name === name);
}

async function readLocalRecords(dbName) {
  const db = await openDb(dbName);
  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const done = transactionDone(transaction);
    const records = await requestResult(transaction.objectStore(STORE_NAME).getAll());
    await done;
    return records;
  } finally {
    db.close();
  }
}

async function saveLocalRecords(records) {
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

async function loadLocalRecords() {
  if (!("indexedDB" in window)) return [];

  const records = await readLocalRecords(DB_NAME);
  if (records.length) return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  for (const legacyName of LEGACY_DB_NAMES) {
    if (!(await databaseExists(legacyName))) continue;
    const legacyRecords = await readLocalRecords(legacyName);
    if (!legacyRecords.length) continue;
    await saveLocalRecords(legacyRecords);
    return legacyRecords.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return [];
}

async function deleteLocalRecords(ids) {
  if (!ids.length) return;
  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const done = transactionDone(transaction);
    ids.forEach((id) => store.delete(id));
    await done;
  } finally {
    db.close();
  }
}

function revokeImage(image) {
  if (image?.src) URL.revokeObjectURL(image.src);
}

function clearImages() {
  imageLoadVersion += 1;
  images.forEach(revokeImage);
  images = [];
  openMenuId = null;
  grid.replaceChildren();
  imageCount.textContent = formatCount(0);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function printImage(image) {
  if (!image.src) {
    showToast("This preview is not available yet.");
    return;
  }

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

  const cleanup = () => window.setTimeout(() => frame.remove(), 400);
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
  imageButton.setAttribute("aria-label", image.src ? `Print ${image.name}` : `${image.name} preview unavailable`);
  imageButton.addEventListener("click", () => printImage(image));

  if (image.src) {
    const img = document.createElement("img");
    img.src = image.src;
    img.alt = image.name;
    imageButton.append(img);
  } else {
    const unavailable = document.createElement("span");
    unavailable.className = "image-unavailable";
    unavailable.textContent = "Preview unavailable";
    imageButton.append(unavailable);
  }

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
    await removeImage(image);
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

function updateMigrationBanner() {
  const shouldShow = currentUser && localRecords.length > 0 && !migrationDismissed;
  migrationBanner.hidden = !shouldShow;
  if (!shouldShow) return;
  migrationText.textContent = `${formatCount(localRecords.length)} saved on this device.`;
}

async function refreshLocalMigration(userId) {
  try {
    const records = await loadLocalRecords();
    if (currentUser?.uid !== userId) return;
    localRecords = records;
    updateMigrationBanner();
  } catch (error) {
    console.error(error);
  }
}

function storageSetupMessage(error) {
  const setupCodes = new Set([
    "storage/bucket-not-found",
    "storage/unknown",
    "storage/retry-limit-exceeded"
  ]);
  if (setupCodes.has(error?.code)) {
    return "Cloud image storage needs one final Firebase setup step.";
  }
  if (error?.code === "storage/unauthorized") {
    return "Firebase did not allow that image upload.";
  }
  return "Could not save images.";
}

async function uploadEntry(entry, user) {
  const id = makeId();
  const path = `users/${user.uid}/images/${id}`;
  const objectReference = storageRef(storage, path);
  await uploadBytes(objectReference, entry.file, {
    contentType: entry.file.type,
    customMetadata: {
      ownerId: user.uid,
      originalName: entry.file.name || "picture"
    }
  });

  try {
    await setDoc(doc(firestore, "users", user.uid, "images", id), {
      id,
      name: entry.file.name || "picture",
      type: entry.file.type,
      size: entry.file.size,
      createdAt: new Date().toISOString(),
      storagePath: path
    });
  } catch (error) {
    await deleteObject(objectReference).catch(() => {});
    throw error;
  }

  return entry;
}

async function uploadEntries(entries) {
  const user = currentUser;
  if (!user || !entries.length) return [];

  setSaving(true, "Uploading");
  const results = await Promise.allSettled(entries.map((entry) => uploadEntry(entry, user)));
  const uploaded = results
    .map((result, index) => result.status === "fulfilled" ? entries[index] : null)
    .filter(Boolean);
  const failure = results.find((result) => result.status === "rejected");

  if (failure) {
    console.error(failure.reason);
    showToast(storageSetupMessage(failure.reason));
  } else {
    showToast(`${formatCount(uploaded.length)} added.`);
  }

  setSaving(false);
  fileInput.value = "";
  return uploaded;
}

async function addFiles(fileList) {
  if (!currentUser) return;

  const selected = Array.from(fileList);
  const imageFiles = selected.filter((file) => file.type.startsWith("image/"));
  const accepted = imageFiles.filter((file) => file.size <= MAX_FILE_SIZE);

  if (!imageFiles.length) {
    showToast("Choose image files.");
    return;
  }
  if (!accepted.length) {
    showToast("Images must be smaller than 20 MB.");
    return;
  }
  if (accepted.length < imageFiles.length) {
    showToast("Images over 20 MB were skipped.");
  }

  await uploadEntries(accepted.map((file) => ({ file })));
}

async function importLocalImages() {
  if (!currentUser || !localRecords.length) return;

  const entries = localRecords.map((record) => ({
    localId: record.id,
    file: new File([record.blob], record.name || "picture", { type: record.type || record.blob.type })
  }));
  const uploaded = await uploadEntries(entries);
  const uploadedIds = uploaded.map((entry) => entry.localId).filter(Boolean);
  await deleteLocalRecords(uploadedIds);
  localRecords = localRecords.filter((record) => !uploadedIds.includes(record.id));
  updateMigrationBanner();
}

async function addPastedImages(clipboardData) {
  if (!currentUser || !clipboardData?.items?.length) return;

  const files = Array.from(clipboardData.items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter(Boolean)
    .map((file) => {
      pastedImageCount += 1;
      const extension = extensionForType(file.type);
      return new File([file], `pasted-image-${pastedImageCount}.${extension}`, { type: file.type });
    });

  if (files.length) await addFiles(files);
}

async function removeImage(image) {
  const user = currentUser;
  if (!user) return;

  setSaving(true, "Deleting");
  try {
    await deleteDoc(doc(firestore, "users", user.uid, "images", image.id));
    await deleteObject(storageRef(storage, image.storagePath)).catch((error) => {
      console.error(error);
    });
    showToast("Deleted.");
  } catch (error) {
    console.error(error);
    showToast("Could not delete image.");
  } finally {
    setSaving(false);
  }
}

async function applyImageSnapshot(snapshot, userId) {
  const version = ++imageLoadVersion;
  const previous = new Map(images.map((image) => [image.id, image]));

  const next = await Promise.all(snapshot.docs.map(async (document) => {
    const record = { ...document.data(), id: document.id };
    const existing = previous.get(record.id);
    if (existing?.storagePath === record.storagePath && existing.src) {
      return { ...record, src: existing.src };
    }

    try {
      const blob = await getBlob(storageRef(storage, record.storagePath));
      return { ...record, src: URL.createObjectURL(blob) };
    } catch (error) {
      console.error(error);
      return { ...record, src: "" };
    }
  }));

  if (version !== imageLoadVersion || currentUser?.uid !== userId) {
    next.forEach((image) => {
      if (previous.get(image.id)?.src !== image.src) revokeImage(image);
    });
    return;
  }

  const nextById = new Map(next.map((image) => [image.id, image]));
  images.forEach((image) => {
    if (nextById.get(image.id)?.src !== image.src) revokeImage(image);
  });
  images = next;
  openMenuId = null;
  render();
}

function startImagesSubscription(user) {
  statusText.textContent = "Loading your picture wall";
  const imageQuery = query(
    collection(firestore, "users", user.uid, "images"),
    orderBy("createdAt", "desc")
  );

  unsubscribeImages = onSnapshot(
    imageQuery,
    (snapshot) => void applyImageSnapshot(snapshot, user.uid),
    (error) => {
      console.error(error);
      statusText.textContent = "Cloud sync unavailable";
      showToast("Could not load your images from Firebase.");
    }
  );
}

async function handleAuthState(user) {
  if (unsubscribeImages) {
    unsubscribeImages();
    unsubscribeImages = null;
  }
  clearImages();
  currentUser = user;
  migrationDismissed = false;
  localRecords = [];
  migrationBanner.hidden = true;

  if (!user) {
    appShell.dataset.auth = "signed-out";
    appActions.hidden = true;
    workspace.hidden = true;
    authView.hidden = false;
    appShell.dataset.state = "auth";
    return;
  }

  appShell.dataset.auth = "signed-in";
  authView.hidden = true;
  appActions.hidden = false;
  workspace.hidden = false;
  userEmail.textContent = user.email ?? "Signed in";
  userInitial.textContent = (user.email?.trim()[0] ?? "R").toUpperCase();
  startImagesSubscription(user);
  await refreshLocalMigration(user.uid);
}

authTabs.forEach((tab) => {
  tab.addEventListener("click", () => setAuthMode(tab.dataset.authMode));
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setAuthMessage("");
  setAuthBusy(true);

  try {
    if (authMode === "signup") {
      await createUserWithEmailAndPassword(auth, authEmail.value.trim(), authPassword.value);
    } else {
      await signInWithEmailAndPassword(auth, authEmail.value.trim(), authPassword.value);
    }
    authForm.reset();
  } catch (error) {
    console.error(error);
    setAuthMessage(formatAuthError(error), true);
  } finally {
    setAuthBusy(false);
  }
});

resetPasswordButton.addEventListener("click", async () => {
  const email = authEmail.value.trim();
  if (!email) {
    setAuthMessage("Enter your email first.", true);
    authEmail.focus();
    return;
  }

  setAuthBusy(true);
  try {
    await sendPasswordResetEmail(auth, email);
    setAuthMessage("Password reset email sent.");
  } catch (error) {
    console.error(error);
    setAuthMessage(formatAuthError(error), true);
  } finally {
    setAuthBusy(false);
  }
});

signOutButton.addEventListener("click", () => signOut(auth));
uploadButton.addEventListener("click", () => fileInput.click());
emptyUploadButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => addFiles(fileInput.files ?? []));
importMigrationButton.addEventListener("click", importLocalImages);
dismissMigrationButton.addEventListener("click", () => {
  migrationDismissed = true;
  updateMigrationBanner();
});

dropZone.addEventListener("dragenter", (event) => {
  event.preventDefault();
  if (currentUser) dropZone.classList.add("is-dragging");
});

dropZone.addEventListener("dragover", (event) => event.preventDefault());

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

document.addEventListener("paste", (event) => void addPastedImages(event.clipboardData));

document.addEventListener("pointerdown", (event) => {
  if (!openMenuId || event.target.closest("[data-menu]")) return;
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
  if (unsubscribeImages) unsubscribeImages();
});

setAuthMode("signin");
onAuthStateChanged(auth, (user) => void handleAuthState(user));
