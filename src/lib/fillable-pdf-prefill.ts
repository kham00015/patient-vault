/**
 * Prefill patient identity fields on clinic fillable PDFs when empty.
 * Field names come from the AcroForm generators (NCCC / Modern Medicine forms).
 */

export type PatientFormPrefill = {
  /** Display / full name (e.g. "Last, First"). */
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  /** Medical record number when known. */
  mrn?: string | null;
  /** ISO date string or Date — patient DOB when known. */
  dateOfBirth?: string | Date | null;
  /**
   * Form created / visit date (YYYY-MM-DD or Date). Prefills `form_date` when empty;
   * clinician may still edit the field.
   */
  formDate?: string | Date | null;
};

/** @deprecated Use PatientFormPrefill */
export type PatientNamePrefill = PatientFormPrefill;

const FULL_NAME_FIELDS = new Set([
  "patient_name",
  "patient_name_p2",
  "print_name",
  "p3_print_name",
  "p1_print_name",
]);

const FIRST_NAME_FIELDS = new Set(["first_name"]);
const LAST_NAME_FIELDS = new Set(["last_name"]);
const MRN_FIELDS = new Set(["mrn", "patient_mrn"]);

/** Patient DOB only — not form_date, signature dates, insurance DOB, or procedure dates. */
const DOB_FIELDS = new Set(["dob", "dob_p2", "birthday", "p1_birthday"]);

/** Editable form/visit date fields (prefilled, user may change). */
const FORM_DATE_FIELDS = new Set(["form_date", "date_of_service", "visit_date"]);

function isEmpty(value: string | boolean | undefined) {
  if (typeof value === "boolean") return false;
  return !String(value ?? "").trim();
}

/** Clinic paper forms typically use US date layout (MM/DD/YYYY). */
export function formatPrefillDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (typeof value === "string") {
    const isoDay = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDay) return `${isoDay[2]}/${isoDay[3]}/${isoDay[1]}`;
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  // Date-only DOBs are stored as UTC midnight — use UTC parts to avoid day shift.
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

/** Apply patient name/MRN/DOB/form date to known fields without overwriting user-entered values. */
export function applyPatientNamePrefill(
  values: Record<string, string | boolean>,
  patient: PatientFormPrefill
): Record<string, string | boolean> {
  const display = patient.displayName.trim();
  const first = (patient.firstName ?? "").trim();
  const last = (patient.lastName ?? "").trim();
  const mrn = (patient.mrn ?? "").trim();
  const dob = formatPrefillDate(patient.dateOfBirth);
  const formDate = formatPrefillDate(patient.formDate);
  if (!display && !first && !last && !mrn && !dob && !formDate) return values;

  const next = { ...values };
  for (const name of Object.keys(next)) {
    if (!isEmpty(next[name])) continue;
    if (FULL_NAME_FIELDS.has(name) && display) {
      next[name] = display;
    } else if (FIRST_NAME_FIELDS.has(name) && first) {
      next[name] = first;
    } else if (LAST_NAME_FIELDS.has(name) && last) {
      next[name] = last;
    } else if (MRN_FIELDS.has(name) && mrn) {
      next[name] = mrn;
    } else if (DOB_FIELDS.has(name) && dob) {
      next[name] = dob;
    } else if (FORM_DATE_FIELDS.has(name) && formDate) {
      next[name] = formDate;
    }
  }
  return next;
}

/** Alias for clarity at call sites. */
export const applyPatientFormPrefill = applyPatientNamePrefill;
