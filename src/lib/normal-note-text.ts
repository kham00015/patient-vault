import type { NoteSectionKey } from "./note-content";

export const NORMAL_REVIEW_OF_SYSTEMS = `Constitutional: No fever, chills, night sweats, or unintentional weight loss.
Eyes: No vision changes, pain, or discharge.
ENT: No hearing loss, sore throat, nasal congestion, or dysphagia.
Cardiovascular: No chest pain, palpitations, orthopnea, PND, or leg swelling.
Respiratory: No shortness of breath, cough, wheezing, or hemoptysis.
Gastrointestinal: No nausea, vomiting, diarrhea, constipation, or abdominal pain.
Genitourinary: No dysuria, frequency, urgency, or hematuria.
Musculoskeletal: No joint pain, swelling, or stiffness.
Skin: No rash, itching, or lesions.
Neurological: No headache, dizziness, weakness, numbness, or tingling.
Psychiatric: No depression, anxiety, or sleep disturbance.
Endocrine: No heat or cold intolerance, polyuria, or polydipsia.
Hematologic/Lymphatic: No easy bruising, bleeding, or lymphadenopathy.
Allergic/Immunologic: No urticaria, angioedema, or frequent infections.`;

export const NORMAL_PHYSICAL_EXAM = `General: Well-appearing, no acute distress, conversant.
HEENT: Normocephalic, atraumatic. PERRLA. Conjunctivae clear. Oropharynx moist without erythema or exudate. TMs clear.
Neck: Supple, no JVD, lymphadenopathy, or thyromegaly.
Cardiovascular: Regular rate and rhythm, normal S1/S2, no murmurs, rubs, or gallops.
Respiratory: Normal respiratory effort. Lungs clear to auscultation bilaterally without wheezes, rales, or rhonchi.
Abdomen: Soft, non-tender, non-distended, normoactive bowel sounds, no organomegaly.
Extremities: No clubbing, cyanosis, or edema. Pulses intact.
Skin: Warm, dry, intact, no rashes or lesions.
Neurological: Alert and oriented. Cranial nerves II–XII grossly intact. Motor strength 5/5 throughout. Sensation intact to light touch.
Psychiatric: Normal mood and affect, appropriate thought content and process.`;

export function getNormalNoteText(key: NoteSectionKey): string | null {
  switch (key) {
    case "reviewOfSystems":
      return NORMAL_REVIEW_OF_SYSTEMS;
    case "physicalExam":
      return NORMAL_PHYSICAL_EXAM;
    default:
      return null;
  }
}
