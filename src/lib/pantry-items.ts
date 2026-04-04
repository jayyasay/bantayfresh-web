import { supabase } from "./supabase";

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

export async function deletePantryItem(userId: string, itemId: string) {
  return requireSupabaseClient()
    .from("pantry_items")
    .delete()
    .eq("id", itemId)
    .eq("user_id", userId);
}
