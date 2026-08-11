import { z } from "zod";

export const SEX_AT_BIRTH_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
  { value: "UNKNOWN", label: "Unknown" },
] as const;

export const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
] as const;

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v?.trim() ? v.trim() : undefined));

const optionalState = z
  .string()
  .max(2)
  .optional()
  .or(z.literal(""))
  .transform((v) => {
    const trimmed = v?.trim().toUpperCase();
    return trimmed || undefined;
  })
  .refine(
    (v) => !v || (US_STATES as readonly string[]).includes(v),
    "Invalid US state code"
  );

export const createPatientSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100).transform((v) => v.trim()),
  lastName: z.string().min(1, "Last name is required").max(100).transform((v) => v.trim()),
  middleName: optionalText(100),
  dateOfBirth: z.string().min(1, "Date of birth is required").refine((v) => !Number.isNaN(Date.parse(v)), {
    message: "Invalid date of birth",
  }),
  sexAtBirth: z.enum(["MALE", "FEMALE", "OTHER", "UNKNOWN"]),
  phone: z
    .string()
    .min(7, "Phone is required")
    .max(30)
    .transform((v) => v.trim()),
  email: optionalText(200).pipe(z.string().email("Invalid email").optional()),
  addressLine1: z.string().min(1, "Address is required").max(200).transform((v) => v.trim()),
  addressLine2: optionalText(200),
  city: z.string().min(1, "City is required").max(100).transform((v) => v.trim()),
  state: z
    .string()
    .min(2, "State is required")
    .max(2)
    .transform((v) => v.trim().toUpperCase())
    .refine((v) => (US_STATES as readonly string[]).includes(v), "Invalid US state code"),
  zip: z
    .string()
    .min(5, "ZIP code is required")
    .max(10)
    .transform((v) => v.trim()),
  emergencyContactName: z.string().min(1, "Emergency contact name is required").max(100).transform((v) => v.trim()),
  emergencyContactPhone: z
    .string()
    .min(7, "Emergency contact phone is required")
    .max(30)
    .transform((v) => v.trim()),
  emergencyContactRelation: optionalText(50),
  primaryInsuranceCarrier: z.string().min(1, "Insurance carrier is required").max(150).transform((v) => v.trim()),
  primaryInsuranceMemberId: z.string().min(1, "Member ID is required").max(100).transform((v) => v.trim()),
  primaryInsuranceGroupNumber: optionalText(100),
  primaryInsurancePayerId: optionalText(100),
  primaryInsuranceClaimAddressLine1: optionalText(200),
  primaryInsuranceClaimAddressLine2: optionalText(200),
  primaryInsuranceClaimCity: optionalText(100),
  primaryInsuranceClaimState: optionalState,
  primaryInsuranceClaimZip: optionalText(10),
  secondaryInsuranceCarrier: optionalText(150),
  secondaryInsuranceMemberId: optionalText(100),
  secondaryInsuranceGroupNumber: optionalText(100),
  secondaryInsurancePayerId: optionalText(100),
  secondaryInsuranceClaimAddressLine1: optionalText(200),
  secondaryInsuranceClaimAddressLine2: optionalText(200),
  secondaryInsuranceClaimCity: optionalText(100),
  secondaryInsuranceClaimState: optionalState,
  secondaryInsuranceClaimZip: optionalText(10),
  allergies: z.string().min(1, "Allergies are required — enter NKDA if none").max(2000).transform((v) => v.trim()),
  currentMedications: optionalText(4000),
});

export type CreatePatientInput = z.infer<typeof createPatientSchema>;

export const updateDemographicsSchema = createPatientSchema.partial();

export const ENCRYPTED_DEMOGRAPHIC_FIELDS = [
  "email",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "zip",
  "emergencyContactName",
  "emergencyContactPhone",
  "emergencyContactRelation",
  "primaryInsuranceCarrier",
  "primaryInsuranceMemberId",
  "primaryInsuranceGroupNumber",
  "primaryInsurancePayerId",
  "primaryInsuranceClaimAddressLine1",
  "primaryInsuranceClaimAddressLine2",
  "primaryInsuranceClaimCity",
  "primaryInsuranceClaimState",
  "primaryInsuranceClaimZip",
  "secondaryInsuranceCarrier",
  "secondaryInsuranceMemberId",
  "secondaryInsuranceGroupNumber",
  "secondaryInsurancePayerId",
  "secondaryInsuranceClaimAddressLine1",
  "secondaryInsuranceClaimAddressLine2",
  "secondaryInsuranceClaimCity",
  "secondaryInsuranceClaimState",
  "secondaryInsuranceClaimZip",
  "allergies",
  "currentMedications",
] as const;

export function formatPatientName(first: string, last: string, middle?: string | null) {
  const middlePart = middle?.trim() ? ` ${middle.trim()}` : "";
  return `${last.trim()}, ${first.trim()}${middlePart}`;
}

export function formatDisplayName(patient: {
  name: string;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
}) {
  if (patient.firstName?.trim() && patient.lastName?.trim()) {
    return formatPatientName(patient.firstName, patient.lastName, patient.middleName);
  }
  return patient.name;
}

export function formatSexAtBirth(value?: string | null) {
  return SEX_AT_BIRTH_OPTIONS.find((o) => o.value === value)?.label ?? "Unknown";
}

export function calculateAge(dateOfBirth: Date | string | null | undefined) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

export const EMPTY_PATIENT_FORM: CreatePatientInput = {
  firstName: "",
  lastName: "",
  middleName: "",
  dateOfBirth: "",
  sexAtBirth: "UNKNOWN",
  phone: "",
  email: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  zip: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelation: "",
  primaryInsuranceCarrier: "",
  primaryInsuranceMemberId: "",
  primaryInsuranceGroupNumber: "",
  primaryInsurancePayerId: "",
  primaryInsuranceClaimAddressLine1: "",
  primaryInsuranceClaimAddressLine2: "",
  primaryInsuranceClaimCity: "",
  primaryInsuranceClaimState: "",
  primaryInsuranceClaimZip: "",
  secondaryInsuranceCarrier: "",
  secondaryInsuranceMemberId: "",
  secondaryInsuranceGroupNumber: "",
  secondaryInsurancePayerId: "",
  secondaryInsuranceClaimAddressLine1: "",
  secondaryInsuranceClaimAddressLine2: "",
  secondaryInsuranceClaimCity: "",
  secondaryInsuranceClaimState: "",
  secondaryInsuranceClaimZip: "",
  allergies: "NKDA",
  currentMedications: "",
};
