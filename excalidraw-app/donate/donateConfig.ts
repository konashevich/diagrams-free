export type DonateKind = "once" | "monthly";
export type DonateTier = "199" | "500" | "1000" | "custom";

export type DonateLinks = Record<DonateKind, Record<DonateTier, string>>;

const readEnv = (key: string): string =>
  (import.meta.env[key] as string | undefined)?.trim() ?? "";

const DONATE_LINK_ENV: Record<DonateKind, Record<DonateTier, string>> = {
  once: {
    "199": "VITE_APP_STRIPE_DONATE_ONCE_199",
    "500": "VITE_APP_STRIPE_DONATE_ONCE_500",
    "1000": "VITE_APP_STRIPE_DONATE_ONCE_1000",
    custom: "VITE_APP_STRIPE_DONATE_ONCE_CUSTOM",
  },
  monthly: {
    "199": "VITE_APP_STRIPE_DONATE_MONTHLY_199",
    "500": "VITE_APP_STRIPE_DONATE_MONTHLY_500",
    "1000": "VITE_APP_STRIPE_DONATE_MONTHLY_1000",
    custom: "VITE_APP_STRIPE_DONATE_MONTHLY_CUSTOM",
  },
};

const PRESET_TIERS = ["199", "500", "1000"] as const;

export const buildDonateLinks = (): DonateLinks | null => {
  const once = {} as Record<DonateTier, string>;
  const monthly = {} as Record<DonateTier, string>;

  for (const tier of PRESET_TIERS) {
    once[tier] = readEnv(DONATE_LINK_ENV.once[tier]);
    monthly[tier] = readEnv(DONATE_LINK_ENV.monthly[tier]);
    if (!once[tier] || !monthly[tier]) {
      return null;
    }
  }

  once.custom = readEnv(DONATE_LINK_ENV.once.custom);
  if (!once.custom) {
    return null;
  }

  monthly.custom = readEnv(DONATE_LINK_ENV.monthly.custom);

  return { once, monthly };
};

export const isDonateEnabled = (): boolean => {
  if (import.meta.env.VITE_APP_DONATE_ENABLED !== "true") {
    return false;
  }
  return buildDonateLinks() !== null;
};

export const getDonateCheckoutUrl = (
  links: DonateLinks,
  kind: DonateKind,
  tier: DonateTier,
): string => links[kind][tier];

export const DONATE_PRESETS: { tier: DonateTier; label: string }[] = [
  { tier: "199", label: "$1.99" },
  { tier: "500", label: "$5.00" },
  { tier: "1000", label: "$10.00" },
];
