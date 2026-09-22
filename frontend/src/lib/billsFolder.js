/**
 * Write saved invoice PDFs into a folder the shop picks once.
 * Chrome/Edge remember the handle. Other browsers fall back to a normal download.
 */

const DB_NAME = "dukansaathi-files";
const STORE = "handles";
const KEY = "bills-dir";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadBillsDir() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function saveBillsDir(handle) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function canPickBillsDir() {
  return typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
}

let memoryHandle = null;

function remember(handle) {
  memoryHandle = handle;
  saveBillsDir(handle).catch(() => {});
  return handle;
}

function pickFresh() {
  try {
    return window.showDirectoryPicker({
      id: "dukansaathi-bills",
      startIn: "downloads",
      mode: "readwrite",
    }).then((handle) => remember(handle)).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

if (typeof indexedDB !== "undefined") {
  loadBillsDir().then((handle) => {
    if (handle && !memoryHandle) memoryHandle = handle;
  }).catch(() => {});
}

/**
 * Call during the Save click, before any await. The picker or permission
 * request starts in that same turn so Chrome still treats it as the click.
 * Returns null when the shop skips the picker or this browser cannot hold a folder.
 */
export function ensureBillsDir() {
  if (!canPickBillsDir()) return Promise.resolve(null);
  const handle = memoryHandle;
  if (!handle) return pickFresh();
  try {
    const ask = typeof handle.requestPermission === "function"
      ? handle.requestPermission({ mode: "readwrite" })
      : Promise.resolve("granted");
    return Promise.resolve(ask).then((perm) => (perm === "granted" ? handle : pickFresh())).catch(() => pickFresh());
  } catch {
    return pickFresh();
  }
}

export async function writeBillPdf(dir, filename, blob) {
  const file = await dir.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
}

export function downloadBillPdf(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "invoice.pdf";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
