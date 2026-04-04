import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  IoArrowForward,
  IoCameraOutline,
  IoCubeOutline,
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
import { useLocation, useNavigate } from "react-router-dom";

import BrandMark from "./components/BrandMark";
import {
  createPantryItem,
  deletePantryItem,
  getPantryItem,
  listPantryItems,
  type PantryItemRecord,
  updatePantryItem,
  uploadPantryItemPhoto,
} from "./lib/pantry-items";
import { getOrCreateProfile, type ProfileRecord } from "./lib/profiles";
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

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function trimOptionalValue(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
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
  onOpenCreate: () => void;
  onOpenEdit: (item: PantryItemRecord) => void;
  onOpenExpired: () => void;
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
  onOpenCreate,
  onOpenEdit,
  onOpenExpired,
  onShowToast,
  onTabChange,
  profile,
  refreshToken,
  toastMessage,
  userEmail,
  userId,
}: DashboardScreenProps) {
  const [search, setSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");
  const [pantryItems, setPantryItems] = useState<PantryItemRecord[]>([]);
  const [isItemsLoading, setIsItemsLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [updatingQuantityId, setUpdatingQuantityId] = useState<string | null>(null);
  const [showExpiryRunwayCard, setShowExpiryRunwayCard] = useState(true);

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
    const confirmed = window.confirm(`Delete ${item.name}? This action cannot be undone.`);

    if (!confirmed) {
      return;
    }

    try {
      setDeletingItemId(item.id);
      const { error } = await deletePantryItem(userId, item.id);

      if (error) {
        throw error;
      }

      setPantryItems((currentItems) =>
        currentItems.filter((currentItem) => currentItem.id !== item.id),
      );
      onShowToast(`${item.name} deleted.`);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Couldn't delete the item. Please try again.",
      );
    } finally {
      setDeletingItemId(null);
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

            <button
              aria-label="Open alerts"
              className="icon-button"
              type="button"
              onClick={() => onTabChange("alerts")}
            >
              !
            </button>
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
          </div>

          {showExpiryRunwayCard ? (
            <div className="promo-card">
              <div className="promo-strip" />
              <div className="promo-body">
                <div className="promo-icon">*</div>
                <div className="promo-copy">
                  <p className="promo-title">Review Today's Expiry Runway</p>
                  <p className="body-copy body-copy--left">
                    Tighten handoffs before the lunch rush by checking stock with short freshness
                    windows first.
                  </p>
                </div>
                <button
                  aria-label="Dismiss insight"
                  className="promo-dismiss"
                  type="button"
                  onClick={() => setShowExpiryRunwayCard(false)}
                >
                  x
                </button>
              </div>
              <button className="promo-footer" type="button" onClick={() => onTabChange("alerts")}>
                <span>Open Expiry Alerts</span>
                <span>&gt;</span>
              </button>
            </div>
          ) : null}

          <div className="info-grid">
            <div className="info-card">
              <div className="info-card__icon">*</div>
              <h3 className="info-card__title">Expiry Watch</h3>
              <p className="body-copy body-copy--left">
                Track the batches closest to spoilage and move them first while there's still
                sell-through time.
              </p>
              <button className="text-link" type="button" onClick={onOpenExpired}>
                {expiredItems.length} Expired in Review
              </button>
            </div>

            <div className="info-card">
              <div className="info-card__icon">o</div>
              <h3 className="info-card__title">Team Access</h3>
              <p className="body-copy body-copy--left">
                Keep profile details, teammates, and alert ownership aligned as your workflow
                expands.
              </p>
              <button className="text-link" type="button" onClick={() => onTabChange("profile")}>
                Open Profile & Access
              </button>
            </div>
          </div>
        </section>
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
                {category.label} / {category.count}
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
                      <img alt={`${item.name} photo`} className="inventory-image" src={item.photo_url} />
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

            <button className="icon-button" type="button" onClick={onLogout}>
              {isLoggingOut ? "..." : ">"}
            </button>
          </div>
        </header>

        <div className="profile-panel">
          <div className="header-row header-row--stretch">
            <div className="profile-main">
              <div className="avatar-circle">{profileInitial}</div>

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

            <button className="secondary-button secondary-button--compact" type="button" onClick={onLogout}>
              {isLoggingOut ? "Logging Out..." : "Log Out"}
            </button>
          </div>

          <div className="detail-grid">
            <div className="detail-card">
              <p className="detail-label">Full Name</p>
              <p className="detail-value">{profile?.full_name || displayName}</p>
            </div>
            <div className="detail-card">
              <p className="detail-label">Avatar URL</p>
              <p className="detail-value detail-value--truncate">{profile?.avatar_url || "Not set"}</p>
            </div>
            <div className="detail-card">
              <p className="detail-label">Created</p>
              <p className="detail-value">{formatProfileDate(profile?.created_at ?? null)}</p>
            </div>
            <div className="detail-card">
              <p className="detail-label">Last Updated</p>
              <p className="detail-value">{formatProfileDate(profile?.updated_at ?? null)}</p>
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
      <div className="scroll-region">{renderContent()}</div>

      <nav className="bottom-bar">
        {tabs.map((tab) => {
          const active = tab.key === activeTab;

          return (
            <button
              key={tab.key}
              className={cn("bottom-tab", active && "bottom-tab--active")}
              type="button"
              onClick={() => onTabChange(tab.key)}
            >
              <span className="bottom-tab__icon">{active ? tab.activeIcon : tab.icon}</span>
              <span className="bottom-tab__text">{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {toastMessage ? <div className="toast-card">{toastMessage}</div> : null}
    </div>
  );
}

type PantryItemFormScreenProps = {
  initialItem?: PantryItemRecord | null;
  mode: "create" | "edit";
  onBack: () => void;
  onSaved: (message: string) => void;
  userId: string;
};

function PantryItemFormScreen({
  initialItem,
  mode,
  onBack,
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
  const [showExpiryPicker, setShowExpiryPicker] = useState(false);
  const [isSavingItem, setIsSavingItem] = useState(false);
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
              <button className="picker-button" type="button" onClick={() => setShowExpiryPicker((current) => !current)}>
                <span className={cn("picker-value", !expiryDate && "picker-value--muted")}>
                  {expiryDate ? formatExpiryCopy(expiryDate) : "Choose a date..."}
                </span>
              </button>

              {showExpiryPicker ? (
                <div className="picker-panel">
                  <input
                    className="date-input"
                    type="date"
                    value={expiryDate ?? ""}
                    onChange={(event) => setExpiryDate(event.target.value || null)}
                  />
                </div>
              ) : null}

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
          </div>
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
    const confirmed = window.confirm(`Delete ${item.name}? This action cannot be undone.`);

    if (!confirmed) {
      return;
    }

    try {
      setDeletingItemId(item.id);
      const { error } = await deletePantryItem(userId, item.id);

      if (error) {
        throw error;
      }

      setPantryItems((currentItems) =>
        currentItems.filter((currentItem) => currentItem.id !== item.id),
      );
      onItemsChanged(`${item.name} deleted.`);
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Couldn't delete the item. Please try again.",
      );
    } finally {
      setDeletingItemId(null);
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
  onSaved,
  userId,
}: {
  itemId: string;
  onBack: () => void;
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
    <PantryItemFormScreen initialItem={item} mode="edit" onBack={onBack} onSaved={onSaved} userId={userId} />
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("home");
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
        setActiveTab("home");
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

  const splashVisible = showSplash || !authReady;
  const displayName =
    profile?.full_name?.trim() ||
    session?.user.user_metadata.full_name?.trim() ||
    session?.user.email?.split("@")[0] ||
    "there";
  const userEmail = session?.user.email ?? null;
  const editMatch = location.pathname.match(/^\/item\/([^/]+)\/edit$/);
  const editItemId = editMatch ? decodeURIComponent(editMatch[1]) : null;

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
    setActiveTab("home");
    setDashboardRefreshToken((current) => current + 1);
    setDashboardToastMessage(message);
  }

  function handlePantryItemsChanged(message: string) {
    setDashboardRefreshToken((current) => current + 1);
    setDashboardToastMessage(message);
  }

  function goHome() {
    navigate("/");
  }

  function goToCreate() {
    navigate("/item/new");
  }

  function goToEdit(item: PantryItemRecord) {
    navigate(`/item/${encodeURIComponent(item.id)}/edit`);
  }

  function goToExpired() {
    navigate("/expired");
  }

  if (splashVisible) {
    return <SplashScreen />;
  }

  if (!session) {
    return <AuthScreen onAuthSuccess={() => navigate("/")} />;
  }

  if (location.pathname === "/item/new") {
    return (
      <PantryItemFormScreen
        mode="create"
        onBack={goHome}
        onSaved={(message) => {
          handlePantryItemSaved(message);
          goHome();
        }}
        userId={session.user.id}
      />
    );
  }

  if (editItemId) {
    return (
      <EditPantryItemRoute
        itemId={editItemId}
        onBack={goHome}
        onSaved={(message) => {
          handlePantryItemSaved(message);
          goHome();
        }}
        userId={session.user.id}
      />
    );
  }

  if (location.pathname === "/expired") {
    return (
      <ExpiredItemsScreen
        onBack={goHome}
        onItemsChanged={handlePantryItemsChanged}
        onOpenEdit={goToEdit}
        refreshToken={dashboardRefreshToken}
        userId={session.user.id}
      />
    );
  }

  return (
    <div className="app-shell">
      <div className="device-frame">
        <DashboardScreen
          activeTab={activeTab}
          displayName={displayName}
          isLoggingOut={isSigningOut}
          isProfileLoading={isProfileLoading}
          onLogout={handleLogout}
          onOpenCreate={goToCreate}
          onOpenEdit={goToEdit}
          onOpenExpired={goToExpired}
          onShowToast={setDashboardToastMessage}
          onTabChange={setActiveTab}
          profile={profile}
          refreshToken={dashboardRefreshToken}
          toastMessage={dashboardToastMessage}
          userEmail={userEmail}
          userId={session.user.id}
        />
      </div>
    </div>
  );
}
