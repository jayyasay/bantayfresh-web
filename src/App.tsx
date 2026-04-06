import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import {
  IoAdd,
  IoArrowForward,
  IoCameraOutline,
  IoCloudUploadOutline,
  IoCubeOutline,
  IoDocumentTextOutline,
  IoHome,
  IoHomeOutline,
  IoImagesOutline,
  IoLayers,
  IoLayersOutline,
  IoLeafOutline,
  IoNotifications,
  IoNotificationsOutline,
  IoNutritionOutline,
  IoPersonCircle,
  IoPersonCircleOutline,
  IoSnowOutline,
} from "react-icons/io5";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  type Location as RouterLocation,
} from "react-router-dom";

import BrandMark from "./components/BrandMark";
import {
  createPantryItem,
  bulkCreatePantryItems,
  deletePantryItem,
  getPantryItem,
  listPantryItems,
  type PantryItemInsert,
  type PantryItemRecord,
  updatePantryItem,
  uploadPantryItemPhoto,
} from "./lib/pantry-items";
import {
  getOrCreateProfile,
  type ProfileRecord,
  updateProfile,
  uploadProfileAvatar,
} from "./lib/profiles";
import {
  isSupabaseConfigured,
  signInWithEmailPassword,
  signOutCurrentUser,
  signUpWithEmailPassword,
  supabase,
} from "./lib/supabase";

type TabKey = "home" | "inventory" | "alerts" | "profile";
type AuthMode = "login" | "register";
type CategoryValue = "Fruits & Veggies" | "Fridge Items" | "Pantry";
type FieldKey = "email" | "password" | "confirmPassword";
type FieldErrors = Partial<Record<FieldKey, string>>;
type PantryItemStatus = "expired" | "expiring_soon" | "safe";
type ReminderPreferenceKey =
  | "notify_one_day_before_expiry"
  | "notify_three_days_before_expiry";
type ParsedBulkRow = PantryItemInsert & {
  previewKey: string;
};

const CATEGORY_OPTIONS = [
  {
    accent: "#DDE7FF",
    caption: "Dry Storage",
    cardColor: "#EEF3FF",
    selectedCardColor: "#D9E6FF",
    value: "Pantry",
    title: "Pantry",
  },
  {
    accent: "#FFE4BF",
    caption: "Chilled",
    cardColor: "#FFF3E4",
    selectedCardColor: "#FFE8CC",
    value: "Fridge Items",
    title: "Fridge Items",
  },
  {
    accent: "#C8F3DA",
    caption: "Fresh Produce",
    cardColor: "#E8FAF0",
    selectedCardColor: "#D3F3E0",
    value: "Fruits & Veggies",
    title: "Fruits & Veggies",
  },
] as const satisfies ReadonlyArray<{
  accent: string;
  caption: string;
  cardColor: string;
  selectedCardColor: string;
  value: CategoryValue;
  title: string;
}>;

const EXPECTED_FIELDS = [
  "category",
  "name",
  "quantity",
  "expiry_date",
  "notes",
  "photo_url",
] as const;

const DASHBOARD_TAB_PATHS: Record<TabKey, string> = {
  alerts: "/alerts",
  home: "/",
  inventory: "/inventory",
  profile: "/profile",
};

function isDashboardPath(pathname: string) {
  return Object.values(DASHBOARD_TAB_PATHS).includes(pathname);
}

function getDashboardTabFromPath(pathname: string): TabKey {
  if (pathname === "/inventory") {
    return "inventory";
  }

  if (pathname === "/alerts") {
    return "alerts";
  }

  if (pathname === "/profile") {
    return "profile";
  }

  return "home";
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function isEditableElement(element: Element | null) {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    element.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"]',
    ),
  );
}

function getViewportHeight() {
  if (typeof window === "undefined") {
    return 0;
  }

  return window.visualViewport?.height ?? window.innerHeight;
}

function scrollAppContentToTop() {
  if (typeof window === "undefined") {
    return;
  }

  const scrollingElement = document.scrollingElement as HTMLElement | null;

  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  scrollingElement?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  if (scrollingElement) {
    scrollingElement.scrollTop = 0;
    scrollingElement.scrollLeft = 0;
  }
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  document.querySelectorAll<HTMLElement>(".scroll-region").forEach((element) => {
    element.scrollTo({ top: 0, left: 0, behavior: "auto" });
    element.scrollTop = 0;
    element.scrollLeft = 0;
  });
}

function scrollOverlayContentToTop() {
  if (typeof window === "undefined") {
    return false;
  }

  const overlayScrollRegion = document.querySelector<HTMLElement>(".route-overlay .scroll-region");
  const overlayContainer = document.querySelector<HTMLElement>(".route-overlay");

  if (overlayContainer) {
    overlayContainer.scrollTo({ top: 0, left: 0, behavior: "auto" });
    overlayContainer.scrollTop = 0;
    overlayContainer.scrollLeft = 0;
  }

  if (!overlayScrollRegion) {
    return false;
  }

  overlayScrollRegion.scrollTo({ top: 0, left: 0, behavior: "auto" });
  overlayScrollRegion.scrollTop = 0;
  overlayScrollRegion.scrollLeft = 0;
  return true;
}

function scrollCurrentViewToTop() {
  if (scrollOverlayContentToTop()) {
    return;
  }

  scrollAppContentToTop();
}

function scheduleCurrentViewScrollToTop() {
  if (typeof window === "undefined") {
    return;
  }

  const runScrollReset = () => {
    scrollCurrentViewToTop();
  };

  runScrollReset();
  window.requestAnimationFrame(() => {
    runScrollReset();
    window.requestAnimationFrame(runScrollReset);
  });
  window.setTimeout(runScrollReset, 0);
}

async function confirmAndDeletePantryItem(
  userId: string,
  item: PantryItemRecord,
  onBeforeDelete?: () => void,
  onAfterDelete?: () => void,
) {
  const confirmed = window.confirm(`Delete ${item.name}? This action cannot be undone.`);

  if (!confirmed) {
    return { deleted: false, error: null as Error | null };
  }

  try {
    onBeforeDelete?.();
    const { error } = await deletePantryItem(userId, item.id);

    if (error) {
      throw error;
    }

    onAfterDelete?.();
    return { deleted: true, error: null as Error | null };
  } catch (error) {
    return {
      deleted: false,
      error: error instanceof Error ? error : new Error("Couldn't delete the item. Please try again."),
    };
  }
}

function trimOptionalValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeHeader(header: string) {
  return header.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function formatCellValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function parseQuantity(value: unknown) {
  const normalized = formatCellValue(value);
  if (!normalized) {
    return 1;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseExpiryDate(value: unknown, xlsx: typeof import("xlsx")) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (typeof value === "number") {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (!parsed) {
      return null;
    }

    return `${String(parsed.y).padStart(4, "0")}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }

  const normalized = formatCellValue(value);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function parseWorkbookRows(
  workbook: import("xlsx").WorkBook,
  xlsx: typeof import("xlsx"),
) {
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = workbook.Sheets[firstSheetName];
  const rawRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(firstSheet, {
    defval: "",
    raw: true,
  });

  const normalizedRows = rawRows.map((row) => {
    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
    );
  });

  const issues: string[] = [];
  const parsedRows: ParsedBulkRow[] = [];

  normalizedRows.forEach((row, index) => {
    const category = formatCellValue(row.category) || "Pantry";
    const name = formatCellValue(row.name);
    const quantity = parseQuantity(row.quantity);
    const expiryDate = parseExpiryDate(
      row.expiry_date || row.expiry || row.expiration_date,
      xlsx,
    );
    const notes = formatCellValue(row.notes) || null;
    const photoUrl = formatCellValue(row.photo_url) || null;
    const rowLabel = `Row ${index + 2}`;

    if (!name && !formatCellValue(row.notes) && !formatCellValue(row.category)) {
      return;
    }

    if (!name) {
      issues.push(`${rowLabel} is missing a name.`);
      return;
    }

    if (quantity === null) {
      issues.push(`${rowLabel} has an invalid quantity.`);
      return;
    }

    parsedRows.push({
      category,
      expiry_date: expiryDate,
      name,
      notes,
      photo_url: photoUrl,
      previewKey: `${rowLabel}-${name}`,
      quantity,
      unit: null,
    });
  });

  return { issues, parsedRows };
}

function formatExpiryCopy(expiryDate: string | null) {
  if (!expiryDate) {
    return "No expiry date";
  }

  const parsedExpiry = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(parsedExpiry.getTime())) {
    return "No expiry date";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(parsedExpiry);
}

function getPantryItemStatus(expiryDate: string | null): PantryItemStatus {
  if (!expiryDate) {
    return "safe";
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parsedExpiry = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(parsedExpiry.getTime())) {
    return "safe";
  }

  if (parsedExpiry < today) {
    return "expired";
  }

  const diffInDays = Math.round(
    (parsedExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );

  return diffInDays <= 3 ? "expiring_soon" : "safe";
}

function getDaysLeft(expiryDate: string | null) {
  if (!expiryDate) {
    return null;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const parsedExpiry = new Date(`${expiryDate}T00:00:00`);

  if (Number.isNaN(parsedExpiry.getTime())) {
    return null;
  }

  return Math.round(
    (parsedExpiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}

function getExpiredDays(expiryDate: string | null) {
  const daysLeft = getDaysLeft(expiryDate);
  if (daysLeft === null) {
    return null;
  }

  return Math.max(0, Math.abs(daysLeft));
}

function getInventoryBadgeCopy(item: PantryItemRecord) {
  const status = getPantryItemStatus(item.expiry_date);
  const daysLeft = getDaysLeft(item.expiry_date);

  if (status === "expired") {
    return "Expired";
  }

  if (status === "expiring_soon") {
    if (daysLeft === 0) {
      return "Due Today";
    }

    return `${daysLeft}d left`;
  }

  if (daysLeft === null) {
    return "No date";
  }

  return `${daysLeft}d left`;
}

function getInventoryBadgeTone(item: PantryItemRecord) {
  const status = getPantryItemStatus(item.expiry_date);

  if (status === "expired") {
    return "danger";
  }

  if (status === "expiring_soon") {
    return "warning";
  }

  return "safe";
}

function formatProfileDate(value: string | null) {
  if (!value) {
    return "Not available yet";
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function StatusNotice({
  title,
  body,
  tone,
}: {
  body: string;
  title: string;
  tone: "danger" | "info" | "success";
}) {
  return (
    <div className={cn("status-card", `status-card--${tone}`)}>
      <p className="status-card__title">{title}</p>
      <p className="status-card__body">{body}</p>
    </div>
  );
}

function SkeletonInventoryList({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="inventory-card skeleton-card">
          <div className="inventory-row inventory-row--top">
            <div className="skeleton skeleton--media" />
            <div className="inventory-main">
              <div className="skeleton skeleton--eyebrow" />
              <div className="skeleton skeleton--title" />
              <div className="skeleton skeleton--meta" />
              <div className="skeleton skeleton--meta skeleton--short" />
            </div>
            <div className="inventory-actions">
              <div className="skeleton skeleton--chip" />
              <div className="skeleton skeleton--chip" />
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function SplashScreen() {
  return (
    <div className="splash-shell">
      <div className="splash-center">
        <div className="splash-mark-wrap">
          <div className="splash-glow" />
          <BrandMark />
        </div>
        <h1 className="splash-title">BantayFresh</h1>
      </div>
    </div>
  );
}

function AuthScreen({ onAuthSuccess }: { onAuthSuccess?: () => void }) {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [fullName, setFullName] = useState("");
  const [organization, setOrganization] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setFieldErrors({});
    setErrorMessage(null);
    setSuccessMessage(null);
  }, [authMode]);

  function validateForm() {
    const nextErrors: FieldErrors = {};
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      nextErrors.email = "Enter your email address.";
    } else if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
      nextErrors.email = "Use a valid email format.";
    }

    if (!password) {
      nextErrors.password = "Enter your password.";
    } else if (authMode === "register" && password.length < 8) {
      nextErrors.password = "Use at least 8 characters.";
    }

    if (authMode === "register") {
      if (!confirmPassword) {
        nextErrors.confirmPassword = "Confirm your password.";
      } else if (confirmPassword !== password) {
        nextErrors.confirmPassword = "Passwords do not match.";
      }
    }

    return nextErrors;
  }

  async function handleSubmit() {
    const nextErrors = validateForm();
    setFieldErrors(nextErrors);
    setErrorMessage(null);
    setSuccessMessage(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    if (!isSupabaseConfigured) {
      setErrorMessage(
        "Supabase is not configured yet. Add your Vite public keys in web/.env and restart the app.",
      );
      return;
    }

    try {
      setIsSubmitting(true);

      if (authMode === "login") {
        const { error } = await signInWithEmailPassword({
          email: email.trim().toLowerCase(),
          password,
        });

        if (error) {
          throw error;
        }

        onAuthSuccess?.();
        return;
      }

      const { data, error } = await signUpWithEmailPassword({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: fullName.trim() || undefined,
            organization: organization.trim() || undefined,
          },
        },
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        setSuccessMessage("Account created. You're signed in.");
        onAuthSuccess?.();
        return;
      }

      setSuccessMessage(
        "Account created. Check your email to verify it before your first sign in.",
      );
      setPassword("");
      setConfirmPassword("");
      setAuthMode("login");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Something went wrong. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <div className="auth-banner">
          <div className="auth-banner__glow" />
          <div className="auth-banner__stripe auth-banner__stripe--one" />
          <div className="auth-banner__stripe auth-banner__stripe--two" />
          <div className="auth-banner__stripe auth-banner__stripe--three" />
          <div className="auth-banner__mark">
            <BrandMark />
          </div>
        </div>

        <div className="auth-body">
          <div className="welcome-card">
            <p className="eyebrow">{authMode === "login" ? "Welcome back" : "Join BantayFresh"}</p>
            <p className="body-copy">
              {authMode === "login"
                ? "Sign in to manage freshness alerts, supplier updates, and stock visibility."
                : "Create your access and start tracking inventory health with your team."}
            </p>
          </div>

          <div className="form-card">
            <h2 className="form-title">{authMode === "login" ? "Sign In" : "Create Account"}</h2>

            <div className="auth-switch">
              <button
                className={cn("auth-switch__button", authMode === "login" && "auth-switch__button--active")}
                type="button"
                onClick={() => setAuthMode("login")}
              >
                Login
              </button>
              <button
                className={cn(
                  "auth-switch__button",
                  authMode === "register" && "auth-switch__button--active",
                )}
                type="button"
                onClick={() => setAuthMode("register")}
              >
                Register
              </button>
            </div>

            <div className="field-stack">
              {authMode === "register" ? (
                <label className="field-shell">
                  <span className="field-label">Full Name</span>
                  <input
                    autoComplete="name"
                    className="field-input"
                    placeholder="Your full name"
                    type="text"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                  />
                </label>
              ) : null}

              <label className="field-shell">
                <span className="field-label">Email Address</span>
                <input
                  autoComplete="email"
                  className="field-input"
                  placeholder="you@company.com"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
                {fieldErrors.email ? <p className="field-error">{fieldErrors.email}</p> : null}
              </label>

              {authMode === "register" ? (
                <label className="field-shell">
                  <span className="field-label">Organization</span>
                  <input
                    className="field-input"
                    placeholder="Your company or team"
                    type="text"
                    value={organization}
                    onChange={(event) => setOrganization(event.target.value)}
                  />
                </label>
              ) : null}

              <label className="field-shell">
                <span className="field-label">Password</span>
                <input
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                  className="field-input"
                  placeholder={
                    authMode === "login" ? "Enter your password" : "Create a password"
                  }
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
                {fieldErrors.password ? <p className="field-error">{fieldErrors.password}</p> : null}
              </label>

              {authMode === "register" ? (
                <label className="field-shell">
                  <span className="field-label">Confirm Password</span>
                  <input
                    autoComplete="new-password"
                    className="field-input"
                    placeholder="Confirm your password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                  />
                  {fieldErrors.confirmPassword ? (
                    <p className="field-error">{fieldErrors.confirmPassword}</p>
                  ) : null}
                </label>
              ) : null}
            </div>

            {errorMessage ? (
              <StatusNotice body={errorMessage} title="Couldn't Continue" tone="danger" />
            ) : null}

            {successMessage ? (
              <StatusNotice body={successMessage} title="Ready" tone="success" />
            ) : null}

            <button className="primary-button" type="button" onClick={handleSubmit}>
              {isSubmitting
                ? authMode === "login"
                ? "Signing In..."
                  : "Creating Account..."
                : authMode === "login"
                  ? "Sign In"
                  : "Create Account"}
            </button>

            <div className="inline-row">
              <p className="inline-muted">
                {authMode === "login" ? "Need an account?" : "Already have one?"}
              </p>
              <button
                className="ghost-link"
                type="button"
                onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}
              >
                {authMode === "login" ? "Register here" : "Back to login"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type DashboardScreenProps = {
  activeTab: TabKey;
  displayName: string;
  isLoggingOut: boolean;
  isProfileLoading: boolean;
  onLogout: () => void;
  onOpenBulkUpload: () => void;
  onOpenCreate: () => void;
  onOpenEdit: (item: PantryItemRecord) => void;
  onOpenExpired: () => void;
  onProfileUpdated: (profile: ProfileRecord) => void;
  onShowToast: (message: string) => void;
  onTabChange: (tab: TabKey) => void;
  profile: ProfileRecord | null;
  refreshToken: number;
  toastMessage: string | null;
  userEmail: string | null;
  userId: string;
};

function DashboardScreen({
  activeTab,
  displayName,
  isLoggingOut,
  isProfileLoading,
  onLogout,
  onOpenBulkUpload,
  onOpenCreate,
  onOpenEdit,
  onOpenExpired,
  onProfileUpdated,
  onShowToast,
  onTabChange,
  profile,
  refreshToken,
  toastMessage,
  userEmail,
  userId,
}: DashboardScreenProps) {
  const scrollRegionRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");
  const [pantryItems, setPantryItems] = useState<PantryItemRecord[]>([]);
  const [isItemsLoading, setIsItemsLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [updatingQuantityId, setUpdatingQuantityId] = useState<string | null>(null);
  const [previewImageItem, setPreviewImageItem] = useState<PantryItemRecord | null>(null);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const [savingPreferenceKey, setSavingPreferenceKey] = useState<"one_day" | "three_days" | null>(
    null,
  );
  const [isBottomBarHidden, setIsBottomBarHidden] = useState(false);
  const [showAvatarChooser, setShowAvatarChooser] = useState(false);
  const cameraAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const libraryAvatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPantryItems() {
      try {
        setIsItemsLoading(true);
        setInventoryError(null);

        const { data, error } = await listPantryItems(userId);

        if (!isMounted) {
          return;
        }

        if (error) {
          throw error;
        }

        setPantryItems(data ?? []);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setInventoryError(
          error instanceof Error ? error.message : "Couldn't load your pantry items.",
        );
      } finally {
        if (isMounted) {
          setIsItemsLoading(false);
        }
      }
    }

    void loadPantryItems();

    return () => {
      isMounted = false;
    };
  }, [refreshToken, userId]);

  const categoryFilters = useMemo(() => {
    const categoryCounts = pantryItems.reduce<Record<string, number>>((accumulator, item) => {
      const key = item.category?.trim() || "Uncategorized";
      accumulator[key] = (accumulator[key] ?? 0) + 1;
      return accumulator;
    }, {});

    const orderedCategories = Object.keys(categoryCounts).sort((left, right) =>
      left.localeCompare(right),
    );

    return [
      {
        count: pantryItems.length,
        key: "all",
        label: "All",
      },
      ...orderedCategories.map((category) => ({
        count: categoryCounts[category],
        key: category,
        label: category,
      })),
    ];
  }, [pantryItems]);

  useEffect(() => {
    const filterStillExists = categoryFilters.some((category) => {
      return category.key === selectedCategoryFilter;
    });

    if (!filterStillExists) {
      setSelectedCategoryFilter("all");
    }
  }, [categoryFilters, selectedCategoryFilter]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return pantryItems.filter((item) => {
      const categoryLabel = item.category?.trim() || "Uncategorized";
      const matchesCategory =
        selectedCategoryFilter === "all" || categoryLabel === selectedCategoryFilter;

      if (!matchesCategory) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        item.name.toLowerCase().includes(query) ||
        item.category?.toLowerCase().includes(query) ||
        item.id.toLowerCase().includes(query)
      );
    });
  }, [pantryItems, search, selectedCategoryFilter]);

  const upcomingExpiryItems = pantryItems.filter((item) => {
    return getPantryItemStatus(item.expiry_date) === "expiring_soon";
  });
  const expiredItems = pantryItems.filter((item) => {
    return getPantryItemStatus(item.expiry_date) === "expired";
  });
  const nearExpiryCount = upcomingExpiryItems.length;
  const totalItems = pantryItems.length;
  const profileInitial = displayName.trim().charAt(0).toUpperCase() || "B";
  const profileAvatarUrl = profile?.avatar_url?.trim() || null;
  const formattedCreatedAt = formatProfileDate(profile?.created_at ?? null);
  const formattedUpdatedAt = formatProfileDate(profile?.updated_at ?? null);
  const profileSupportsReminderSettings = profile
    ? Object.prototype.hasOwnProperty.call(profile, "notify_three_days_before_expiry") &&
      Object.prototype.hasOwnProperty.call(profile, "notify_one_day_before_expiry")
    : false;
  const notifyThreeDaysBeforeExpiry = profile?.notify_three_days_before_expiry !== false;
  const notifyOneDayBeforeExpiry = profile?.notify_one_day_before_expiry !== false;
  const activityEntries = useMemo(() => {
    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
    const getTimestamp = (value: string | null | undefined) => {
      if (!value) {
        return 0;
      }

      const parsed = new Date(value).getTime();
      return Number.isNaN(parsed) ? 0 : parsed;
    };
    const itemsForLabel = (items: PantryItemRecord[]) =>
      items
        .slice(0, 3)
        .map((item) => item.name)
        .join(", ");

    const addedItems = pantryItems
      .filter((item) => getTimestamp(item.created_at) >= twentyFourHoursAgo)
      .sort((left, right) => getTimestamp(right.created_at) - getTimestamp(left.created_at));

    const updatedItems = pantryItems
      .filter((item) => {
        const createdAt = getTimestamp(item.created_at);
        const updatedAt = getTimestamp(item.updated_at);
        return updatedAt >= twentyFourHoursAgo && updatedAt - createdAt > 60 * 1000;
      })
      .sort((left, right) => getTimestamp(right.updated_at) - getTimestamp(left.updated_at));

    const recentlyExpiredItems = pantryItems
      .filter((item) => {
        if (!item.expiry_date) {
          return false;
        }

        const expiryTime = new Date(`${item.expiry_date}T00:00:00`).getTime();
        return expiryTime >= twentyFourHoursAgo && expiryTime <= now;
      })
      .sort((left, right) => {
        return (
          new Date(`${right.expiry_date}T00:00:00`).getTime() -
          new Date(`${left.expiry_date}T00:00:00`).getTime()
        );
      });

    const entries: Array<{ accent: string; body: string; title: string }> = [];

    if (addedItems.length > 0) {
      entries.push({
        accent: "#1ebc69",
        body:
          addedItems.length === 1
            ? `${addedItems[0].name} was added in the last 24 hours.`
            : `${addedItems.length} items were added recently: ${itemsForLabel(addedItems)}${addedItems.length > 3 ? "..." : ""}`,
        title: "New stock logged",
      });
    }

    if (updatedItems.length > 0) {
      entries.push({
        accent: "#D7A74A",
        body:
          updatedItems.length === 1
            ? `${updatedItems[0].name} was updated in the last 24 hours.`
            : `${updatedItems.length} items were updated recently: ${itemsForLabel(updatedItems)}${updatedItems.length > 3 ? "..." : ""}`,
        title: "Records updated",
      });
    }

    if (recentlyExpiredItems.length > 0) {
      entries.push({
        accent: "#D45A5A",
        body:
          recentlyExpiredItems.length === 1
            ? `${recentlyExpiredItems[0].name} crossed into expiry in the last 24 hours.`
            : `${recentlyExpiredItems.length} items expired recently: ${itemsForLabel(recentlyExpiredItems)}${recentlyExpiredItems.length > 3 ? "..." : ""}`,
        title: "Freshness changed",
      });
    }

    return entries.slice(0, 3);
  }, [pantryItems]);

  const tabs: Array<{
    activeIcon: ReactNode;
    icon: ReactNode;
    key: TabKey;
    label: string;
  }> = [
    { activeIcon: <IoHome />, icon: <IoHomeOutline />, key: "home", label: "Home" },
    {
      activeIcon: <IoLayers />,
      icon: <IoLayersOutline />,
      key: "inventory",
      label: "Inventory",
    },
    {
      activeIcon: <IoNotifications />,
      icon: <IoNotificationsOutline />,
      key: "alerts",
      label: "Alerts",
    },
    {
      activeIcon: <IoPersonCircle />,
      icon: <IoPersonCircleOutline />,
      key: "profile",
      label: "Profile",
    },
  ];
  const visibleTabs = tabs.filter((tab) => {
    if (tab.key === "alerts") {
      return nearExpiryCount > 0;
    }

    return true;
  });
  const shouldSpreadTabs = visibleTabs.length === 4;

  useEffect(() => {
    if (activeTab === "alerts" && nearExpiryCount === 0) {
      onTabChange("home");
    }
  }, [activeTab, nearExpiryCount, onTabChange]);

  useLayoutEffect(() => {
    scrollRegionRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.requestAnimationFrame(() => {
      scrollRegionRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  }, [activeTab]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const visualViewport = window.visualViewport;
    let maxViewportHeight = getViewportHeight();

    const updateBottomBarVisibility = () => {
      const nextViewportHeight = getViewportHeight();
      maxViewportHeight = Math.max(maxViewportHeight, nextViewportHeight);

      const keyboardLikelyOpen =
        isEditableElement(document.activeElement) &&
        maxViewportHeight - nextViewportHeight > 120;

      setIsBottomBarHidden(keyboardLikelyOpen);
    };

    const handleFocusChange = () => {
      window.setTimeout(updateBottomBarVisibility, 40);
    };

    window.addEventListener("focusin", handleFocusChange);
    window.addEventListener("focusout", handleFocusChange);
    window.addEventListener("orientationchange", updateBottomBarVisibility);
    visualViewport?.addEventListener("resize", updateBottomBarVisibility);
    window.addEventListener("resize", updateBottomBarVisibility);
    updateBottomBarVisibility();

    return () => {
      window.removeEventListener("focusin", handleFocusChange);
      window.removeEventListener("focusout", handleFocusChange);
      window.removeEventListener("orientationchange", updateBottomBarVisibility);
      visualViewport?.removeEventListener("resize", updateBottomBarVisibility);
      window.removeEventListener("resize", updateBottomBarVisibility);
    };
  }, []);

  async function handleQuantityChange(item: PantryItemRecord, delta: number) {
    if (updatingQuantityId) {
      return;
    }

    const nextQuantity = Math.max(1, item.quantity + delta);
    if (nextQuantity === item.quantity) {
      return;
    }

    const previousQuantity = item.quantity;

    setUpdatingQuantityId(item.id);
    setPantryItems((currentItems) =>
      currentItems.map((currentItem) =>
        currentItem.id === item.id
          ? {
              ...currentItem,
              quantity: nextQuantity,
            }
          : currentItem,
      ),
    );

    try {
      const { data, error } = await updatePantryItem(userId, item.id, {
        quantity: nextQuantity,
      });

      if (error) {
        throw error;
      }

      setPantryItems((currentItems) =>
        currentItems.map((currentItem) => (currentItem.id === item.id ? data : currentItem)),
      );
    } catch (error) {
      setPantryItems((currentItems) =>
        currentItems.map((currentItem) =>
          currentItem.id === item.id
            ? {
                ...currentItem,
                quantity: previousQuantity,
              }
            : currentItem,
        ),
      );

      window.alert(
        error instanceof Error ? error.message : "Couldn't update quantity. Please try again.",
      );
    } finally {
      setUpdatingQuantityId(null);
    }
  }

  async function handleDeleteItem(item: PantryItemRecord) {
    const { deleted, error } = await confirmAndDeletePantryItem(
      userId,
      item,
      () => {
        setDeletingItemId(item.id);
      },
      () => {
        setPantryItems((currentItems) =>
          currentItems.filter((currentItem) => currentItem.id !== item.id),
        );
      },
    );

    if (deleted) {
      onShowToast(`${item.name} deleted.`);
    } else if (error) {
      window.alert(error.message);
    }

    setDeletingItemId(null);
  }

  async function handleAvatarFile(file: File) {
    const objectUrl = URL.createObjectURL(file);

    try {
      setIsUpdatingAvatar(true);

      const { data: uploadData, error: uploadError } = await uploadProfileAvatar(userId, {
        fileName: file.name,
        mimeType: file.type,
        uri: objectUrl,
      });

      if (uploadError) {
        throw uploadError;
      }

      const { data, error } = await updateProfile(userId, {
        avatar_url: uploadData.publicUrl,
      });

      if (error) {
        throw error;
      }

      onProfileUpdated(data);
      onShowToast("Avatar updated.");
      setShowAvatarChooser(false);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Couldn't update avatar. Please try again.",
      );
    } finally {
      URL.revokeObjectURL(objectUrl);
      setIsUpdatingAvatar(false);
    }
  }

  function handleAvatarInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    void handleAvatarFile(file);
  }

  function openAvatarOptions() {
    setShowAvatarChooser((current) => !current);
  }

  async function handleRemoveAvatar() {
    const confirmed = window.confirm("Remove your avatar from the app profile?");

    if (!confirmed) {
      return;
    }

    try {
      setIsUpdatingAvatar(true);
      const { data, error } = await updateProfile(userId, {
        avatar_url: null,
      });

      if (error) {
        throw error;
      }

      onProfileUpdated(data);
      onShowToast("Avatar removed.");
      setShowAvatarChooser(false);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Couldn't remove avatar. Please try again.",
      );
    } finally {
      setIsUpdatingAvatar(false);
    }
  }

  async function handleNotificationPreferenceChange(
    key: ReminderPreferenceKey,
    value: boolean,
  ) {
    if (!profile) {
      return;
    }

    const savingKey = key === "notify_one_day_before_expiry" ? "one_day" : "three_days";
    const previousValue =
      key === "notify_one_day_before_expiry"
        ? notifyOneDayBeforeExpiry
        : notifyThreeDaysBeforeExpiry;

    setSavingPreferenceKey(savingKey);
    onProfileUpdated({
      ...profile,
      [key]: value,
    });

    try {
      const patch = {
        [key]: value,
      } as Partial<
        Pick<
          ProfileRecord,
          "notify_one_day_before_expiry" | "notify_three_days_before_expiry"
        >
      >;
      const { data, error } = await updateProfile(userId, patch);

      if (error) {
        throw error;
      }

      onProfileUpdated(data);
      onShowToast("Notification settings updated.");
    } catch (error) {
      onProfileUpdated({
        ...profile,
        [key]: previousValue,
      });

      const errorMessage =
        error instanceof Error ? error.message : "Please try again.";
      const needsDatabaseUpdate =
        errorMessage.toLowerCase().includes("column") ||
        errorMessage.toLowerCase().includes("schema cache") ||
        errorMessage.toLowerCase().includes("does not exist");

      window.alert(
        needsDatabaseUpdate
          ? "Notification settings need the latest database update before they can be used."
          : errorMessage,
      );
    } finally {
      setSavingPreferenceKey(null);
    }
  }

  function renderOverview() {
    if (isItemsLoading && pantryItems.length === 0) {
      return (
        <>
          <header className="dashboard-header">
            <div className="skeleton-block-group">
              <div className="skeleton skeleton--greeting" />
              <div className="skeleton skeleton--body" />
            </div>
            <div className="hero-card skeleton-hero">
              <div className="skeleton skeleton--chip" />
              <div className="skeleton skeleton--value" />
              <div className="skeleton skeleton--body" />
            </div>
          </header>
          <section className="section">
            <div className="quick-actions-grid">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="quick-action quick-action--skeleton">
                  <div className="skeleton skeleton--bubble" />
                  <div className="skeleton skeleton--title" />
                </div>
              ))}
            </div>
            <SkeletonInventoryList count={2} />
          </section>
        </>
      );
    }

    return (
      <>
        <header className="dashboard-header">
          <div className="header-row">
            <div className="header-copy">
              <h1 className="greeting-title">Good Morning, {displayName}</h1>
              <p className="body-copy body-copy--left">
                Freshness is tighter than ever. {nearExpiryCount} items are in their final 3
                days before expiry.
              </p>
            </div>

            <div className="header-action-row">
              <button
                aria-label="Open profile"
                className="header-avatar-button"
                type="button"
                onClick={() => onTabChange("profile")}
              >
                {profileAvatarUrl ? (
                  <img
                    alt="Profile avatar"
                    className="header-avatar-image"
                    src={profileAvatarUrl}
                  />
                ) : (
                  <span className="header-avatar-fallback">{profileInitial}</span>
                )}
              </button>
            </div>
          </div>

          <div className="hero-card">
            <div className="hero-glow hero-glow--primary" />
            <div className="hero-glow hero-glow--secondary" />
            <div className="hero-stripe hero-stripe--one" />
            <div className="hero-stripe hero-stripe--two" />

            <div className="hero-bottom">
              <p className="hero-label">Freshness Snapshot</p>
              <p className="hero-value">{totalItems} Active Items</p>
              <p className="hero-meta">
                Keep sell-through velocity high by prioritizing the shortest freshness windows.
              </p>
              <div className="hero-meta-row">
                <button className="hero-badge" type="button" onClick={onOpenExpired}>
                  {expiredItems.length === 0 ? "No expired items, nice!" : `${expiredItems.length} Expired`}
                </button>
                <div className="hero-stat-pill">
                  {nearExpiryCount === 0 ? "Pantry health is good" : `${nearExpiryCount} Near Expiry`}
                </div>
              </div>
            </div>
          </div>

          {nearExpiryCount > 0 ? (
            <button className="expiry-banner" type="button" onClick={() => onTabChange("alerts")}>
              <p className="expiry-banner__title">
                {nearExpiryCount} Upcoming Expiry {nearExpiryCount === 1 ? "Item" : "Items"}
              </p>
              <p className="expiry-banner__body">
                Open the alert list to review every item that is 3 days away from expiry.
              </p>
              <span className="expiry-banner__action">Review Expiry Items</span>
            </button>
          ) : null}
        </header>

        <section className="section">
          <h2 className="section-heading">Quick Actions</h2>

          <div className="quick-actions-grid">
            <button className="quick-action" type="button" onClick={onOpenCreate}>
              <span className="quick-action__bubble">
                <IoNutritionOutline />
              </span>
              <span className="quick-action__body">
                <span className="quick-action__label">Add Item</span>
                <span className="quick-action__caption">Create a new pantry record</span>
                <span className="quick-action__hint">
                  Tap to Add <IoArrowForward />
                </span>
              </span>
            </button>

            <button
              className="quick-action quick-action--dark"
              type="button"
              onClick={() => onTabChange("inventory")}
            >
              <span className="quick-action__bubble">
                <IoLayersOutline />
              </span>
              <span className="quick-action__body">
                <span className="quick-action__label">View Inventory</span>
                <span className="quick-action__caption">Scan all active pantry rows</span>
                <span className="quick-action__hint">
                  Open Inventory <IoArrowForward />
                </span>
              </span>
            </button>

            <button
              className="quick-action quick-action--light"
              type="button"
              onClick={onOpenBulkUpload}
            >
              <span className="quick-action__bubble quick-action__bubble--light">
                <IoCloudUploadOutline />
              </span>
              <span className="quick-action__body">
                <span className="quick-action__label quick-action__label--dark">
                  Bulk Upload
                </span>
                <span className="quick-action__caption quick-action__caption--dark">
                  Import .xls, .xlsx, or .csv files in one flow
                </span>
                <span className="quick-action__hint quick-action__hint--dark">
                  Upload <IoArrowForward />
                </span>
              </span>
            </button>
          </div>
        </section>

        {activityEntries.length > 0 ? (
          <section className="full-bleed-section">
            <h2 className="section-heading">Today&apos;s Activity</h2>
            <p className="body-copy body-copy--left">
              Added, updated, or newly expired items from the last 24 hours.
            </p>

            <div className="activity-list">
              {activityEntries.map((entry) => (
                <div key={entry.title} className="activity-row">
                  <span
                    className="activity-dot"
                    style={{ backgroundColor: entry.accent }}
                  />
                  <div className="activity-copy">
                    <p className="activity-title">{entry.title}</p>
                    <p className="activity-body">{entry.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </>
    );
  }

  function renderInventoryView() {
    return (
      <section className="section section--padded-top">
        <header className="screen-header screen-header--tight">
          <div>
            <h2 className="section-title">Search Inventory</h2>
            <p className="body-copy body-copy--left">
              Look up stock by item name, category, or internal code before you edit the next
              record.
            </p>
          </div>
        </header>

        <button className="inline-action-card" type="button" onClick={onOpenCreate}>
          <span className="inline-action-glow" />
          <span className="inline-action-copy">
            <span className="inline-action-title">Add New Item</span>
          </span>
          <span className="quick-action__bubble inline-action-bubble">
            <IoAdd />
          </span>
        </button>

        <div className="search-shell">
          <input
            className="search-input"
            placeholder="Search item, category, or code..."
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="filter-wrap">
          {categoryFilters.map((category) => {
            const active = selectedCategoryFilter === category.key;

            return (
              <button
                key={category.key}
                className={cn("filter-chip", active && "filter-chip--active")}
                type="button"
                onClick={() => setSelectedCategoryFilter(category.key)}
              >
                {category.label} · {category.count}
              </button>
            );
          })}
        </div>

        {inventoryError ? (
          <div className="empty-card">
            <h3 className="section-heading">Inventory Unavailable</h3>
            <p className="body-copy body-copy--left">{inventoryError}</p>
          </div>
        ) : isItemsLoading ? (
          <SkeletonInventoryList />
        ) : filteredItems.length === 0 ? (
          <div className="empty-card">
            <h3 className="section-heading">No Matching Items</h3>
            <p className="body-copy body-copy--left">
              Try another keyword or open Add Item to write your first pantry row.
            </p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <div
              key={item.id}
              className="inventory-card-button"
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenEdit(item);
                }
              }}
              onClick={() => onOpenEdit(item)}
            >
              <div className="inventory-card">
                <div className="inventory-row inventory-row--top">
                  <div className="inventory-media">
                    {item.photo_url ? (
                      <button
                        aria-label={`Preview ${item.name} photo`}
                        className="inventory-image-button"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setPreviewImageItem(item);
                        }}
                      >
                        <img
                          alt={`${item.name} photo`}
                          className="inventory-image"
                          src={item.photo_url}
                        />
                      </button>
                    ) : (
                      <span className="inventory-fallback">o</span>
                    )}
                  </div>

                  <div className="inventory-main">
                    <div>
                      <p className="eyebrow eyebrow--left">{item.category || "Uncategorized"}</p>
                      <p className="inventory-name">{item.name}</p>
                      <p className="inventory-meta">{formatExpiryCopy(item.expiry_date)}</p>
                    </div>

                    <div className="quantity-control">
                      <button
                        className="quantity-button"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleQuantityChange(item, -1);
                        }}
                      >
                        -
                      </button>
                      <span className="quantity-value">
                        {updatingQuantityId === item.id ? "Saving..." : `Qty ${item.quantity}`}
                      </span>
                      <button
                        className="quantity-button"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleQuantityChange(item, 1);
                        }}
                      >
                        +
                      </button>
                    </div>

                    {item.notes?.trim() ? <p className="inventory-meta">{item.notes.trim()}</p> : null}
                  </div>

                  <div className="inventory-actions">
                    <span className={cn("inventory-badge", `inventory-badge--${getInventoryBadgeTone(item)}`)}>
                      {getInventoryBadgeCopy(item)}
                    </span>
                    <button
                      className="delete-chip"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteItem(item);
                      }}
                    >
                      {deletingItemId === item.id ? "Deleting..." : "Delete"}
                    </button>
                    <span className="inventory-link">Edit -&gt;</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    );
  }

  function renderAlertsView() {
    return (
      <section className="section section--padded-top">
        <header className="screen-header screen-header--tight">
          <div>
            <h2 className="section-title">Upcoming Expiry</h2>
            <p className="body-copy body-copy--left">
              Review every item that is within 3 days of expiry and prioritize the next moves
              before stock slips.
            </p>
          </div>
        </header>

        <div className="expiry-banner expiry-banner--static">
          <p className="expiry-banner__title">
            {nearExpiryCount} Upcoming Expiry {nearExpiryCount === 1 ? "Item" : "Items"}
          </p>
          <p className="expiry-banner__body">
            These are the items currently sitting inside the 3-day expiry window.
          </p>
        </div>

        {expiredItems.length > 0 ? (
          <div className="empty-card">
            <h3 className="section-heading">Expired Items Need Review</h3>
            <p className="body-copy body-copy--left">
              {expiredItems.length} items have already expired. Open the expired queue to delete
              them or review their details.
            </p>
            <button className="secondary-button secondary-button--compact" type="button" onClick={onOpenExpired}>
              Open Expired Queue
            </button>
          </div>
        ) : null}

        {isItemsLoading ? (
          <SkeletonInventoryList count={2} />
        ) : nearExpiryCount === 0 ? (
          <div className="empty-card">
            <h3 className="section-heading">No Upcoming Expiry</h3>
            <p className="body-copy body-copy--left">
              You do not have any items in the 3-day expiry window right now.
            </p>
          </div>
        ) : (
          upcomingExpiryItems.map((item) => (
            <div
              key={item.id}
              className="inventory-card-button"
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onOpenEdit(item);
                }
              }}
              onClick={() => onOpenEdit(item)}
            >
              <div className="inventory-card">
                <div className="inventory-row inventory-row--top">
                  <div className="inventory-media">
                    {item.photo_url ? (
                      <img alt={`${item.name} photo`} className="inventory-image" src={item.photo_url} />
                    ) : (
                      <span className="inventory-fallback">o</span>
                    )}
                  </div>

                  <div className="inventory-main">
                    <div>
                      <p className="eyebrow eyebrow--left">{item.category || "Uncategorized"}</p>
                      <p className="inventory-name">{item.name}</p>
                      <p className="inventory-meta">
                        Qty {item.quantity} / {formatExpiryCopy(item.expiry_date)}
                      </p>
                    </div>

                    {item.notes?.trim() ? <p className="inventory-meta">{item.notes.trim()}</p> : null}
                  </div>

                  <div className="inventory-actions">
                    <span className={cn("inventory-badge", `inventory-badge--${getInventoryBadgeTone(item)}`)}>
                      {getInventoryBadgeCopy(item)}
                    </span>
                    <button
                      className="delete-chip"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteItem(item);
                      }}
                    >
                      {deletingItemId === item.id ? "Deleting..." : "Delete"}
                    </button>
                    <span className="inventory-link">Edit -&gt;</span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </section>
    );
  }

  function renderProfileView() {
    return (
      <section className="section section--padded-top">
        <header className="screen-header screen-header--tight">
          <div className="header-row">
            <div className="header-copy">
              <h2 className="section-title">Profile & Access</h2>
              <p className="body-copy body-copy--left">
                Keep personal details and workspace access synchronized with the auth session.
              </p>
            </div>

            <button className="header-danger-action" type="button" onClick={onLogout}>
              {isLoggingOut ? "Logging Out..." : "Log Out"}
            </button>
          </div>
        </header>

        <div className="profile-panel">
          <div className="header-row">
            <div className="profile-main">
              <button
                aria-label={profileAvatarUrl ? "Update or remove avatar" : "Add avatar"}
                className="avatar-circle avatar-circle--button"
                type="button"
                onClick={openAvatarOptions}
              >
                {profileAvatarUrl ? (
                  <img alt="Profile avatar" className="profile-avatar-image" src={profileAvatarUrl} />
                ) : (
                  profileInitial
                )}
              </button>

              <div className="profile-copy">
                <h3 className="profile-name">{displayName}</h3>
                <p className="profile-meta">{userEmail ?? "No email available"}</p>
                <p className="profile-meta">
                  {isProfileLoading
                    ? "Refreshing profile..."
                    : "Profile details are loaded from public.profiles."}
                </p>
              </div>
            </div>
          </div>

          <p className="profile-meta">
            Tap the avatar to {profileAvatarUrl ? "update or remove it" : "upload a profile photo"}.
            {isUpdatingAvatar ? " Updating..." : ""}
          </p>

          {showAvatarChooser ? (
            <div className="avatar-choice-row avatar-choice-row--card">
              <button
                className="secondary-button secondary-button--compact"
                type="button"
                onClick={() => cameraAvatarInputRef.current?.click()}
              >
                <IoCameraOutline />
                <span>Take Photo</span>
              </button>

              <button
                className="secondary-button secondary-button--compact"
                type="button"
                onClick={() => libraryAvatarInputRef.current?.click()}
              >
                <IoImagesOutline />
                <span>Choose Photo</span>
              </button>

              {profileAvatarUrl ? (
                <button
                  className="delete-chip delete-chip--soft"
                  type="button"
                  onClick={() => void handleRemoveAvatar()}
                >
                  Remove Photo
                </button>
              ) : null}
            </div>
          ) : null}

          <input
            ref={cameraAvatarInputRef}
            accept="image/*"
            capture="environment"
            hidden
            type="file"
            onChange={handleAvatarInputChange}
          />
          <input
            ref={libraryAvatarInputRef}
            accept="image/*"
            hidden
            type="file"
            onChange={handleAvatarInputChange}
          />

          <div className="settings-card">
            <div className="setting-row">
              <div className="setting-copy">
                <p className="setting-title">Notify me 3 days before expiry</p>
                <p className="setting-body">
                  Receive an email reminder when an item enters the 3-day window.
                </p>
              </div>

              <button
                aria-checked={notifyThreeDaysBeforeExpiry}
                className={cn(
                  "switch",
                  notifyThreeDaysBeforeExpiry && "switch--active",
                  (!profileSupportsReminderSettings || savingPreferenceKey !== null) &&
                    "switch--disabled",
                )}
                disabled={!profileSupportsReminderSettings || savingPreferenceKey !== null}
                role="switch"
                type="button"
                onClick={() =>
                  void handleNotificationPreferenceChange(
                    "notify_three_days_before_expiry",
                    !notifyThreeDaysBeforeExpiry,
                  )
                }
              >
                <span className="switch__thumb" />
              </button>
            </div>

            <div className="settings-divider" />

            <div className="setting-row">
              <div className="setting-copy">
                <p className="setting-title">Notify me 1 day before expiry</p>
                <p className="setting-body">
                  Receive a final reminder one day before expiry.
                </p>
              </div>

              <button
                aria-checked={notifyOneDayBeforeExpiry}
                className={cn(
                  "switch",
                  notifyOneDayBeforeExpiry && "switch--active",
                  (!profileSupportsReminderSettings || savingPreferenceKey !== null) &&
                    "switch--disabled",
                )}
                disabled={!profileSupportsReminderSettings || savingPreferenceKey !== null}
                role="switch"
                type="button"
                onClick={() =>
                  void handleNotificationPreferenceChange(
                    "notify_one_day_before_expiry",
                    !notifyOneDayBeforeExpiry,
                  )
                }
              >
                <span className="switch__thumb" />
              </button>
            </div>
          </div>

          {!profileSupportsReminderSettings ? (
            <p className="profile-meta">
              Notification preferences will unlock after you run the latest profile/settings SQL
              update in Supabase.
            </p>
          ) : null}

          <div className="detail-grid">
            <div className="detail-card">
              <p className="detail-label">Full Name</p>
              <p className="detail-value">{profile?.full_name || displayName}</p>
            </div>
            <div className="detail-card">
              <p className="detail-label">Created</p>
              <p className="detail-value">{formattedCreatedAt}</p>
            </div>
            <div className="detail-card">
              <p className="detail-label">Last Updated</p>
              <p className="detail-value">{formattedUpdatedAt}</p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function renderContent() {
    if (activeTab === "home") {
      return renderOverview();
    }

    if (activeTab === "inventory") {
      return renderInventoryView();
    }

    if (activeTab === "alerts") {
      return renderAlertsView();
    }

    return renderProfileView();
  }

  return (
    <div className="dashboard-shell">
      <div ref={scrollRegionRef} className="scroll-region">
        {renderContent()}
      </div>

      <nav
        className={cn(
          "bottom-bar",
          shouldSpreadTabs && "bottom-bar--spread",
          isBottomBarHidden && "bottom-bar--hidden",
        )}
      >
        {visibleTabs.map((tab) => {
          const active = tab.key === activeTab;
          const isAlertsTab = tab.key === "alerts";
          const badgeCount = isAlertsTab ? nearExpiryCount : 0;

          return (
            <button
              key={tab.key}
              className={cn(
                "bottom-tab",
                active && "bottom-tab--active",
                isAlertsTab && "bottom-tab--alerts",
                isAlertsTab && active && "bottom-tab--alerts-active",
              )}
              type="button"
              onClick={() => onTabChange(tab.key)}
            >
              <span className="bottom-tab__icon-wrap">
                <span className="bottom-tab__icon">{active ? tab.activeIcon : tab.icon}</span>
                {badgeCount > 0 ? (
                  <span className="bottom-tab__badge">
                    <span className="bottom-tab__badge-text">
                      {badgeCount > 99 ? "99+" : badgeCount}
                    </span>
                  </span>
                ) : null}
              </span>
              <span className="bottom-tab__text">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {toastMessage ? <div className="toast-card">{toastMessage}</div> : null}

      {previewImageItem ? (
        <div className="preview-overlay" role="dialog" aria-modal="true">
          <button
            aria-label="Close image preview"
            className="preview-backdrop"
            type="button"
            onClick={() => setPreviewImageItem(null)}
          />

          <div className="preview-card">
            {previewImageItem.photo_url ? (
              <img
                alt={`${previewImageItem.name} enlarged photo`}
                className="preview-image"
                src={previewImageItem.photo_url}
              />
            ) : null}

            <div className="preview-copy">
              <p className="inventory-name">{previewImageItem.name}</p>
              <p className="inventory-meta">
                {previewImageItem.category || "Uncategorized"}
              </p>
            </div>

            <button
              className="preview-close"
              type="button"
              onClick={() => setPreviewImageItem(null)}
            >
              x
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type PantryItemFormScreenProps = {
  initialItem?: PantryItemRecord | null;
  mode: "create" | "edit";
  onBack: () => void;
  onDeleted?: (message: string) => void;
  onSaved: (message: string) => void;
  userId: string;
};

function PantryItemFormScreen({
  initialItem,
  mode,
  onBack,
  onDeleted,
  onSaved,
  userId,
}: PantryItemFormScreenProps) {
  const [itemName, setItemName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<CategoryValue>("Pantry");
  const [quantity, setQuantity] = useState("1");
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [isDeletingItem, setIsDeletingItem] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);
  const localPreviewRef = useRef<string | null>(null);

  useEffect(() => {
    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current);
      localPreviewRef.current = null;
    }

    if (!initialItem) {
      setItemName("");
      setSelectedCategory("Pantry");
      setQuantity("1");
      setExpiryDate(null);
      setPhotoUri(null);
      setNotes("");
      setPendingPhotoFile(null);
      return;
    }

    const nextCategory = CATEGORY_OPTIONS.some((category) => category.value === initialItem.category)
      ? (initialItem.category as CategoryValue)
      : "Pantry";

    setItemName(initialItem.name);
    setSelectedCategory(nextCategory);
    setQuantity(String(initialItem.quantity));
    setExpiryDate(initialItem.expiry_date);
    setPhotoUri(initialItem.photo_url);
    setNotes(initialItem.notes ?? "");
    setPendingPhotoFile(null);
  }, [initialItem]);

  useEffect(() => {
    return () => {
      if (localPreviewRef.current) {
        URL.revokeObjectURL(localPreviewRef.current);
      }
    };
  }, []);

  function handleSelectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (localPreviewRef.current) {
      URL.revokeObjectURL(localPreviewRef.current);
    }

    const previewUrl = URL.createObjectURL(file);
    localPreviewRef.current = previewUrl;
    setPhotoUri(previewUrl);
    setPendingPhotoFile(file);
    setErrorMessage(null);
    event.target.value = "";
  }

  async function handleSave() {
    const trimmedName = itemName.trim();
    const parsedQuantity = Number(quantity);

    if (!trimmedName) {
      setErrorMessage("Add an item name to continue.");
      return;
    }

    if (!Number.isFinite(parsedQuantity) || parsedQuantity <= 0) {
      setErrorMessage("Quantity needs to be greater than zero.");
      return;
    }

    try {
      setIsSavingItem(true);
      setErrorMessage(null);

      let nextPhotoUrl = photoUri;
      if (pendingPhotoFile) {
        const { data: uploadData, error: uploadError } = await uploadPantryItemPhoto(
          userId,
          pendingPhotoFile,
        );

        if (uploadError) {
          throw uploadError;
        }

        nextPhotoUrl = uploadData.publicUrl;
      }

      const payload = {
        name: trimmedName,
        category: selectedCategory,
        expiry_date: expiryDate,
        notes: trimOptionalValue(notes),
        photo_url: nextPhotoUrl,
        quantity: parsedQuantity,
        unit: null,
      };

      const result =
        mode === "edit" && initialItem
          ? await updatePantryItem(userId, initialItem.id, payload)
          : await createPantryItem(userId, payload);

      if (result.error) {
        throw result.error;
      }

      onSaved(mode === "edit" ? `${result.data.name} updated.` : `${result.data.name} added.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Couldn't save the pantry item.",
      );
    } finally {
      setIsSavingItem(false);
    }
  }

  async function handleDeleteCurrentItem() {
    if (!initialItem || isDeletingItem) {
      return;
    }

    const { deleted, error } = await confirmAndDeletePantryItem(
      userId,
      initialItem,
      () => {
        setIsDeletingItem(true);
        setErrorMessage(null);
      },
    );

    if (deleted) {
      onDeleted?.(`${initialItem.name} deleted.`);
      return;
    }

    if (error) {
      setErrorMessage(error.message);
    }

    setIsDeletingItem(false);
  }

  return (
    <div className="screen-shell">
      <div className="scroll-region">
        <section className="section section--padded-top">
          <header className="screen-header">
            <button className="back-button" type="button" onClick={onBack}>
              &lt;
            </button>
            <div>
              <h2 className="section-title">
                {mode === "edit" ? "Edit Pantry Item" : "Add a Pantry Item"}
              </h2>
              <p className="body-copy body-copy--left">
                {mode === "edit"
                  ? "Update the item details, expiry timing, and image, then save your changes."
                  : "Capture the item details, attach a photo, and save it into your pantry."}
              </p>
            </div>
          </header>

          <div className="form-section">
            <div className="field-group">
              <p className="form-label">Category</p>
              <div className="category-grid">
                {CATEGORY_OPTIONS.map((category) => {
                  const selected = category.value === selectedCategory;

                  return (
                    <button
                      key={category.value}
                      className={cn("category-card", selected && "category-card--selected")}
                      style={{
                        backgroundColor: selected ? category.selectedCardColor : category.cardColor,
                      }}
                      type="button"
                      onClick={() => setSelectedCategory(category.value)}
                    >
                      <span
                        className="category-card__glyph"
                        style={{ backgroundColor: selected ? "rgba(255,255,255,0.9)" : category.accent }}
                      >
                        {category.value === "Pantry" ? (
                          <IoCubeOutline />
                        ) : category.value === "Fridge Items" ? (
                          <IoSnowOutline />
                        ) : (
                          <IoLeafOutline />
                        )}
                      </span>
                      <span className="category-card__body">
                        <span className="category-card__title">{category.title}</span>
                        <span className="category-card__caption">{category.caption}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="field-group">
              <span className="form-label">Name</span>
              <div className="input-shell">
                <input
                  className="field-input field-input--dark"
                  placeholder="E.g. Romaine lettuce..."
                  type="text"
                  value={itemName}
                  onChange={(event) => setItemName(event.target.value)}
                />
              </div>
            </label>

            <label className="field-group">
              <span className="form-label">Quantity</span>
              <div className="input-shell">
                <input
                  className="field-input field-input--dark"
                  min="1"
                  placeholder="24"
                  step="1"
                  type="number"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </div>
            </label>

            <div className="field-group">
              <span className="form-label">Expiry Date</span>
              <div className="input-shell">
                <input
                  className="date-input date-input--full"
                  type="date"
                  value={expiryDate ?? ""}
                  onChange={(event) => setExpiryDate(event.target.value || null)}
                />
              </div>

              {expiryDate ? (
                <button className="secondary-button secondary-button--wide" type="button" onClick={() => setExpiryDate(null)}>
                  Clear Date
                </button>
              ) : null}
            </div>

            <div className="field-group">
              <span className="form-label">Item Photo</span>
              <div className="inline-button-row">
                <button className="secondary-button secondary-button--wide" type="button" onClick={() => cameraInputRef.current?.click()}>
                  <IoCameraOutline />
                  <span>Take Photo</span>
                </button>
                <button className="secondary-button secondary-button--wide" type="button" onClick={() => libraryInputRef.current?.click()}>
                  <IoImagesOutline />
                  <span>Choose Photo</span>
                </button>
              </div>

              <input
                ref={cameraInputRef}
                accept="image/*"
                capture="environment"
                hidden
                type="file"
                onChange={handleSelectFile}
              />
              <input
                ref={libraryInputRef}
                accept="image/*"
                hidden
                type="file"
                onChange={handleSelectFile}
              />

              {photoUri ? (
                <div className="photo-preview-card">
                  <img alt="Selected pantry item photo" className="photo-preview-image" src={photoUri} />
                </div>
              ) : null}
            </div>

            <label className="field-group">
              <span className="form-label">Notes</span>
              <div className="input-shell input-shell--textarea">
                <textarea
                  className="notes-input"
                  placeholder="Storage notes, supplier notes, or handling instructions..."
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </div>
            </label>

            {errorMessage ? <StatusNotice body={errorMessage} title="Couldn't Continue" tone="danger" /> : null}

            <button className="submit-button" type="button" onClick={handleSave}>
              {isSavingItem ? "Saving Item..." : mode === "edit" ? "Save Changes" : "Create Item"}
            </button>

            {mode === "edit" && initialItem ? (
              <button
                className="delete-chip delete-chip--wide"
                disabled={isDeletingItem || isSavingItem}
                type="button"
                onClick={() => void handleDeleteCurrentItem()}
              >
                {isDeletingItem ? "Deleting..." : "Delete Item"}
              </button>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}

type BulkUploadScreenProps = {
  onBack: () => void;
  onImported: (message: string) => void;
  userId: string;
};

function BulkUploadScreen({ onBack, onImported, userId }: BulkUploadScreenProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedBulkRow[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function handleChooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      setErrorMessage(null);
      const xlsx = await import("xlsx");
      const arrayBuffer = await file.arrayBuffer();
      const workbook = xlsx.read(arrayBuffer, { type: "array" });
      const parsed = parseWorkbookRows(workbook, xlsx);

      setFileName(file.name || "Selected spreadsheet");
      setIssues(parsed.issues);
      setParsedRows(parsed.parsedRows);

      if (parsed.parsedRows.length === 0) {
        setErrorMessage("We couldn't find any importable rows in that spreadsheet.");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "We couldn't read that spreadsheet. Please try another file.",
      );
    }
  }

  async function handleImport() {
    if (parsedRows.length === 0 || issues.length > 0) {
      return;
    }

    try {
      setIsImporting(true);
      setErrorMessage(null);

      const payload: PantryItemInsert[] = parsedRows.map(({ previewKey: _previewKey, ...item }) => item);
      const { data, error } = await bulkCreatePantryItems(userId, payload);

      if (error) {
        throw error;
      }

      onImported(`${data?.length ?? payload.length} items imported.`);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "We couldn't import the spreadsheet. Please try again.",
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="screen-shell">
      <div className="scroll-region">
        <section className="section section--padded-top">
          <header className="screen-header">
            <button className="back-button" type="button" onClick={onBack}>
              &lt;
            </button>
            <div>
              <h2 className="section-title">Bulk Upload Inventory</h2>
              <p className="body-copy body-copy--left">
                Import an .xls, .xlsx, or .csv file and turn spreadsheet rows into pantry
                items in one go.
              </p>
            </div>
          </header>

          <div className="surface-card">
            <div className="bulk-card-heading">
              <p className="bulk-card-title">Expected columns</p>
              <p className="body-copy body-copy--left">
                Keep the first row as headers. Extra columns are ignored, and missing optional
                fields stay empty.
              </p>
            </div>

            <div className="field-chip-wrap">
              {EXPECTED_FIELDS.map((field) => (
                <div key={field} className="field-chip">
                  <span className="field-chip__text">{field}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="surface-card">
            <div className="bulk-card-heading">
              <p className="bulk-card-title">Spreadsheet file</p>
              <p className="body-copy body-copy--left">
                Choose a file from your device, then preview the rows before importing.
              </p>
            </div>

            <button
              className="secondary-button secondary-button--wide secondary-button--icon"
              type="button"
              onClick={() => fileInputRef.current?.click()}
            >
              <IoDocumentTextOutline />
              <span>Choose Spreadsheet</span>
            </button>

            <input
              ref={fileInputRef}
              accept=".csv,.xls,.xlsx"
              hidden
              type="file"
              onChange={handleChooseFile}
            />

            {fileName ? (
              <div className="notice notice--neutral">
                <p className="notice__title">{fileName}</p>
                <p className="notice__body">
                  {parsedRows.length} importable row{parsedRows.length === 1 ? "" : "s"} found.
                </p>
              </div>
            ) : null}

            {issues.length > 0 ? (
              <div className="notice notice--warning">
                <p className="notice__title">Fix these rows first</p>
                <p className="notice__body">{issues.slice(0, 4).join(" ")}</p>
              </div>
            ) : null}

            {errorMessage ? (
              <div className="notice notice--danger">
                <p className="notice__title">Couldn't Continue</p>
                <p className="notice__body">{errorMessage}</p>
              </div>
            ) : null}
          </div>

          {parsedRows.length > 0 ? (
            <div className="surface-card">
              <div className="bulk-card-heading">
                <p className="bulk-card-title">Preview</p>
                <p className="body-copy body-copy--left">
                  We'll import the first sheet only. Here's a quick snapshot of the rows.
                </p>
              </div>

              <div className="bulk-preview-list">
                {parsedRows.slice(0, 5).map((row) => (
                  <div key={row.previewKey} className="bulk-preview-card">
                    <p className="inventory-name">{row.name}</p>
                    <p className="inventory-meta">
                      {row.category || "Pantry"} / Qty {row.quantity}
                    </p>
                    <p className="inventory-meta">
                      {row.expiry_date ? `Expires ${row.expiry_date}` : "No expiry date"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <button
            className="submit-button submit-button--icon submit-button--spaced"
            disabled={parsedRows.length === 0 || issues.length > 0 || isImporting}
            type="button"
            onClick={() => void handleImport()}
          >
            <IoCloudUploadOutline />
            <span>{isImporting ? "Importing..." : "Import Items"}</span>
          </button>
        </section>
      </div>
    </div>
  );
}

type ExpiredItemsScreenProps = {
  onBack: () => void;
  onItemsChanged: (message: string) => void;
  onOpenEdit: (item: PantryItemRecord) => void;
  refreshToken: number;
  userId: string;
};

function ExpiredItemsScreen({
  onBack,
  onItemsChanged,
  onOpenEdit,
  refreshToken,
  userId,
}: ExpiredItemsScreenProps) {
  const [pantryItems, setPantryItems] = useState<PantryItemRecord[]>([]);
  const [isItemsLoading, setIsItemsLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadPantryItems() {
      try {
        setIsItemsLoading(true);
        setInventoryError(null);

        const { data, error } = await listPantryItems(userId);

        if (!isMounted) {
          return;
        }

        if (error) {
          throw error;
        }

        setPantryItems(data ?? []);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setInventoryError(
          error instanceof Error ? error.message : "Couldn't load your expired items.",
        );
      } finally {
        if (isMounted) {
          setIsItemsLoading(false);
        }
      }
    }

    void loadPantryItems();

    return () => {
      isMounted = false;
    };
  }, [refreshToken, userId]);

  const expiredItems = useMemo(() => {
    return pantryItems.filter((item) => getPantryItemStatus(item.expiry_date) === "expired");
  }, [pantryItems]);

  async function handleDeleteItem(item: PantryItemRecord) {
    const { deleted, error } = await confirmAndDeletePantryItem(
      userId,
      item,
      () => {
        setDeletingItemId(item.id);
      },
      () => {
        setPantryItems((currentItems) =>
          currentItems.filter((currentItem) => currentItem.id !== item.id),
        );
      },
    );

    if (deleted) {
      onItemsChanged(`${item.name} deleted.`);
    } else if (error) {
      window.alert(error.message);
    }

    setDeletingItemId(null);
  }

  return (
    <div className="screen-shell">
      <div className="scroll-region">
        <section className="section section--padded-top">
          <header className="screen-header">
            <button className="back-button" type="button" onClick={onBack}>
              &lt;
            </button>
            <div>
              <h2 className="section-title">Expired Items</h2>
              <p className="body-copy body-copy--left">
                Review products that have already passed their expiry date, then either delete
                them or open the full item details.
              </p>
            </div>
          </header>

          <div className="summary-card">
            <p className="summary-card__eyebrow">Expired Inventory</p>
            <p className="summary-card__value">
              {expiredItems.length} {expiredItems.length === 1 ? "Item" : "Items"}
            </p>
            <p className="summary-card__copy">
              Keep this queue clean so the active inventory view stays focused on what can still
              move.
            </p>
          </div>

          {inventoryError ? (
            <div className="empty-card">
              <h3 className="section-heading">Expired View Unavailable</h3>
              <p className="body-copy body-copy--left">{inventoryError}</p>
            </div>
          ) : isItemsLoading ? (
            <SkeletonInventoryList />
          ) : expiredItems.length === 0 ? (
            <div className="empty-card">
              <h3 className="section-heading">No Expired Items</h3>
              <p className="body-copy body-copy--left">
                Everything currently in your pantry is still active or inside the upcoming expiry
                window.
              </p>
            </div>
          ) : (
            expiredItems.map((item) => {
              const expiredDays = getExpiredDays(item.expiry_date);

              return (
                <div
                  key={item.id}
                  className="inventory-card-button"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onOpenEdit(item);
                    }
                  }}
                  onClick={() => onOpenEdit(item)}
                >
                  <div className="inventory-card">
                    <div className="inventory-row inventory-row--top">
                      <div className="inventory-media">
                        {item.photo_url ? (
                          <img alt={`${item.name} photo`} className="inventory-image" src={item.photo_url} />
                        ) : (
                          <span className="inventory-fallback">o</span>
                        )}
                      </div>

                      <div className="inventory-main">
                        <div>
                          <p className="eyebrow eyebrow--left">{item.category || "Uncategorized"}</p>
                          <p className="inventory-name">{item.name}</p>
                          <p className="inventory-meta">
                            Qty {item.quantity} / Expired {expiredDays ?? 0}d ago
                          </p>
                        </div>

                        <p className="inventory-meta">
                          {item.notes?.trim() ? item.notes.trim() : `Expired on ${formatExpiryCopy(item.expiry_date)}.`}
                        </p>
                      </div>

                      <div className="inventory-actions">
                        <span className="inventory-badge inventory-badge--danger">Expired</span>
                        <button
                          className="delete-chip"
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteItem(item);
                          }}
                        >
                          {deletingItemId === item.id ? "Deleting..." : "Delete"}
                        </button>
                        <span className="inventory-link">Open -&gt;</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}

function EditPantryItemRoute({
  itemId,
  onBack,
  onDeleted,
  onSaved,
  userId,
}: {
  itemId: string;
  onBack: () => void;
  onDeleted: (message: string) => void;
  onSaved: (message: string) => void;
  userId: string;
}) {
  const [item, setItem] = useState<PantryItemRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadItem() {
      try {
        setIsLoading(true);
        setErrorMessage(null);

        const { data, error } = await getPantryItem(userId, itemId);

        if (!isMounted) {
          return;
        }

        if (error) {
          throw error;
        }

        setItem(data);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "Couldn't load the pantry item.",
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadItem();

    return () => {
      isMounted = false;
    };
  }, [itemId, userId]);

  if (isLoading) {
    return (
      <div className="screen-shell">
        <div className="scroll-region">
          <section className="section section--padded-top">
            <div className="empty-card">
              <h3 className="section-heading">Loading Pantry Item...</h3>
              <p className="body-copy body-copy--left">Pulling the latest record from Supabase.</p>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (errorMessage || !item) {
    return (
      <div className="screen-shell">
        <div className="scroll-region">
          <section className="section section--padded-top">
            <header className="screen-header">
              <button className="back-button" type="button" onClick={onBack}>
                &lt;
              </button>
              <div>
                <h2 className="section-title">Edit Pantry Item</h2>
                <p className="body-copy body-copy--left">
                  The selected pantry record could not be loaded.
                </p>
              </div>
            </header>
            <StatusNotice
              body={errorMessage ?? "The selected pantry record could not be found."}
              title="Item Unavailable"
              tone="danger"
            />
          </section>
        </div>
      </div>
    );
  }

  return (
    <PantryItemFormScreen
      initialItem={item}
      mode="edit"
      onBack={onBack}
      onDeleted={onDeleted}
      onSaved={onSaved}
      userId={userId}
    />
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const navigationState = location.state as { backgroundLocation?: RouterLocation } | null;
  const backgroundLocation =
    navigationState?.backgroundLocation &&
    isDashboardPath(navigationState.backgroundLocation.pathname)
      ? navigationState.backgroundLocation
      : null;
  const displayLocation = backgroundLocation ?? location;
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [dashboardRefreshToken, setDashboardRefreshToken] = useState(0);
  const [dashboardToastMessage, setDashboardToastMessage] = useState<string | null>(null);
  const hasAlertedAuthError = useRef(false);
  const hasAlertedProfileError = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowSplash(false);
    }, 2400);

    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    let isMounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!isMounted) {
          return;
        }

        if (error && !hasAlertedAuthError.current) {
          hasAlertedAuthError.current = true;
          window.alert(error.message);
        }

        setSession(data.session ?? null);
        setAuthReady(true);
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return;
        }

        if (!hasAlertedAuthError.current) {
          hasAlertedAuthError.current = true;
          window.alert(
            error instanceof Error ? error.message : "Couldn't restore your session.",
          );
        }

        setAuthReady(true);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!isMounted) {
        return;
      }

      setSession(nextSession);
      setAuthReady(true);

      if (!nextSession) {
        setDashboardToastMessage(null);
        setProfile(null);
        navigate("/", { replace: true });
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setIsProfileLoading(false);
      return;
    }

    let isMounted = true;
    setIsProfileLoading(true);

    getOrCreateProfile(session.user)
      .then(({ data, error }) => {
        if (!isMounted) {
          return;
        }

        if (error && !hasAlertedProfileError.current) {
          hasAlertedProfileError.current = true;
          window.alert(error.message || "Couldn't load your profile details.");
        }

        setProfile(data);
      })
      .finally(() => {
        if (isMounted) {
          setIsProfileLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!dashboardToastMessage) {
      return;
    }

    const timer = window.setTimeout(() => {
      setDashboardToastMessage(null);
    }, 1600);

    return () => window.clearTimeout(timer);
  }, [dashboardToastMessage]);

  useLayoutEffect(() => {
    scheduleCurrentViewScrollToTop();
  }, [backgroundLocation, location.key, location.pathname]);

  useEffect(() => {
    if (!backgroundLocation || typeof document === "undefined") {
      return undefined;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [backgroundLocation]);

  const splashVisible = showSplash || !authReady;
  const displayName =
    profile?.full_name?.trim() ||
    session?.user.user_metadata.full_name?.trim() ||
    session?.user.email?.split("@")[0] ||
    "there";
  const userEmail = session?.user.email ?? null;
  const authenticatedUserId = session?.user.id ?? null;
  const editMatch = location.pathname.match(/^\/item\/([^/]+)\/edit$/);
  const editItemId = editMatch ? decodeURIComponent(editMatch[1]) : null;
  const activeDashboardTab = getDashboardTabFromPath(displayLocation.pathname);

  async function handleLogout() {
    if (isSigningOut) {
      return;
    }

    try {
      setIsSigningOut(true);
      const { error } = await signOutCurrentUser();

      if (error) {
        throw error;
      }
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Couldn't log out. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  }

  function handlePantryItemSaved(message: string) {
    setDashboardRefreshToken((current) => current + 1);
    setDashboardToastMessage(message);
  }

  function handlePantryItemsChanged(message: string) {
    setDashboardRefreshToken((current) => current + 1);
    setDashboardToastMessage(message);
  }

  function handleProfileUpdated(nextProfile: ProfileRecord) {
    setProfile(nextProfile);
  }

  function getOverlayNavigateOptions() {
    const nextBackgroundLocation =
      backgroundLocation ?? (isDashboardPath(location.pathname) ? location : null);

    if (!nextBackgroundLocation) {
      return undefined;
    }

    return {
      state: {
        backgroundLocation: nextBackgroundLocation,
      },
    };
  }

  function goHome() {
    if (backgroundLocation) {
      navigate(-1);
      return;
    }

    navigate("/");
  }

  function goToCreate() {
    navigate("/item/new", getOverlayNavigateOptions());
  }

  function goToEdit(item: PantryItemRecord) {
    navigate(`/item/${encodeURIComponent(item.id)}/edit`, getOverlayNavigateOptions());
  }

  function goToExpired() {
    navigate("/expired", getOverlayNavigateOptions());
  }

  function goToBulkUpload() {
    navigate("/bulk-upload", getOverlayNavigateOptions());
  }

  function goToDashboardTab(tab: TabKey) {
    navigate(DASHBOARD_TAB_PATHS[tab]);
  }

  function renderDashboardRoute(tab: TabKey) {
    return (
      <div className="app-shell">
        <div className="device-frame">
          <DashboardScreen
            activeTab={tab}
            displayName={displayName}
            isLoggingOut={isSigningOut}
            isProfileLoading={isProfileLoading}
            onLogout={handleLogout}
            onOpenBulkUpload={goToBulkUpload}
            onOpenCreate={goToCreate}
            onOpenEdit={goToEdit}
            onOpenExpired={goToExpired}
            onProfileUpdated={handleProfileUpdated}
            onShowToast={setDashboardToastMessage}
            onTabChange={goToDashboardTab}
            profile={profile}
            refreshToken={dashboardRefreshToken}
            toastMessage={dashboardToastMessage}
            userEmail={userEmail}
            userId={authenticatedUserId ?? ""}
          />
        </div>
      </div>
    );
  }

  function renderOverlay(children: ReactNode) {
    return (
      <div key={location.key} className="route-overlay">
        {children}
      </div>
    );
  }

  if (splashVisible) {
    return <SplashScreen />;
  }

  if (!session || !authenticatedUserId) {
    return <AuthScreen onAuthSuccess={() => navigate("/")} />;
  }

  return (
    <>
      <Routes location={displayLocation}>
        <Route path="/" element={renderDashboardRoute(activeDashboardTab)} />
        <Route path="/inventory" element={renderDashboardRoute(activeDashboardTab)} />
        <Route path="/alerts" element={renderDashboardRoute(activeDashboardTab)} />
        <Route path="/profile" element={renderDashboardRoute(activeDashboardTab)} />
        <Route
          path="/item/new"
          element={
            <PantryItemFormScreen
              mode="create"
              onBack={goHome}
              onSaved={(message) => {
                handlePantryItemSaved(message);
                goHome();
              }}
              userId={authenticatedUserId}
            />
          }
        />
        <Route
          path="/item/:itemId/edit"
          element={
            editItemId ? (
            <EditPantryItemRoute
              itemId={editItemId}
              onBack={goHome}
              onDeleted={(message) => {
                handlePantryItemsChanged(message);
                goHome();
              }}
              onSaved={(message) => {
                handlePantryItemSaved(message);
                goHome();
                }}
                userId={authenticatedUserId}
              />
            ) : (
              <Navigate replace to="/" />
            )
          }
        />
        <Route
          path="/expired"
          element={
            <ExpiredItemsScreen
              onBack={goHome}
              onItemsChanged={handlePantryItemsChanged}
              onOpenEdit={goToEdit}
              refreshToken={dashboardRefreshToken}
              userId={authenticatedUserId}
            />
          }
        />
        <Route
          path="/bulk-upload"
          element={
            <BulkUploadScreen
              onBack={goHome}
              onImported={(message) => {
                handlePantryItemSaved(message);
                goHome();
              }}
              userId={authenticatedUserId}
            />
          }
        />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>

      {backgroundLocation ? (
        <Routes>
          <Route
            path="/item/new"
            element={renderOverlay(
              <PantryItemFormScreen
                mode="create"
                onBack={goHome}
                onSaved={(message) => {
                  handlePantryItemSaved(message);
                  goHome();
                }}
                userId={authenticatedUserId}
              />,
            )}
          />
          <Route
            path="/item/:itemId/edit"
            element={
              editItemId
                ? renderOverlay(
                    <EditPantryItemRoute
                      itemId={editItemId}
                      onBack={goHome}
                      onDeleted={(message) => {
                        handlePantryItemsChanged(message);
                        goHome();
                      }}
                      onSaved={(message) => {
                        handlePantryItemSaved(message);
                        goHome();
                      }}
                      userId={authenticatedUserId}
                    />,
                  )
                : <Navigate replace to={backgroundLocation.pathname} />
            }
          />
          <Route
            path="/expired"
            element={renderOverlay(
              <ExpiredItemsScreen
                onBack={goHome}
                onItemsChanged={handlePantryItemsChanged}
                onOpenEdit={goToEdit}
                refreshToken={dashboardRefreshToken}
                userId={authenticatedUserId}
              />,
            )}
          />
          <Route
            path="/bulk-upload"
            element={renderOverlay(
              <BulkUploadScreen
                onBack={goHome}
                onImported={(message) => {
                  handlePantryItemSaved(message);
                  goHome();
                }}
                userId={authenticatedUserId}
              />,
            )}
          />
        </Routes>
      ) : null}
    </>
  );
}
