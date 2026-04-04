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
