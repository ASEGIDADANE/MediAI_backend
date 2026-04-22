/**
 * GET /api/ai-doctor/config — mirrors MediAI `src/lib/ai-doctor-content.ts`.
 */
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
    options: ['Diabetes', 'HyperTension', 'Cardiovascular diseases', 'Thyroid disorders'],
    placeholder: 'e.g. diabetes, high blood pressure, heart attack 2 years ago',
  },
  {
    id: 'family-health-history',
    title: 'Family health history',
    description:
      'List any chronic diseases present in your family history. This will help us indicate the genetic risks.',
    sectionTitle: 'Medical History',
    stepKind: 'yes-no-checklist',
    options: ['Heart Diseases', 'Diabetes', 'Cancer', 'Osteoporosis'],
    placeholder:
      'e.g. Mother with diabetes, father had heart disease, sibling with asthma',
  },
  {
    id: 'known-allergies',
    title: 'Known Allergies',
    description: 'List any allergies you have.',
    sectionTitle: 'Medical History',
    stepKind: 'yes-no-checklist',
    options: ['Soy', 'Dairy/Lactose', 'Fish/Shellfish'],
    placeholder: 'e.g. Peanut allergy, Penicillin allergy, tree and grass pollen',
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
    choiceOptions: [
      { label: 'Non-smoker' },
      { label: '1-10 Cigarettes' },
      { label: 'About 1 pack' },
      { label: 'More than 1 pack' },
      { label: 'Electronic Cigarettes/Vaping' },
    ],
  },
  {
    id: 'weekly-alcohol-intake',
    title: 'Weekly Alcohol intake',
    description:
      'A standard drink is equivalent to a regular can or bottle of beer, a typical serving (glass) of wine, or a short of distilled spirits.',
    sectionTitle: 'Life Patterns & Habits',
    stepKind: 'choice-list',
    choiceOptions: [
      { label: 'Non-drinker' },
      { label: '1-3 standard drinks' },
      { label: '4-7 standard drinks' },
      { label: '8-14 standard drinks' },
      { label: '15+ standard drinks' },
    ],
  },
  {
    id: 'dietary-habits',
    title: 'Dietary Habits',
    description: '',
    sectionTitle: 'Life Patterns & Habits',
    stepKind: 'choice-list',
    choiceOptions: [
      { label: 'Non-specific diet' },
      { label: 'Balanced Meals' },
      { label: 'Frequent Fast Food' },
      {
        label: 'Specific diet Plan',
        description: 'A particular diet plan (e.g. keto, high-protein, vegan)',
      },
    ],
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
        description: 'No Regular physical activity or structured exercise',
      },
      {
        label: 'Lightly active',
        description: 'Light Physical activities such as walking or leisurely cycling',
      },
      {
        label: 'Moderately active',
        description: 'Regular moderate exercises like running, swimming, or playing sports',
      },
      {
        label: 'Very active',
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
    choiceOptions: [
      { label: '7-9 hours' },
      { label: 'less than 6 hours' },
      { label: 'More than 9 hours' },
      { label: 'Varies significantly or interrupted sleep' },
    ],
  },
  {
    id: 'stress-level',
    title: 'Stress level',
    description: '',
    sectionTitle: 'Life Patterns & Habits',
    stepKind: 'choice-list',
    choiceOptions: [
      { label: 'Rarely Stressed' },
      { label: 'Manageable stress' },
      { label: 'Regular (daily) stress' },
      { label: 'Almost always stressed' },
    ],
  },
];

export function getAiDoctorConfigSnapshot() {
  return {
    aiDoctorBenefits: [...aiDoctorBenefits],
    medicalHistorySteps,
    medicalHistoryTotalSteps,
  };
}
