/**
 * GET /api/landing — mirrors MediAI `src/lib/landing-content.ts`.
 */
export const navItems = [
  {
    label: 'Solutions',
    href: '/#solutions',
    icon: 'chevronDown',
    items: [
      {
        label: 'AI Doctor',
        href: '/dashboard/ai-doctor',
        icon: 'brainCircuit',
      },
      {
        label: 'Find Nearby Facilities',
        href: '/dashboard/facility-locator',
        icon: 'heartPulse',
      },
      {
        label: 'Second Opinion',
        href: '/dashboard/top-doctors',
        icon: 'userRoundSearch',
      },
    ],
  },
  { label: 'Pricing', href: '/pricing' },
  {
    label: 'Resources',
    href: '/#resources',
    icon: 'chevronDown',
    items: [
      { label: 'Blog', href: '/blog' },
      { label: 'Symptom Guide', href: '/symptom-guide' },
      { label: 'Knowledge Base', href: '/knowledge-base' },
      { label: 'Glossary', href: '/glossary' },
    ],
  },
];

export const benefitItems = [
  {
    title: 'Personalized Health Insights',
    description:
      'Get AI-powered virtual health assistance tailored to your medical history and symptoms.',
    icon: 'heartPulse',
  },
  {
    title: 'Expert Second Opinions',
    description:
      'Validate your health insights with top US and European doctors to make more confident health decisions.',
    icon: 'globe2',
  },
  {
    title: '24/7 Accessibility',
    description:
      'Access your AI health assistant anytime, anywhere, and in your native language.',
    icon: 'languages',
  },
];

export const showcaseItems = [
  {
    key: 'insights',
    title: 'Personalized Health Insights',
    description:
      'Get AI-powered virtual health assistance tailored to your medical history and symptoms.',
    ctaLabel: 'Chat With AI Doctor',
    href: '/dashboard/ai-doctor',
  },
  {
    key: 'symptoms',
    title: 'AI Symptom Checker',
    description:
      'Describe your symptoms in everyday language and get instant AI-powered insights into possible conditions, plus personalized recommendations on what to do next.',
    ctaLabel: 'Check My Symptoms',
    href: '/symptom-guide',
  },
  {
    key: 'opinions',
    title: 'Expert Second Opinions',
    description:
      'Get the confidence to move forward with your local doctor by validating your diagnosis or treatment strategy with a top medical expert from the US or Europe.',
    ctaLabel: 'Get Second Opinion',
    href: '/dashboard/top-doctors',
    reverse: true,
  },
];

export const securityItems = [
  {
    title: 'Personally identifiable information is optional',
    description:
      'You can use the platform without sharing unnecessary personal details, which helps patients stay in control of their privacy.',
    icon: 'userRoundSearch',
  },
  {
    title: 'Protected by enterprise-grade security',
    description:
      'All data is protected by advanced security controls and aligned with HIPAA, GDPR, and SOC 2 expectations.',
    icon: 'shieldCheck',
  },
  {
    title: 'Guidance, not a replacement for clinicians',
    description:
      'The platform is designed to support informed decisions, not replace professional diagnosis, treatment, or emergency care.',
    icon: 'stethoscope',
  },
];

export const testimonialItems = [
  {
    quote:
      'Dealing with health anxiety used to send me into a spiral. MediAI gives me concise guidance, explains my results clearly, and helps me know when to seek professional help.',
    name: 'Alex T.',
    role: 'Patient',
  },
  {
    quote:
      'The symptom summaries are easy to understand and make follow-up visits more productive. It feels like having a calm assistant before every appointment.',
    name: 'Meron A.',
    role: 'Parent',
  },
  {
    quote:
      'What stands out most is the clarity. I can upload my results, ask questions in simple language, and get responses that actually help me prepare for the next step.',
    name: 'Samuel K.',
    role: 'User',
  },
];

export const faqItems = [
  {
    question: 'Can I use this app before going to a health center or hospital?',
    answer:
      'Yes. MediAI can help you organize symptoms, understand possible next steps, and prepare better questions before you see a clinician.',
  },
  {
    question: 'Is this app a replacement for a doctor or only for guidance?',
    answer:
      'It is for guidance only. The platform supports patients with education and triage-like insights, but it does not replace licensed medical care.',
  },
  {
    question: 'Who can use this platform, patients only or also clinicians?',
    answer:
      'The landing page is designed primarily for patients, but parts of the platform can also support clinicians and care teams.',
  },
];

export const footerColumns = [
  {
    title: 'Patient Product',
    links: [
      { label: 'AI Health Assistant', href: '/onboarding' },
      { label: 'AI Doctor', href: '/dashboard/ai-doctor' },
      { label: 'Find Nearby Facilities', href: '/dashboard/facility-locator' },
      { label: 'Symptom Checker', href: '/symptom-guide' },
      { label: 'Second Opinion', href: '/dashboard/top-doctors' },
    ],
  },
  {
    title: 'Professional Solutions',
    links: [{ label: 'Doctor Platform', href: '/dashboard' }],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'Knowledge Base', href: '/knowledge-base' },
      { label: 'Symptom Guide', href: '/symptom-guide' },
      { label: 'Glossary', href: '/glossary' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Us', href: '/#about' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Contact', href: '/#contact' },
      { label: 'Glossary', href: '/glossary' },
    ],
  },
];

export const heroHighlights = [
  { icon: 'brainCircuit', label: 'AI symptom guidance' },
  { icon: 'stethoscope', label: 'Patient care support' },
  { icon: 'heartHandshake', label: 'Second opinions' },
];

export function getLandingConfigSnapshot() {
  return {
    navItems,
    heroHighlights,
    benefitItems,
    showcaseItems,
    securityItems,
    testimonialItems,
    faqItems,
    footerColumns,
  };
}
