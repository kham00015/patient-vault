import type { ClinicalFormTemplate } from "@/lib/clinical-forms";
import { ASTHMA_CONTROL_FORM } from "@/lib/forms/templates/asthma-control";
import { REFERRAL_MODERN_MEDICINE_FORM } from "@/lib/forms/templates/referral-modern-medicine";
import { NCCC_6MWT_FORM } from "@/lib/forms/templates/nccc-6mwt";
import { NCCC_ACT_FORM } from "@/lib/forms/templates/nccc-act";
import { NCCC_CAT_FORM } from "@/lib/forms/templates/nccc-cat";
import { NCCC_EPWORTH_FORM } from "@/lib/forms/templates/nccc-epworth";
import { NCCC_AUTH_RELEASE_FORM } from "@/lib/forms/templates/nccc-auth-release";
import { NCCC_MEDICAL_HISTORY_FORM } from "@/lib/forms/templates/nccc-medical-history";
import { NCCC_NOTICE_PRIVACY_FORM } from "@/lib/forms/templates/nccc-notice-privacy";
import { NCCC_REGISTRATION_FORM } from "@/lib/forms/templates/nccc-registration";
import { NCCC_PFT_QUESTIONNAIRE_FORM } from "@/lib/forms/templates/nccc-pft-questionnaire";
import { NCCC_BRONCHOSCOPY_INSTRUCTIONS_FORM } from "@/lib/forms/templates/nccc-bronchoscopy-instructions";

/** Central store of all clinic form templates. Add new forms here. */
export const FORM_REGISTRY: ClinicalFormTemplate[] = [
  ASTHMA_CONTROL_FORM,
  REFERRAL_MODERN_MEDICINE_FORM,
  NCCC_6MWT_FORM,
  NCCC_ACT_FORM,
  NCCC_CAT_FORM,
  NCCC_EPWORTH_FORM,
  NCCC_AUTH_RELEASE_FORM,
  NCCC_MEDICAL_HISTORY_FORM,
  NCCC_NOTICE_PRIVACY_FORM,
  NCCC_REGISTRATION_FORM,
  NCCC_PFT_QUESTIONNAIRE_FORM,
  NCCC_BRONCHOSCOPY_INSTRUCTIONS_FORM,
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
