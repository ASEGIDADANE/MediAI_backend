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
    title: 'Messages With Doctors',
    description: 'Chat directly with doctors who reach out to you.',
    href: '/dashboard/messages',
    accent: 'messages' as const,
  },
  {
    title: 'Find Nearby Facilities',
    description: 'Locate verified hospitals, clinics, and pharmacies near you.',
    href: '/dashboard/facility-locator',
    accent: 'facilities' as const,
  },
  {
    // Keep placeholder hrefs unique — the frontend's
    // `mergeDashboardConfigWithFallback` keys cards by `href`, so two
    // placeholders sharing `#` would collapse into one slot and render
    // the same card twice (root cause of the duplicate Health Reports tile).
    title: 'Check Up Plan',
    description: 'Coming Soon',
    href: '#check-up-plan',
    accent: 'bot' as const,
    muted: true,
  },
  {
    title: 'Health Reports',
    description: 'Coming Soon',
    href: '#health-reports',
    accent: 'facilities' as const,
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
