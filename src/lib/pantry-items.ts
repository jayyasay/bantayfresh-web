import { supabase } from "./supabase";
import {
  type InventorySpaceKey,
  normalizeInventorySpace,
} from "./inventory-spaces";

const BARCODE_NOTE_PATTERN = /(?:^|\n)\[barcode\]\s*(.+?)(?=\n|$)/i;
const INVENTORY_SPACE_NOTE_PATTERN = /(?:^|\n)\[space\]\s*(.+?)(?=\n|$)/i;
const LOW_STOCK_NOTE_PATTERN = /(?:^|\n)\[low_stock\]\s*(.+?)(?=\n|$)/i;

export type PantryItemRecord = {
  id: string;
  user_id: string;
  barcode: string | null;
  name: string;
  category: string | null;
  quantity: number;
  unit: string | null;
  expiry_date: string | null;
  photo_url: string | null;
  space: InventorySpaceKey | null;
  stock_status: PantryStockStatus | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PantryItemInsert = {
  barcode?: string | null;
  name: string;
  category: string | null;
  quantity: number;
  unit: string | null;
  expiry_date: string | null;
  photo_url: string | null;
  space?: InventorySpaceKey | null;
  stock_status?: PantryStockStatus | null;
  notes: string | null;
};

export type PantryItemUpdate = Partial<PantryItemInsert>;

export type PantryItemSuggestion = {
  name: string;
  category: string | null;
};

export type BarcodeLookupRecord = {
  barcode: string;
  product_name: string;
};

export type PantryStockStatus = "in_stock" | "low_stock";

type PantryItemNotesSource =
  | string
  | {
      barcode?: string | null;
      notes?: string | null;
      space?: string | null;
      stock_status?: string | null;
    }
  | null
  | undefined;

type PantryListCacheEntry = {
  data: PantryItemRecord[];
  expiresAt: number;
};

type PantryItemCacheEntry = {
  data: PantryItemRecord;
  expiresAt: number;
};

type BarcodeLookupCacheEntry = {
  data: BarcodeLookupRecord | null;
  expiresAt: number;
};

const PANTRY_QUERY_CACHE_TTL_MS = 5 * 60 * 1000;
const pantryItemsListCache = new Map<string, PantryListCacheEntry>();
const pantryItemsListRequests = new Map<string, Promise<{ data: PantryItemRecord[] | null; error: unknown }>>();
const pantryItemCache = new Map<string, PantryItemCacheEntry>();
const pantryItemRequests = new Map<string, Promise<{ data: PantryItemRecord | null; error: unknown }>>();
const barcodeLookupCache = new Map<string, BarcodeLookupCacheEntry>();
const barcodeLookupRequests = new Map<string, Promise<{ data: BarcodeLookupRecord | null; error: unknown }>>();

const PANTRY_ITEM_COLUMNS =
  "id, user_id, barcode, name, category, quantity, unit, expiry_date, photo_url, space, stock_status, notes, created_at, updated_at";

const SUPABASE_CONFIGURATION_ERROR =
  "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to web/.env and restart the app.";

function requireSupabaseClient() {
  if (!supabase) {
    throw new Error(SUPABASE_CONFIGURATION_ERROR);
  }

  return supabase;
}

function getFileExtension(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName) {
    return fromName;
  }

  if (file.type === "image/png") {
    return "png";
  }

  if (file.type === "image/webp") {
    return "webp";
  }

  return "jpg";
}

function getSourceNotes(value: PantryItemNotesSource) {
  if (typeof value === "string") {
    return value;
  }

  return value?.notes ?? null;
}

function getListCacheKey(userId: string) {
  return userId;
}

function getItemCacheKey(userId: string, itemId: string) {
  return `${userId}:${itemId}`;
}

function getBarcodeCacheKey(barcode: string) {
  return getBarcodeLookupCandidates(barcode)[0] ?? barcode.trim();
}

