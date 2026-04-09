export type InventorySpaceKey =
  | "kitchen"
  | "medicines"
  | "toiletries_household";

export const INVENTORY_SPACE_CONFIG = {
  kitchen: {
    description: "Food, fresh produce, and kitchen staples.",
    label: "Kitchen",
    quickActionLabel: "Add Kitchen Item",
    shortLabel: "Kitchen",
  },
  medicines: {
    description: "Medicines, vitamins, and personal care essentials.",
    label: "Medicines",
    quickActionLabel: "Add Medicine",
    shortLabel: "Meds",
  },
  toiletries_household: {
    description: "Toiletries, soaps, detergents, and household supplies.",
    label: "Toiletries / Household",
    quickActionLabel: "Add Household Item",
    shortLabel: "Toiletries",
  },
} as const satisfies Record<
  InventorySpaceKey,
  {
    description: string;
    label: string;
    quickActionLabel: string;
    shortLabel: string;
  }
>;

export const INVENTORY_SPACE_OPTIONS = (
  Object.keys(INVENTORY_SPACE_CONFIG) as InventorySpaceKey[]
).map((key) => ({
  key,
  ...INVENTORY_SPACE_CONFIG[key],
}));

export const INVENTORY_SPACE_PALETTES = {
  kitchen: {
    accent: "#0B7B44",
    accentSoft: "#F1F7F3",
    accentSoftBorder: "#D8E7DD",
    accentSurface: "#EAFBF1",
    actionBackground: "#0B7B44",
    actionText: "#FFFFFF",
    glowPrimary: "#1EBC69",
    glowSecondary: "#3EE58E",
    heroBackground: "#07130D",
    heroMeta: "rgba(234,251,241,0.82)",
    heroStripe: "rgba(255,255,255,0.06)",
    heroText: "#FFFFFF",
    mutedAccent: "#607468",
    pillBackground: "rgba(255,255,255,0.1)",
    pillBorder: "rgba(255,255,255,0.16)",
    pillText: "rgba(255,255,255,0.88)",
    primarySoftText: "#0B7B44",
    secondaryActionBackground: "#F1F7F3",
    secondaryActionBorder: "#D8E7DD",
    secondaryActionText: "#0B7B44",
    secondaryActionHint: "#0B7B44",
    secondaryActionBubble: "#EAFBF1",
    inlineActionBackground: "#0B7B44",
    inlineActionForeground: "#FFFFFF",
    primaryActionMutedText: "rgba(234,251,241,0.82)",
    secondaryActionMutedText: "#0B7B44",
    tabActiveBackground: "#07130D",
    tabActiveMeta: "rgba(234,251,241,0.82)",
    tabActiveText: "#FFFFFF",
    sectionTint: "#F2F7F4",
    sectionTintBorder: "#D8E7DD",
  },
  medicines: {
    accent: "#2F6FE4",
    accentSoft: "#F3F7FF",
    accentSoftBorder: "#D7E4FF",
    accentSurface: "#EAF1FF",
    actionBackground: "#2F6FE4",
    actionText: "#FFFFFF",
    glowPrimary: "#8AB6FF",
    glowSecondary: "#C6DBFF",
    heroBackground: "#EEF4FF",
    heroMeta: "#5D7092",
    heroStripe: "rgba(47,111,228,0.08)",
    heroText: "#173764",
    mutedAccent: "#6B7F9E",
    pillBackground: "rgba(47,111,228,0.08)",
    pillBorder: "rgba(47,111,228,0.14)",
    pillText: "#2F6FE4",
    primarySoftText: "#2F6FE4",
    secondaryActionBackground: "#EEF4FF",
    secondaryActionBorder: "#D7E4FF",
    secondaryActionText: "#2F6FE4",
    secondaryActionHint: "#2F6FE4",
    secondaryActionBubble: "#EAF1FF",
    inlineActionBackground: "#2F6FE4",
    inlineActionForeground: "#FFFFFF",
    primaryActionMutedText: "rgba(255,255,255,0.84)",
    secondaryActionMutedText: "#2F6FE4",
    tabActiveBackground: "#EAF1FF",
    tabActiveMeta: "#6B7F9E",
    tabActiveText: "#173764",
    sectionTint: "#F6F9FF",
    sectionTintBorder: "#D7E4FF",
  },
  toiletries_household: {
    accent: "#8D6E4F",
    accentSoft: "#FAF5EF",
    accentSoftBorder: "#E8DDD0",
    accentSurface: "#F6EFE6",
    actionBackground: "#E8DED1",
    actionText: "#3C3026",
    glowPrimary: "#E8DED1",
    glowSecondary: "#F5ECE2",
    heroBackground: "#FBF6F1",
    heroMeta: "#76695E",
    heroStripe: "rgba(141,110,79,0.08)",
    heroText: "#3C3026",
    mutedAccent: "#8D7D6F",
    pillBackground: "rgba(141,110,79,0.08)",
    pillBorder: "rgba(141,110,79,0.12)",
    pillText: "#6F5943",
    primarySoftText: "#6F5943",
    secondaryActionBackground: "#FAF5EF",
    secondaryActionBorder: "#E8DDD0",
    secondaryActionText: "#6F5943",
    secondaryActionHint: "#6F5943",
    secondaryActionBubble: "#F6EFE6",
    inlineActionBackground: "#E8DDD0",
    inlineActionForeground: "#3C3026",
    primaryActionMutedText: "#6F5943",
    secondaryActionMutedText: "#6F5943",
    tabActiveBackground: "#F6EFE6",
    tabActiveMeta: "#8D7D6F",
    tabActiveText: "#3C3026",
    sectionTint: "#FBF7F2",
    sectionTintBorder: "#E8DDD0",
  },
} as const;

export function normalizeInventorySpace(
  value: string | null | undefined,
): InventorySpaceKey | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s/-]+/g, "_");
  if (normalized === "kitchen") {
    return "kitchen";
  }

  if (normalized === "medicines" || normalized === "medicine" || normalized === "meds") {
    return "medicines";
  }

  if (
    normalized === "toiletries_household" ||
    normalized === "toiletries" ||
    normalized === "household" ||
    normalized === "toiletries___household"
  ) {
    return "toiletries_household";
  }

  return null;
}
