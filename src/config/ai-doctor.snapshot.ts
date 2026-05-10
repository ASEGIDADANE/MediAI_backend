/**
 * GET /api/ai-doctor/config — mirrors MediAI `src/lib/ai-doctor-content.ts`.
 *
 * The label strings here MUST match the canonical option arrays the medical
 * history page uses (`chronicDiseaseOptions`, `allergyOptions`, etc. in
 * MediAI `src/lib/dashboard-content.ts`). Both flows persist into the same
 * `UserProfile.medicalHistory` JSON document, so a value picked in the wizard
 * has to match a chip on the page (and vice versa) for round-trips to work.
 */

const chronicDiseaseOptions = [
  'Diabetes',
  'Hypertension',
  'Cardiovascular Disease',
  'Thyroid Disorder',
  'Asthma / COPD',
  'Arthritis',
  'Cancer',
  'Kidney Disease',
];

const familyHistoryOptions = [
  'Heart Disease',
  'Diabetes',
  'Cancer',
  'Osteoporosis',
  'Stroke',
  'Mental Illness',
  'Asthma / Allergies',
];

const allergyOptions = [
  'Penicillin',
  'Sulfa Drugs',
  'Peanuts',
  'Dairy / Lactose',
  'Shellfish',
  'Pollen',
  'Latex',
  'Insect Stings',
];

const smokingOptions = [
  'Non-smoker',
  '1-10 Cigarettes/day',
  'About 1 pack/day',
  'More than 1 pack/day',
  'E-Cigarettes / Vaping',
];

const alcoholOptions = [
  'Non-drinker',
  '1-3 drinks/week',
  '4-7 drinks/week',
  '8-14 drinks/week',
  '15+ drinks/week',
];

const dietOptions = [
  'Non-specific diet',
  'Balanced Meals',
  'Frequent Fast Food',
  'Vegetarian / Vegan',
  'Specific Diet Plan (keto, high-protein, etc.)',
];

const sleepOptions = [
  'Less than 6 hours',
  '7-9 hours',
  'More than 9 hours',
  'Varies / Interrupted',
];

const stressOptions = [
  'Rarely Stressed',
  'Manageable Stress',
  'Regular (daily) Stress',
  'Almost Always Stressed',
];

const toChoiceOptions = (labels: string[]) =>
  labels.map((label) => ({ label }));

export const aiDoctorBenefits = [
  'Complete your health Profile',
  'Ask any health-related questions',
  'Get actionable insights tailored to your unique health needs',
] as const;

export const medicalHistoryTotalSteps = 12;

export const medicalHistorySteps = [
  {
    id: 'chronic-past-health-conditions',
    title: 'Chronic and Past Health Conditions',
    description:
      'Include any chronic conditions or medical issues experienced. Essential for understanding health history and personalized care.',
    sectionTitle: 'Medical History',
    stepKind: 'yes-no-checklist',
    options: chronicDiseaseOptions,
    placeholder: 'e.g. diabetes, high blood pressure, heart attack 2 years ago',
  },
  {
    id: 'family-health-history',
    title: 'Family health history',
    description:
      'List any chronic diseases present in your family history. This will help us indicate the genetic risks.',
    sectionTitle: 'Medical History',
    stepKind: 'yes-no-checklist',
    options: familyHistoryOptions,
    placeholder:
      'e.g. Mother with diabetes, father had heart disease, sibling with asthma',
  },
  {
    id: 'known-allergies',
    title: 'Known Allergies',
    description: 'List any allergies you have.',
    sectionTitle: 'Medical History',
    stepKind: 'yes-no-checklist',
    options: allergyOptions,
    placeholder:
      'e.g. Peanut allergy, Penicillin allergy, tree and grass pollen',
  },
  {
    id: 'surgical-history',
    title: 'Surgical History',
    description: 'List any major surgeries you have undergone.',
    sectionTitle: 'Medical History',
    stepKind: 'yes-no-text',
    placeholder: 'e.g. cardiac stenting in 2019, appendectomy in 2003.',
  },
  {
    id: 'current-medications',
    title: 'Current medications?',
    description: 'List any medications you are currently taking.',
    sectionTitle: 'Medical History',
    stepKind: 'yes-no-text',
    placeholder: 'e.g. insulin injections, antibiotics',
  },
  {
    id: 'medications-history',
    title: 'Medications History (last 6 months)',
    description:
      'List any medications, supplements, or herbal remedies taken in the last 6 months',
    sectionTitle: 'Medical History',
    stepKind: 'yes-no-text',
    placeholder: 'e.g. insulin injections, antibiotics',
  },
  {
    id: 'daily-smoking-intensity',
    title: 'Daily smoking intensity',
    description: '',
    sectionTitle: 'Life Patterns & Habits',
    stepKind: 'choice-list',
    choiceOptions: toChoiceOptions(smokingOptions),
  },
  {
    id: 'weekly-alcohol-intake',
    title: 'Weekly Alcohol intake',
    description:
      'A standard drink is equivalent to a regular can or bottle of beer, a typical serving (glass) of wine, or a shot of distilled spirits.',
    sectionTitle: 'Life Patterns & Habits',
    stepKind: 'choice-list',
    choiceOptions: toChoiceOptions(alcoholOptions),
  },
  {
    id: 'dietary-habits',
    title: 'Dietary Habits',
    description: '',
    sectionTitle: 'Life Patterns & Habits',
    stepKind: 'choice-list',
    choiceOptions: toChoiceOptions(dietOptions),
  },
  {
    id: 'weekly-activity-level',
    title: 'Weekly Activity Level',
    description: '',
    sectionTitle: 'Life Patterns & Habits',
    stepKind: 'choice-list',
    choiceOptions: [
      {
        label: 'Inactive',
        description: 'No regular physical activity or structured exercise',
      },
      {
        label: 'Lightly Active',
        description:
          'Light physical activities such as walking or leisurely cycling',
      },
      {
        label: 'Moderately Active',
        description:
          'Regular moderate exercises like running, swimming, or playing sports',
      },
      {
        label: 'Very Active',
        description: 'Frequent intense exercises and sports training',
      },
    ],
  },
  {
    id: 'daily-sleep-pattern',
    title: 'Daily sleep pattern',
    description: '',
    sectionTitle: 'Life Patterns & Habits',
    stepKind: 'choice-list',
    choiceOptions: toChoiceOptions(sleepOptions),
  },
  {
    id: 'stress-level',
    title: 'Stress level',
    description: '',
    sectionTitle: 'Life Patterns & Habits',
    stepKind: 'choice-list',
    choiceOptions: toChoiceOptions(stressOptions),
  },
];

export function getAiDoctorConfigSnapshot() {
  return {
    aiDoctorBenefits: [...aiDoctorBenefits],
    medicalHistorySteps,
    medicalHistoryTotalSteps,
  };
}
