import type { ClinicalFormTemplate } from "@/lib/clinical-forms";
import { ASTHMA_CONTROL_FORM } from "@/lib/forms/templates/asthma-control";
import { REFERRAL_MODERN_MEDICINE_FORM } from "@/lib/forms/templates/referral-modern-medicine";

/** Central store of all clinic form templates. Add new forms here. */
export const FORM_REGISTRY: ClinicalFormTemplate[] = [
  ASTHMA_CONTROL_FORM,
  REFERRAL_MODERN_MEDICINE_FORM,
];

const registryMap = new Map(FORM_REGISTRY.map((t) => [t.id, t]));

export function getFormFromRegistry(templateId: string) {
  return registryMap.get(templateId);
}

/** Forms offered for a clinic. Templates without officeCodes are shared. */
export function listFormRegistry(officeCode?: string | null) {
  return FORM_REGISTRY.filter((t) => {
    if (!t.officeCodes?.length) return true;
    if (!officeCode) return false;
    return t.officeCodes.includes(officeCode);
  });
}