function primePantryItemCaches(userId: string, items: PantryItemRecord[]) {
  const now = Date.now();
  pantryItemsListCache.set(getListCacheKey(userId), {
    data: items,
    expiresAt: now + PANTRY_QUERY_CACHE_TTL_MS,
  });

  items.forEach((item) => {
    pantryItemCache.set(getItemCacheKey(userId, item.id), {
      data: item,
      expiresAt: now + PANTRY_QUERY_CACHE_TTL_MS,
    });
  });
}

export function invalidatePantryItemsCache(userId?: string) {
  if (userId) {
    pantryItemsListCache.delete(getListCacheKey(userId));
  } else {
    pantryItemsListCache.clear();
  }

  pantryItemsListRequests.clear();
}

export function invalidatePantryItemCache(userId?: string, itemId?: string) {
  if (userId && itemId) {
    pantryItemCache.delete(getItemCacheKey(userId, itemId));
  } else if (userId) {
    for (const key of pantryItemCache.keys()) {
      if (key.startsWith(`${userId}:`)) {
        pantryItemCache.delete(key);
      }
    }
  } else {
    pantryItemCache.clear();
  }

  pantryItemRequests.clear();
}

export function invalidateBarcodeLookupCache(barcode?: string) {
  if (barcode) {
    barcodeLookupCache.delete(getBarcodeCacheKey(barcode));
    return;
  }

  barcodeLookupCache.clear();
  barcodeLookupRequests.clear();
}

export function normalizePantryItemStockStatus(
  value: string | null | undefined,
): PantryStockStatus {
  const normalized = value?.trim().toLowerCase();
  return normalized === "low_stock" || normalized === "low stock"
    ? "low_stock"
    : "in_stock";
}

export function getPantryItemBarcode(value: PantryItemNotesSource) {
  if (typeof value !== "string" && value?.barcode?.trim()) {
    return value.barcode.trim();
  }

  const notes = getSourceNotes(value);
  const match = notes?.match(BARCODE_NOTE_PATTERN);
  const barcode = match?.[1]?.trim();
  return barcode ? barcode : null;
}

export function getPantryItemInventorySpace(value: PantryItemNotesSource): InventorySpaceKey {
  if (typeof value !== "string" && value?.space) {
    return normalizeInventorySpace(value.space) ?? "kitchen";
  }

  const notes = getSourceNotes(value);
  const match = notes?.match(INVENTORY_SPACE_NOTE_PATTERN);
  return normalizeInventorySpace(match?.[1]) ?? "kitchen";
}

export function getPantryItemIsLowStock(value: PantryItemNotesSource) {
  if (typeof value !== "string" && typeof value?.stock_status === "string") {
    return normalizePantryItemStockStatus(value.stock_status) === "low_stock";
  }

  const notes = getSourceNotes(value);
  const match = notes?.match(LOW_STOCK_NOTE_PATTERN);
  const normalizedValue = match?.[1]?.trim().toLowerCase();

  return normalizedValue === "true" || normalizedValue === "yes" || normalizedValue === "1";
}

export function getBarcodeLookupCandidates(barcode: string) {
  const trimmedBarcode = barcode.trim();
  if (!trimmedBarcode) {
    return [];
  }

  const digitsOnlyBarcode = trimmedBarcode.replace(/\D/g, "");
  const candidates: string[] = [];

  const pushCandidate = (value: string | null | undefined) => {
    const normalizedValue = value?.trim();
    if (!normalizedValue || candidates.includes(normalizedValue)) {
      return;
    }

    candidates.push(normalizedValue);
  };

  pushCandidate(trimmedBarcode);
  if (digitsOnlyBarcode) {
    pushCandidate(digitsOnlyBarcode);
  }

  if (digitsOnlyBarcode.length === 12) {
    pushCandidate(`0${digitsOnlyBarcode}`);
  }

  if (digitsOnlyBarcode.length === 13 && digitsOnlyBarcode.startsWith("0")) {
    pushCandidate(digitsOnlyBarcode.slice(1));
  }

  return candidates;
}

