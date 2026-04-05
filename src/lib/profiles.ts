import type { PostgrestError, User } from "@supabase/supabase-js";

import { supabase } from "./supabase";

export type ProfileRecord = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type ProfileResult = {
  data: ProfileRecord | null;
  error: Error | PostgrestError | null;
};

const PROFILE_COLUMNS = "id, full_name, avatar_url, created_at, updated_at";
const PROFILE_AVATAR_BUCKET = "profile-avatars";

export type ProfileAvatarUpload = {
  fileName?: string | null;
  mimeType?: string | null;
  uri: string;
};

function getFileExtension(photo: ProfileAvatarUpload) {
  const fromFileName = photo.fileName?.split(".").pop()?.toLowerCase();
  if (fromFileName) {
    return fromFileName;
  }

  const fromUri = photo.uri.split(".").pop()?.split("?")[0]?.toLowerCase();
  if (fromUri) {
    return fromUri;
  }

  if (photo.mimeType === "image/png") {
    return "png";
  }

  if (photo.mimeType === "image/heic") {
    return "heic";
  }

  return "jpg";
}

function requireSupabaseClient() {
  if (!supabase) {
    throw new Error("Supabase is not configured.");
  }

  return supabase;
}

function getProfileDefaults(user: User) {
  const fullName =
    user.user_metadata.full_name?.trim() ||
    user.user_metadata.fullname?.trim() ||
    null;
  const avatarUrl =
    typeof user.user_metadata.avatar_url === "string"
      ? user.user_metadata.avatar_url
      : null;

  return {
    avatar_url: avatarUrl,
    full_name: fullName,
    id: user.id,
  };
}

export async function getOrCreateProfile(user: User): Promise<ProfileResult> {
  if (!supabase) {
    return {
      data: null,
      error: new Error("Supabase is not configured."),
    };
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    return { data: null, error };
  }

  if (data) {
    return { data, error: null };
  }

  const profileDefaults = getProfileDefaults(user);
  const { data: insertedProfile, error: insertError } = await supabase
    .from("profiles")
    .upsert(profileDefaults, { onConflict: "id" })
    .select(PROFILE_COLUMNS)
    .single();

  return {
    data: insertedProfile ?? null,
    error: insertError,
  };
}

export async function updateProfile(
  userId: string,
  patch: Partial<Pick<ProfileRecord, "avatar_url" | "full_name">>,
) {
  return requireSupabaseClient()
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .select(PROFILE_COLUMNS)
    .single();
}

export async function uploadProfileAvatar(userId: string, photo: ProfileAvatarUpload) {
  const client = requireSupabaseClient();
  const response = await fetch(photo.uri);
  const blob = await response.blob();
  const extension = getFileExtension(photo);
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

  const { data, error } = await client.storage
    .from(PROFILE_AVATAR_BUCKET)
    .upload(path, blob, {
      cacheControl: "3600",
      contentType: photo.mimeType ?? "image/jpeg",
      upsert: false,
    });

  if (error) {
    return { data: null, error };
  }

  const { data: publicUrlData } = client.storage
    .from(PROFILE_AVATAR_BUCKET)
    .getPublicUrl(data.path);

  return {
    data: {
      path: data.path,
      publicUrl: publicUrlData.publicUrl,
    },
    error: null,
  };
}
