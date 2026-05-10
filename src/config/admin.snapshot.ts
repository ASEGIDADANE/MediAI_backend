/**
 * GET /api/admin/config — mirrors MediAI `src/lib/admin-content.ts` (key: statCards).
 */
export const adminStatCards = [
  {
    label: 'Total Users',
    value: '12,458',
    trend: 'up' as const,
    trendValue: '+12.5%',
  },
  {
    label: 'Active Doctors',
    value: '342',
    trend: 'up' as const,
    trendValue: '+8.2%',
  },
  {
    label: 'Active Subscriptions',
    value: '3,847',
    trend: 'up' as const,
    trendValue: '+15.3%',
  },
  {
    label: 'Monthly Revenue',
    value: '$24,580',
    trend: 'down' as const,
    trendValue: '-2.1%',
  },
];

export const adminUsers = [
  {
    id: 'usr-001',
    name: 'Joe Smith',
    email: 'joe@gmail.com',
    role: 'user' as const,
    status: 'active' as const,
    joinedAt: '12 Jan, 2025',
  },
  {
    id: 'usr-002',
    name: 'Sara Johnson',
    email: 'sara.j@gmail.com',
    role: 'user' as const,
    status: 'active' as const,
    joinedAt: '05 Feb, 2025',
  },
  {
    id: 'doc-001',
    name: 'Dr. Michael Chen',
    email: 'm.chen@hospital.org',
    role: 'doctor' as const,
    status: 'active' as const,
    joinedAt: '20 Dec, 2024',
    licenseStatus: 'verified' as const,
    specialty: 'Neurology',
  },
  {
    id: 'doc-002',
    name: 'Dr. Amina Tadesse',
    email: 'amina.t@medclinic.et',
    role: 'doctor' as const,
    status: 'pending' as const,
    joinedAt: '01 Mar, 2025',
    licenseStatus: 'pending' as const,
    specialty: 'Cardiology',
  },
  {
    id: 'usr-003',
    name: 'Christine Abebe',
    email: 'christine.a@gmail.com',
    role: 'user' as const,
    status: 'blocked' as const,
    joinedAt: '18 Nov, 2024',
  },
  {
    id: 'doc-003',
    name: 'Dr. Abel Kebede',
    email: 'abel.k@healthcenter.et',
    role: 'doctor' as const,
    status: 'active' as const,
    joinedAt: '14 Jan, 2025',
    licenseStatus: 'verified' as const,
    specialty: 'Dermatology',
  },
  {
    id: 'usr-004',
    name: 'Daniel Mekonnen',
    email: 'daniel.m@outlook.com',
    role: 'user' as const,
    status: 'active' as const,
    joinedAt: '22 Feb, 2025',
  },
  {
    id: 'doc-004',
    name: 'Dr. Helen Worku',
    email: 'helen.w@hospital.et',
    role: 'doctor' as const,
    status: 'pending' as const,
    joinedAt: '10 Mar, 2025',
    licenseStatus: 'pending' as const,
    specialty: 'Pediatrics',
  },
];

export const subscriptionPlans = [
  {
    id: 'plan-free',
    name: 'Free',
    monthlyPrice: '$0',
    yearlyPrice: '$0',
    subscriberCount: 8234,
  },
  {
    id: 'plan-lite',
    name: 'Lite',
    monthlyPrice: '$3.99',
    yearlyPrice: '$47.88',
    subscriberCount: 2891,
  },
  {
    id: 'plan-pro',
    name: 'Pro',
    monthlyPrice: '$7.99',
    yearlyPrice: '$95.88',
    subscriberCount: 956,
  },
];

export const adminTransactions = [
  {
    id: 'txn-001',
    userName: 'Joe Smith',
    plan: 'Lite',
    amount: '$3.99',
    date: '15 Apr, 2025',
    status: 'completed' as const,
  },
  {
    id: 'txn-002',
    userName: 'Sara Johnson',
    plan: 'Pro',
    amount: '$7.99',
    date: '14 Apr, 2025',
    status: 'completed' as const,
  },
  {
    id: 'txn-003',
    userName: 'Daniel Mekonnen',
    plan: 'Lite',
    amount: '$3.99',
    date: '13 Apr, 2025',
    status: 'pending' as const,
  },
  {
    id: 'txn-004',
    userName: 'Christine Abebe',
    plan: 'Pro',
    amount: '$7.99',
    date: '12 Apr, 2025',
    status: 'failed' as const,
  },
  {
    id: 'txn-005',
    userName: 'Abel Kebede',
    plan: 'Lite',
    amount: '$47.88',
    date: '11 Apr, 2025',
    status: 'completed' as const,
  },
  {
    id: 'txn-006',
    userName: 'Helen Worku',
    plan: 'Pro',
    amount: '$95.88',
    date: '10 Apr, 2025',
    status: 'completed' as const,
  },
];

export const recentActivity = [
  {
    id: 'act-001',
    description: 'New user Joe Smith signed up',
    timestamp: '2 hours ago',
    type: 'signup' as const,
  },
  {
    id: 'act-002',
    description: 'Dr. Michael Chen license verified',
    timestamp: '5 hours ago',
    type: 'verification' as const,
  },
  {
    id: 'act-003',
    description: 'Payment of $7.99 received from Sara Johnson',
    timestamp: '8 hours ago',
    type: 'payment' as const,
  },
  {
    id: 'act-004',
    description: 'Daniel Mekonnen upgraded to Lite plan',
    timestamp: '1 day ago',
    type: 'subscription' as const,
  },
  {
    id: 'act-005',
    description: 'Dr. Amina Tadesse submitted license for verification',
    timestamp: '1 day ago',
    type: 'verification' as const,
  },
  {
    id: 'act-006',
    description: 'Christine Abebe account blocked by admin',
    timestamp: '2 days ago',
    type: 'block' as const,
  },
];

export const monthlyGrowth = [
  { month: 'Oct', users: 8200 },
  { month: 'Nov', users: 9100 },
  { month: 'Dec', users: 9800 },
  { month: 'Jan', users: 10400 },
  { month: 'Feb', users: 11200 },
  { month: 'Mar', users: 12458 },
];

export const revenueSummary = {
  totalRevenue: '$124,580',
  activeSubscriptions: 3847,
  churnRate: '4.2%',
};

export function getAdminConfigSnapshot() {
  return {
    statCards: adminStatCards,
    users: adminUsers,
    subscriptionPlans,
    transactions: adminTransactions,
    recentActivity,
    monthlyGrowth,
    revenueSummary,
  };
}
