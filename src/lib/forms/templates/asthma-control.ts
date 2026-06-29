import type { ClinicalFormTemplate } from "@/lib/clinical-forms";

function actScore(responses: Record<string, string>) {
  const keys = ["q1", "q2", "q3", "q4", "q5"];
  if (!keys.every((k) => responses[k])) return null;
  const score = keys.reduce((sum, k) => sum + Number(responses[k]), 0);
  let interpretation: string;
  if (score >= 20) interpretation = "Well controlled";
  else if (score >= 16) interpretation = "Not well controlled";
  else interpretation = "Very poorly controlled";
  return {
    score,
    interpretation,
    summary: `ACT score ${score}/25 — ${interpretation}`,
  };
}

export const ASTHMA_CONTROL_FORM: ClinicalFormTemplate = {
  id: "ASTHMA_CONTROL",
  label: "Asthma Control Test (ACT)",
  description: "Validated 5-question asthma control questionnaire. Score 5–25; 20+ is well controlled.",
  category: "Pulmonary",
  tags: ["asthma", "pulmonary", "respiratory"],
  requiresPatientSignature: true,
  fields: [
    {
      id: "q1",
      label: "In the past 4 weeks, how much of the time did your asthma keep you from getting as much done at work, school, or at home?",
      type: "scale",
      display: "score-chips",
      required: true,
      options: [
        { value: "1", label: "All of the time" },
        { value: "2", label: "Most of the time" },
        { value: "3", label: "Some of the time" },
        { value: "4", label: "A little of the time" },
        { value: "5", label: "None of the time" },
      ],
    },
    {
      id: "q2",
      label: "During the past 4 weeks, how often have you had shortness of breath?",
      type: "scale",
      display: "score-chips",
      required: true,
      options: [
        { value: "1", label: "More than once a day" },
        { value: "2", label: "Once a day" },
        { value: "3", label: "3 to 6 times a week" },
        { value: "4", label: "Once or twice a week" },
        { value: "5", label: "Not at all" },
      ],
    },
    {
      id: "q3",
      label: "During the past 4 weeks, how often did your asthma symptoms wake you up at night or earlier than usual in the morning?",
      type: "scale",
      display: "score-chips",
      required: true,
      options: [
        { value: "1", label: "4 or more nights a week" },
        { value: "2", label: "2 to 3 nights a week" },
        { value: "3", label: "Once a week" },
        { value: "4", label: "Once or twice" },
        { value: "5", label: "Not at all" },
      ],
    },
    {
      id: "q4",
      label: "During the past 4 weeks, how often have you used your rescue inhaler?",
      type: "scale",
      display: "score-chips",
      required: true,
      options: [
        { value: "1", label: "3 or more times per day" },
        { value: "2", label: "1 or 2 times per day" },
        { value: "3", label: "2 or 3 times per week" },
        { value: "4", label: "Once a week or less" },
        { value: "5", label: "Not at all" },
      ],
    },
    {
      id: "q5",
      label: "How would you rate your asthma control during the past 4 weeks?",
      type: "scale",
      display: "score-chips",
      required: true,
      options: [
        { value: "1", label: "Not controlled at all" },
        { value: "2", label: "Poorly controlled" },
        { value: "3", label: "Somewhat controlled" },
        { value: "4", label: "Well controlled" },
        { value: "5", label: "Completely controlled" },
      ],
    },
  ],
  scoreResponses: actScore,
};