export function getPantryItemDisplayNotes(value: PantryItemNotesSource) {
  const notes = getSourceNotes(value);
  if (!notes) {
    return null;
  }

  const cleaned = notes
    .replace(BARCODE_NOTE_PATTERN, "")
    .replace(INVENTORY_SPACE_NOTE_PATTERN, "")
    .replace(LOW_STOCK_NOTE_PATTERN, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned.length > 0 ? cleaned : null;
}

export function composePantryItemNotes(
  notes: string | null,
  _barcode: string | null,
  _metadata?: {
    inventorySpace?: InventorySpaceKey | null;
    isLowStock?: boolean;
  },
) {
  const trimmedNotes = notes?.trim() || null;
  return trimmedNotes;
}

export async function listPantryItems(userId: string) {
  const cacheKey = getListCacheKey(userId);
  const cached = pantryItemsListCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { data: cached.data, error: null };
  }

  const inFlight = pantryItemsListRequests.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = requireSupabaseClient()
    .from("pantry_items")
    .select(PANTRY_ITEM_COLUMNS)
    .eq("user_id", userId)
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  const wrapped = Promise.resolve(request)
    .then(({ data, error }) => {
      if (!error && data) {
        primePantryItemCaches(userId, data);
      }

      return { data, error };
    })
    .finally(() => {
      pantryItemsListRequests.delete(cacheKey);
    });

  pantryItemsListRequests.set(cacheKey, wrapped);
  return wrapped;
}

export async function getPantryItem(userId: string, itemId: string) {
  const cacheKey = getItemCacheKey(userId, itemId);
  const cached = pantryItemCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { data: cached.data, error: null };
  }

  const inFlight = pantryItemRequests.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = requireSupabaseClient()
    .from("pantry_items")
    .select(PANTRY_ITEM_COLUMNS)
    .eq("user_id", userId)
    .eq("id", itemId)
    .single();

  const wrapped = Promise.resolve(request)
    .then(({ data, error }) => {
      if (!error && data) {
        pantryItemCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + PANTRY_QUERY_CACHE_TTL_MS,
        });
      }

      return { data, error };
    })
    .finally(() => {
      pantryItemRequests.delete(cacheKey);
    });

  pantryItemRequests.set(cacheKey, wrapped);
  return wrapped;
}

export async function createPantryItem(userId: string, item: PantryItemInsert) {
  const result = await requireSupabaseClient()
    .from("pantry_items")
    .insert({
      user_id: userId,
      barcode: item.barcode?.trim() || null,
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      expiry_date: item.expiry_date,
      photo_url: item.photo_url,
      space: item.space ?? "kitchen",
      stock_status: normalizePantryItemStockStatus(item.stock_status),
      notes: item.notes?.trim() || null,
    })
    .select(PANTRY_ITEM_COLUMNS)
    .single();

  if (result.data) {
    invalidatePantryItemsCache(userId);
    pantryItemCache.set(getItemCacheKey(userId, result.data.id), {
      data: result.data,
      expiresAt: Date.now() + PANTRY_QUERY_CACHE_TTL_MS,
    });
  }

  return result;
}

export async function bulkCreatePantryItems(userId: string, items: PantryItemInsert[]) {
  const result = await requireSupabaseClient()
    .from("pantry_items")
    .insert(
      items.map((item) => ({
        user_id: userId,
        barcode: item.barcode?.trim() || null,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        expiry_date: item.expiry_date,
        photo_url: item.photo_url,
        space: item.space ?? "kitchen",
        stock_status: normalizePantryItemStockStatus(item.stock_status),
        notes: item.notes?.trim() || null,
      })),
    )
    .select(PANTRY_ITEM_COLUMNS);

  if (!result.error && result.data) {
    invalidatePantryItemsCache(userId);
    primePantryItemCaches(userId, result.data);
  }

  return result;
}

