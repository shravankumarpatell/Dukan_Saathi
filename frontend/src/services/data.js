// Unified data layer. In DEMO mode -> localStorage. In Firebase mode -> Firestore.
// All data is scoped by shopId (per-shop separation, PRD I2).
import { IS_DEMO } from "@/services/config";
import { db } from "@/firebase";
import { seedData } from "@/services/seed";
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query,
} from "firebase/firestore";

const uid = () => "id_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const COLLS = ["products", "customers", "invoices", "expenses", "stockLedger", "returns"];

/* ---------------- DEMO (localStorage) ---------------- */
const LKEY = (shopId) => `dukansaathi_${shopId}`;

function demoRead(shopId) {
  const raw = localStorage.getItem(LKEY(shopId));
  if (raw) return JSON.parse(raw);
  const seeded = seedData();
  localStorage.setItem(LKEY(shopId), JSON.stringify(seeded));
  return seeded;
}
function demoWrite(shopId, data) {
  localStorage.setItem(LKEY(shopId), JSON.stringify(data));
}

const demoApi = {
  async ensureShop(shopId, shopInfo) {
    const key = `dukansaathi_shop_${shopId}`;
    let shop = JSON.parse(localStorage.getItem(key) || "null");
    if (!shop) {
      shop = { id: shopId, name: "Demo Tiles & Sanitary", ownerName: "Owner", phone: "", gstEnabled: true, gstin: "", address: "Main Market Road, Bhilwara", ...shopInfo };
      localStorage.setItem(key, JSON.stringify(shop));
      demoRead(shopId); // seed products etc.
    }
    return shop;
  },
  async getShop(shopId) {
    return JSON.parse(localStorage.getItem(`dukansaathi_shop_${shopId}`) || "null");
  },
  async saveShop(shopId, patch) {
    const key = `dukansaathi_shop_${shopId}`;
    const cur = JSON.parse(localStorage.getItem(key) || "{}");
    const next = { ...cur, ...patch, id: shopId };
    localStorage.setItem(key, JSON.stringify(next));
    return next;
  },
  async list(shopId, coll) {
    return demoRead(shopId)[coll] || [];
  },
  async add(shopId, coll, obj) {
    const data = demoRead(shopId);
    const item = { id: uid(), ...obj };
    data[coll] = [item, ...(data[coll] || [])];
    demoWrite(shopId, data);
    return item;
  },
  async update(shopId, coll, id, patch) {
    const data = demoRead(shopId);
    data[coll] = (data[coll] || []).map((x) => (x.id === id ? { ...x, ...patch } : x));
    demoWrite(shopId, data);
    return data[coll].find((x) => x.id === id);
  },
  async remove(shopId, coll, id) {
    const data = demoRead(shopId);
    data[coll] = (data[coll] || []).filter((x) => x.id !== id);
    demoWrite(shopId, data);
  },
  async nextInvoiceSeq(shopId) {
    const data = demoRead(shopId);
    data.meta = data.meta || { invoiceSeq: 1 };
    const seq = data.meta.invoiceSeq;
    data.meta.invoiceSeq = seq + 1;
    demoWrite(shopId, data);
    return seq;
  },
};

/* ---------------- FIREBASE (Firestore) ---------------- */
const fbApi = {
  async ensureShop(shopId, shopInfo) {
    const ref = doc(db, "shops", shopId);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const shop = { name: shopInfo?.name || "My Shop", ownerName: shopInfo?.ownerName || "", phone: "", gstEnabled: true, gstin: "", address: "", invoiceSeq: 1 };
      await setDoc(ref, shop);
      return { id: shopId, ...shop };
    }
    return { id: shopId, ...snap.data() };
  },
  async getShop(shopId) {
    const snap = await getDoc(doc(db, "shops", shopId));
    return snap.exists() ? { id: shopId, ...snap.data() } : null;
  },
  async saveShop(shopId, patch) {
    await updateDoc(doc(db, "shops", shopId), patch);
    return this.getShop(shopId);
  },
  async list(shopId, coll) {
    const q = query(collection(db, "shops", shopId, coll));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },
  async add(shopId, coll, obj) {
    const ref = await addDoc(collection(db, "shops", shopId, coll), obj);
    return { id: ref.id, ...obj };
  },
  async update(shopId, coll, id, patch) {
    await updateDoc(doc(db, "shops", shopId, coll, id), patch);
    return { id, ...patch };
  },
  async remove(shopId, coll, id) {
    await deleteDoc(doc(db, "shops", shopId, coll, id));
  },
  async nextInvoiceSeq(shopId) {
    const shop = await this.getShop(shopId);
    const seq = shop?.invoiceSeq || 1;
    await updateDoc(doc(db, "shops", shopId), { invoiceSeq: seq + 1 });
    return seq;
  },
};

const api = IS_DEMO ? demoApi : fbApi;
export default api;
export { COLLS };
