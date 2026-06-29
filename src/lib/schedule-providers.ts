export const SCHEDULE_PROVIDERS = [
  { key: "FIRAS_KHAMIS", label: "Firas Khamis" },
  { key: "NICHOLAS_KALAYEH", label: "Nicholas Kalayeh" },
] as const;

export type ScheduleProviderKey = (typeof SCHEDULE_PROVIDERS)[number]["key"];

export const DEFAULT_SCHEDULE_PROVIDER: ScheduleProviderKey = "FIRAS_KHAMIS";

export function isScheduleProviderKey(value: string): value is ScheduleProviderKey {
  return SCHEDULE_PROVIDERS.some((provider) => provider.key === value);
}

export function getScheduleProviderLabel(key: ScheduleProviderKey) {
  return SCHEDULE_PROVIDERS.find((provider) => provider.key === key)?.label ?? key;
}