export async function uploadPantryItemPhoto(userId: string, file: File) {
  const client = requireSupabaseClient();
  const extension = getFileExtension(file);
  const path = `${userId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}.${extension}`;

  const { data, error } = await client.storage.from("pantry-items").upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || "image/jpeg",
    upsert: false,
  });

  if (error) {
    return { data: null, error };
  }

  const { data: publicUrlData } = client.storage
    .from("pantry-items")
    .getPublicUrl(data.path);

  return {
    data: {
      path: data.path,
      publicUrl: publicUrlData.publicUrl,
    },
    error: null,
  };
}

export async function updatePantryItem(
  userId: string,
  itemId: string,
  item: PantryItemUpdate,
) {
  const patch: PantryItemUpdate = {
    ...item,
  };

  if (item.barcode !== undefined) {
    patch.barcode = item.barcode?.trim() || null;
  }

  if (item.space !== undefined) {
    patch.space = item.space ?? "kitchen";
  }

  if (item.stock_status !== undefined) {
    patch.stock_status = normalizePantryItemStockStatus(item.stock_status);
  }

  if (item.notes !== undefined) {
    patch.notes = item.notes?.trim() || null;
  }

  const result = await requireSupabaseClient()
    .from("pantry_items")
    .update({
      ...patch,
      user_id: userId,
    })
    .eq("id", itemId)
      .eq("user_id", userId)
    .select(PANTRY_ITEM_COLUMNS)
    .single();

  if (result.data) {
    invalidatePantryItemsCache(userId);
    pantryItemCache.set(getItemCacheKey(userId, itemId), {
      data: result.data,
      expiresAt: Date.now() + PANTRY_QUERY_CACHE_TTL_MS,
    });
  }

  return result;
}

export async function findPantryItemByBarcode(barcode: string) {
  const candidates = getBarcodeLookupCandidates(barcode);
  if (candidates.length === 0) {
    return { data: null, error: null };
  }

  const cacheKey = getBarcodeCacheKey(barcode);
  const cached = barcodeLookupCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return { data: cached.data, error: null };
  }

  const inFlight = barcodeLookupRequests.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const request = requireSupabaseClient()
    .from("barcode_product_lookup")
    .select("barcode, product_name")
    .in("barcode", candidates);

  const wrapped = Promise.resolve(request)
    .then(({ data, error }) => {
      if (error) {
        return { data: null, error };
      }

      const matchedRecord =
        candidates
          .map((candidate) => data?.find((record) => record.barcode === candidate) ?? null)
          .find(Boolean) ?? null;

      barcodeLookupCache.set(cacheKey, {
        data: matchedRecord,
        expiresAt: Date.now() + PANTRY_QUERY_CACHE_TTL_MS,
      });

      return { data: matchedRecord, error: null };
    })
    .finally(() => {
      barcodeLookupRequests.delete(cacheKey);
    });

  barcodeLookupRequests.set(cacheKey, wrapped);
  return wrapped;
}

export async function upsertBarcodeProductLookup(barcode: string, productName: string) {
  const normalizedBarcode = barcode.trim();
  const normalizedProductName = productName.trim();

  const result = await requireSupabaseClient()
    .from("barcode_product_lookup")
    .upsert(
      {
        barcode: normalizedBarcode,
        last_seen_at: new Date().toISOString(),
        product_name: normalizedProductName,
      },
      {
        onConflict: "barcode",
      },
    )
    .select("barcode, product_name")
    .single();

  if (!result.error) {
    invalidateBarcodeLookupCache(normalizedBarcode);
  }

  return result;
}

export async function deletePantryItem(userId: string, itemId: string) {
  const result = await requireSupabaseClient()
    .from("pantry_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", userId);

  if (!result.error) {
    invalidatePantryItemsCache(userId);
    invalidatePantryItemCache(userId, itemId);
  }

  return result;
}
