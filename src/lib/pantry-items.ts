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
  name: string;
  category: string | null;
  quantity: number;
  unit: string | null;
  expiry_date: string | null;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PantryItemInsert = {
  name: string;
  category: string | null;
  quantity: number;
  unit: string | null;
  expiry_date: string | null;
  photo_url: string | null;
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

const PANTRY_ITEM_COLUMNS =
  "id, user_id, name, category, quantity, unit, expiry_date, photo_url, notes, created_at, updated_at";

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

export function getPantryItemBarcode(notes: string | null) {
  const match = notes?.match(BARCODE_NOTE_PATTERN);
  const barcode = match?.[1]?.trim();
  return barcode ? barcode : null;
}

export function getPantryItemInventorySpace(notes: string | null): InventorySpaceKey {
  const match = notes?.match(INVENTORY_SPACE_NOTE_PATTERN);
  return normalizeInventorySpace(match?.[1]) ?? "kitchen";
}

export function getPantryItemIsLowStock(notes: string | null) {
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

export function getPantryItemDisplayNotes(notes: string | null) {
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
  barcode: string | null,
  metadata?: {
    inventorySpace?: InventorySpaceKey | null;
    isLowStock?: boolean;
  },
) {
  const trimmedNotes = notes?.trim() || null;
  const trimmedBarcode = barcode?.trim() || null;
  const parts = [];
  const inventorySpace = metadata?.inventorySpace ?? "kitchen";

  if (trimmedBarcode) {
    parts.push(`[barcode] ${trimmedBarcode}`);
  }

  parts.push(`[space] ${inventorySpace}`);
  parts.push(`[low_stock] ${metadata?.isLowStock ? "true" : "false"}`);

  if (trimmedNotes) {
    parts.push(trimmedNotes);
  }

  return parts.length > 0 ? parts.join("\n\n") : null;
}

export async function listPantryItems(userId: string) {
  return requireSupabaseClient()
    .from("pantry_items")
    .select(PANTRY_ITEM_COLUMNS)
    .eq("user_id", userId)
    .order("expiry_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
}

export async function getPantryItem(userId: string, itemId: string) {
  return requireSupabaseClient()
    .from("pantry_items")
    .select(PANTRY_ITEM_COLUMNS)
    .eq("user_id", userId)
    .eq("id", itemId)
    .single();
}

export async function createPantryItem(userId: string, item: PantryItemInsert) {
  return requireSupabaseClient()
    .from("pantry_items")
    .insert({
      user_id: userId,
      ...item,
    })
    .select(PANTRY_ITEM_COLUMNS)
    .single();
}

export async function bulkCreatePantryItems(userId: string, items: PantryItemInsert[]) {
  return requireSupabaseClient()
    .from("pantry_items")
    .insert(
      items.map((item) => ({
        user_id: userId,
        ...item,
      })),
    )
    .select(PANTRY_ITEM_COLUMNS);
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
  return requireSupabaseClient()
    .from("pantry_items")
    .update({
      ...item,
      user_id: userId,
    })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select(PANTRY_ITEM_COLUMNS)
    .single();
}

export async function findPantryItemByBarcode(barcode: string) {
  const candidates = getBarcodeLookupCandidates(barcode);
  if (candidates.length === 0) {
    return { data: null, error: null };
  }

  const { data, error } = await requireSupabaseClient()
    .from("barcode_product_lookup")
    .select("barcode, product_name")
    .in("barcode", candidates);

  if (error) {
    return { data: null, error };
  }

  const matchedRecord =
    candidates
      .map((candidate) => data?.find((record) => record.barcode === candidate) ?? null)
      .find(Boolean) ?? null;

  return { data: matchedRecord, error: null };
}

export async function upsertBarcodeProductLookup(barcode: string, productName: string) {
  const normalizedBarcode = barcode.trim();
  const normalizedProductName = productName.trim();

  return requireSupabaseClient()
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
}

export async function deletePantryItem(userId: string, itemId: string) {
  return requireSupabaseClient()
    .from("pantry_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", userId);
}
