/**
 * Static payload for GET /api/dashboard/config (MediAI `src/lib/dashboard-content.ts`).
 */
export const defaultDashboardProfile = {
  preferredName: 'Joe',
  age: '55',
  region: 'Addis Ababa',
  measurementSystem: 'imperial' as const,
  weight: '77',
  heightFeet: '5',
  heightInches: '6',
  heightCm: '',
  sexAtBirth: 'male' as const,
  preferredFeature: 'ai-doctor' as const,
};

export const dashboardCards = [
  {
    title: 'Chat With AI Doctor',
    description: '',
    href: '/dashboard/ai-doctor',
    accent: 'bot' as const,
  },
  {
    title: 'Lab Tests & Screening',
    description: '',
    href: '/dashboard/lab-test-interpretation',
    accent: 'lab' as const,
  },
  {
    title: 'Check Up Plan',
    description: 'Coming Soon',
    href: '#',
    accent: 'bot' as const,
    muted: true,
  },
  {
    title: 'Health Reports',
    description: 'Coming Soon',
    href: '#',
    accent: 'lab' as const,
    muted: true,
  },
] as const;

export const consultDoctorsCard = {
  title: 'Consult Top Doctors',
  description: 'Online Consultation with top Doctors from the US and Europe.',
  href: '/dashboard/top-doctors',
};

export const mainHealthInfoSections = [
  'General Information',
  'Medications',
  'Life patterns and Habits',
] as const;

export function getDashboardConfigSnapshot() {
  return {
    defaultDashboardProfile,
    dashboardCards: [...dashboardCards],
    consultDoctorsCard,
    mainHealthInfoSections: [...mainHealthInfoSections],
  };
}
