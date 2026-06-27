/** Common clinical abbreviations → ICD-10 search phrases (NLM indexes full terms, not acronyms). */
export const ICD10_SEARCH_ALIASES: Record<string, string> = {
  copd: "chronic obstructive pulmonary",
  chf: "heart failure",
  htn: "hypertension",
  dm: "diabetes mellitus",
  t2dm: "type 2 diabetes",
  t1dm: "type 1 diabetes",
  afib: "atrial fibrillation",
  aflutter: "atrial flutter",
  mi: "myocardial infarction",
  ckd: "chronic kidney disease",
  gerd: "gastroesophageal reflux",
  oa: "osteoarthritis",
  ra: "rheumatoid arthritis",
  dvt: "deep vein thrombosis",
  pe: "pulmonary embolism",
  pna: "pneumonia",
  cap: "community acquired pneumonia",
  ipf: "idiopathic pulmonary fibrosis",
  ild: "interstitial lung disease",
  osa: "obstructive sleep apnea",
  asthma: "asthma",
  bronchiectasis: "bronchiectasis",
  sarcoidosis: "sarcoidosis",
  tb: "tuberculosis",
  uti: "urinary tract infection",
  cva: "cerebral infarction",
  tia: "transient cerebral ischemic",
  pad: "peripheral arterial disease",
  cad: "coronary artery disease",
  af: "atrial fibrillation",
};

export function expandIcd10SearchTerms(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const key = trimmed.toLowerCase();
  const alias = ICD10_SEARCH_ALIASES[key];
  const terms = [trimmed];
  if (alias && alias.toLowerCase() !== key) {
    terms.push(alias);
  }
  return [...new Set(terms)];
}

export function getIcd10AliasHint(query: string): string | null {
  const key = query.trim().toLowerCase();
  return ICD10_SEARCH_ALIASES[key] ?? null;
}
