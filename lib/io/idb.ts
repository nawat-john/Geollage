import { openDB, type IDBPDatabase } from "idb";
import type { ProjectFileV1 } from "./projectFile";

const DB_NAME = "tecto-studio";
const DB_VERSION = 1;
const STORE = "autosave";
const AUTOSAVE_KEY = "current";

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment"));
  }
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      },
    });
  }
  return dbPromise;
}

export async function saveAutosave(project: ProjectFileV1): Promise<void> {
  try {
    const db = await getDb();
    await db.put(STORE, project, AUTOSAVE_KEY);
  } catch {
    // Autosave is a convenience, not a guarantee — swallow storage errors
    // (private browsing, quota, disabled IDB, etc).
  }
}

export async function loadAutosave(): Promise<ProjectFileV1 | null> {
  try {
    const db = await getDb();
    const value = await db.get(STORE, AUTOSAVE_KEY);
    return (value as ProjectFileV1) ?? null;
  } catch {
    return null;
  }
}

export async function clearAutosave(): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(STORE, AUTOSAVE_KEY);
  } catch {
    // ignore
  }
}
