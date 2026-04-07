/**
 * Mirrors MediAI `src/lib/onboarding-content.ts` for GET /onboarding/config.
 * Keep in sync when the marketing wizard copy changes.
 */

export const userRoleOptions = [
  {
    id: 'personal' as const,
    title: 'For Personal Health',
    description:
      "To understand and manage my or my family member's health conditions.",
  },
  {
    id: 'professional' as const,
    title: 'As a Health Professional',
    description:
      'To streamline workflows, save time, improve patient interaction and outcomes.',
  },
];

export const ethiopianRegions = [
  'Addis Ababa',
  'Afar',
  'Amhara',
  'Benishangul-Gumuz',
  'Dire Dawa',
  'Gambela',
  'Harari',
  'Jimma',
  'Bahir Dar',
  'Mekelle',
  'Hawassa',
  'Oromia',
  'Sidama',
  'Somali',
  'South West Ethiopia',
  'Southern Nations, Nationalities, and Peoples',
  'Tigray',
] as const;

/** For `class-validator` @IsIn — needs a mutable string array. */
export const ETHIOPIAN_REGIONS_LIST: string[] = [...ethiopianRegions];

export const onboardingStepLabels = [
  'Use Case',
  'Greeting',
  'Region',
  'Welcome',
  'General Information',
] as const;

export const measurementSystemOptions = [
  { id: 'imperial' as const, title: 'lbs/ft/in' },
  { id: 'metric' as const, title: 'kg/cm' },
];

export const sexOptions = [
  { id: 'male' as const, title: 'Male' },
  { id: 'female' as const, title: 'Female' },
  { id: 'other' as const, title: 'Other' },
];

export const featureOptions = [
  {
    id: 'ai-doctor' as const,
    title: 'Personal AI Doctor',
    description: 'Ask any health questions and get tailored insights.',
  },
  {
    id: 'lab-interpretation' as const,
    title: 'Lab Test Interpretation',
    description: 'Easily understand and interpret your lab test results.',
  },
  {
    id: 'top-doctors' as const,
    title: 'Consultation with Top Doctors',
    description: 'Access 350+ top doctors from the US and Ethiopia.',
  },
];

export const generalInformationSteps = [
  'Age',
  'Measurement system',
  'Sex assigned at birth',
] as const;

export function getOnboardingConfigSnapshot() {
  return {
    userRoleOptions,
    ethiopianRegions: [...ethiopianRegions],
    onboardingStepLabels: [...onboardingStepLabels],
    measurementSystemOptions,
    sexOptions,
    featureOptions,
    generalInformationSteps: [...generalInformationSteps],
  };
}
