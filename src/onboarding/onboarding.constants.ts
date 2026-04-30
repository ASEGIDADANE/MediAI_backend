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

/** IDs align with MediAI `onboarding-content.ts` (Next GET /api/onboarding/config). */
export const featureOptions = [
  {
    id: 'ai-doctor' as const,
    title: 'Personal AI Doctor',
    description: 'Ask any health questions and get tailored insights.',
  },
  {
    id: 'top-doctors' as const,
    title: 'Consultation with Top Doctors',
    description: 'Access 350+ top doctors from the US and Ethiopia.',
  },
];

export const professionalTitleOptions = [
  { id: 'dr' as const, label: 'Dr.' },
  { id: 'prof' as const, label: 'Prof.' },
  { id: 'mr' as const, label: 'Mr.' },
  { id: 'ms' as const, label: 'Ms.' },
];

export const professionalSpecialtyOptions = [
  'Dermatology',
  'Oncology',
  'Neurosurgery',
  'Cardiology',
  'Pediatrics',
  'Internal Medicine',
  'General Surgery',
  'Obstetrics and Gynecology',
] as const;

export const professionalCompletionItems = [
  'Brainstorm with your AI assistant',
  'Get clinical insights and suggestions',
  'Upload lab results in seconds',
  'Receive AI Powered interpretations',
] as const;

export const smokingIntensityOptions = [
  'Non-smoker',
  '1-10 cigarettes',
  'About 1 pack',
  'More than 1 pack',
  'Electronic cigarettes/vaping',
] as const;

export const alcoholIntakeOptions = [
  'None',
  'Occasionally',
  '1-2 days per week',
  '3-5 days per week',
  'Daily',
] as const;

export const physicalActivityOptions = [
  'Inactive',
  'Lightly active',
  'Moderately active',
  'Very active',
] as const;

export const dietaryHabitOptions = [
  'Non-specific diet',
  'Balanced meals',
  'Frequent Fast Food',
  'Specific diet plan',
] as const;

export const sleepPatternOptions = [
  '7-9 hours',
  'Less than 6 hours',
  'More than 9 hours',
  'Varies significantly or interrupted sleep',
] as const;

export const stressLevelOptions = [
  'Rarely stressed',
  'Manageable stress',
  'Regular (daily) stress',
  'Almost always stressed',
] as const;

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
    professionalTitleOptions,
    professionalSpecialtyOptions: [...professionalSpecialtyOptions],
    professionalCompletionItems: [...professionalCompletionItems],
    smokingIntensityOptions: [...smokingIntensityOptions],
    alcoholIntakeOptions: [...alcoholIntakeOptions],
    physicalActivityOptions: [...physicalActivityOptions],
    dietaryHabitOptions: [...dietaryHabitOptions],
    sleepPatternOptions: [...sleepPatternOptions],
    stressLevelOptions: [...stressLevelOptions],
  };
}
