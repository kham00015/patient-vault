import type { CreatePatientInput } from "@/lib/patient-registration";

export type RegistrationFieldConflict = {
  field: keyof CreatePatientInput;
  label: string;
  values: string[];
  message: string;
};

export type RegistrationExtractResult = {
  fields: Partial<CreatePatientInput>;
  conflicts: RegistrationFieldConflict[];
  notes: string[];
  provider: "bedrock";
};
