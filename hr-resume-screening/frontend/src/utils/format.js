/**
 * Display formatters.
 *
 * Every helper returns a caller-supplied fallback (default "Not provided")
 * instead of inventing a value, so a profile never implies data the resume did
 * not contain.
 */

export const NOT_PROVIDED = 'Not provided';

export const hasValue = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
};

export const orFallback = (value, fallback = NOT_PROVIDED) => (hasValue(value) ? value : fallback);

/** "13 Aug 2026" */
export const formatDate = (value, fallback = NOT_PROVIDED) => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** "13 Aug 2026, 14:05" */
export const formatDateTime = (value, fallback = NOT_PROVIDED) => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return `${formatDate(value)}, ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
};

/** "2 hours ago", "just now", "3 days ago" */
export const formatRelativeTime = (value, fallback = NOT_PROVIDED) => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 0) return formatDate(value);
  if (seconds < 60) return 'just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;

  return formatDate(value);
};

/** "4.2 yrs", "1 yr", "Fresher" for 0, fallback when unknown. */
export const formatExperience = (years, fallback = NOT_PROVIDED) => {
  if (years === null || years === undefined || Number.isNaN(Number(years))) return fallback;
  const value = Number(years);
  if (value === 0) return 'Fresher';
  return `${Number.isInteger(value) ? value : value.toFixed(1)} ${value === 1 ? 'yr' : 'yrs'}`;
};

/** "31 months" -> "2 yrs 7 mos" */
export const formatDuration = (months, fallback = '') => {
  if (months === null || months === undefined || Number.isNaN(Number(months))) return fallback;
  const total = Math.max(Math.round(Number(months)), 0);
  const years = Math.floor(total / 12);
  const remainder = total % 12;
  const parts = [];
  if (years > 0) parts.push(`${years} yr${years === 1 ? '' : 's'}`);
  if (remainder > 0) parts.push(`${remainder} mo${remainder === 1 ? '' : 's'}`);
  return parts.length ? parts.join(' ') : 'Less than a month';
};

/** Indian annual CTC in lakhs: 1800000 -> "₹18.0 LPA" */
export const formatSalary = (amount, currency = 'INR', fallback = NOT_PROVIDED) => {
  if (amount === null || amount === undefined || Number.isNaN(Number(amount))) return fallback;
  const value = Number(amount);
  if (currency === 'INR') {
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)} LPA`;
    return `₹${value.toLocaleString('en-IN')}`;
  }
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '';
  return `${symbol}${value.toLocaleString('en-US')}`;
};

/** "+919876543210" -> "+91 98765 43210" for readability. */
export const formatPhone = (phone, fallback = NOT_PROVIDED) => {
  if (!hasValue(phone)) return fallback;
  const raw = String(phone).trim();
  const digits = raw.replace(/\D/g, '');

  if (raw.startsWith('+91') && digits.length === 12) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return raw;
};

/** tel: value — digits and a single leading plus only. */
export const toTelHref = (phone) => {
  if (!hasValue(phone)) return null;
  const cleaned = String(phone).replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : null;
};

/** Strips the scheme and trailing slash for compact link display. */
export const formatUrlLabel = (url, maxLength = 42) => {
  if (!hasValue(url)) return NOT_PROVIDED;
  const label = String(url).replace(/^https?:\/\//i, '').replace(/\/$/, '');
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
};

/**
 * Only http(s) links are ever rendered as clickable. This blocks
 * javascript:/data: values that could arrive from a parsed resume.
 */
export const safeExternalUrl = (url) => {
  if (!hasValue(url)) return null;
  try {
    const parsed = new URL(String(url).trim());
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null;
  } catch {
    return null;
  }
};

/** "1811" -> "1.8 KB" */
export const formatFileSize = (bytes, fallback = NOT_PROVIDED) => {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) return fallback;
  const value = Number(bytes);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

/** Up to two initials for an avatar. */
export const getInitials = (name) => {
  if (!hasValue(name)) return '?';
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
};

/** Deterministic avatar tint derived from the name. */
export const getAvatarClasses = (name) => {
  const palettes = [
    'bg-brand-100 text-brand-800',
    'bg-emerald-100 text-emerald-800',
    'bg-violet-100 text-violet-800',
    'bg-amber-100 text-amber-800',
    'bg-rose-100 text-rose-800',
    'bg-sky-100 text-sky-800',
    'bg-teal-100 text-teal-800'
  ];
  const key = String(name || '?');
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) % 997;
  return palettes[hash % palettes.length];
};

/* --------------------------------------------------------- status metadata --- */

export const HR_STATUS_META = {
  REVIEW: { label: 'In Review', badge: 'badge-neutral', dot: 'bg-slate-400' },
  NEEDS_REVIEW: { label: 'Needs Review', badge: 'badge-warning', dot: 'bg-amber-500' },
  SHORTLISTED: { label: 'Shortlisted', badge: 'badge-success', dot: 'bg-emerald-500' },
  NOT_SUITABLE: { label: 'Not Suitable', badge: 'badge-danger', dot: 'bg-rose-500' },
  // The hiring outcome, distinct from Shortlisted: shortlisted means still under
  // consideration, selected means chosen for the vacancy.
  SELECTED: { label: 'Selected', badge: 'badge-selected', dot: 'bg-brand-600' }
};

export const getStatusMeta = (status) =>
  HR_STATUS_META[status] || { label: status || 'Unknown', badge: 'badge-neutral', dot: 'bg-slate-400' };

/** Match-score band used for badges and meters. */
export const getScoreMeta = (score) => {
  if (score === null || score === undefined || Number.isNaN(Number(score))) {
    return { label: 'Not scored', badge: 'badge-neutral', bar: 'bg-slate-300', text: 'text-slate-500' };
  }
  const value = Number(score);
  if (value >= 90) return { label: 'Excellent', badge: 'badge-success', bar: 'bg-emerald-500', text: 'text-emerald-700' };
  if (value >= 80) return { label: 'Strong', badge: 'badge-success', bar: 'bg-teal-500', text: 'text-teal-700' };
  if (value >= 70) return { label: 'Good', badge: 'badge-info', bar: 'bg-sky-500', text: 'text-sky-700' };
  if (value >= 60) return { label: 'Partial', badge: 'badge-warning', bar: 'bg-amber-500', text: 'text-amber-700' };
  return { label: 'Low', badge: 'badge-neutral', bar: 'bg-slate-400', text: 'text-slate-600' };
};

/**
 * Groups a flat skill list into families for display. A skill that does not map
 * to a known family is returned under "Other" rather than guessed at, and when
 * too few skills can be classified the caller is told to fall back to a plain
 * list (an incorrect grouping is worse than none).
 */
const SKILL_FAMILIES = [
  {
    name: 'Frontend',
    members: ['react', 'react.js', 'reactjs', 'angular', 'vue', 'vue.js', 'svelte', 'javascript', 'typescript',
      'html', 'html5', 'css', 'css3', 'sass', 'scss', 'tailwind', 'tailwind css', 'bootstrap', 'redux',
      'zustand', 'next.js', 'nextjs', 'jquery', 'webpack', 'vite', 'react native']
  },
  {
    name: 'Backend',
    members: ['node.js', 'node', 'nodejs', 'express', 'express.js', 'nestjs', 'django', 'flask', 'fastapi',
      'spring boot', 'spring', 'laravel', '.net', 'asp.net', 'rails', 'graphql', 'rest api', 'restful api',
      'microservices', 'grpc', 'kafka', 'rabbitmq']
  },
  {
    name: 'Languages',
    members: ['java', 'python', 'c++', 'c#', 'c', 'go', 'golang', 'rust', 'ruby', 'php', 'kotlin', 'swift',
      'scala', 'perl', 'r', 'matlab', 'dart']
  },
  {
    name: 'Databases',
    members: ['postgresql', 'postgres', 'mysql', 'mongodb', 'sqlite', 'redis', 'oracle', 'sql server',
      'mssql', 'dynamodb', 'cassandra', 'elasticsearch', 'firebase', 'supabase', 'prisma', 'sql']
  },
  {
    name: 'Cloud & DevOps',
    members: ['aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'terraform', 'ansible',
      'jenkins', 'ci/cd', 'github actions', 'gitlab ci', 'nginx', 'linux', 'serverless', 'lambda']
  },
  {
    name: 'Tools & Testing',
    members: ['git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence', 'jest', 'mocha', 'cypress',
      'playwright', 'selenium', 'junit', 'pytest', 'postman', 'figma', 'storybook', 'vitest']
  }
];

export const groupSkills = (skills = []) => {
  const list = (Array.isArray(skills) ? skills : []).filter(hasValue);
  if (!list.length) return { grouped: false, groups: [], skills: [] };

  const groups = new Map();
  const other = [];

  for (const skill of list) {
    const key = String(skill).trim().toLowerCase();
    const family = SKILL_FAMILIES.find((f) => f.members.includes(key));
    if (family) {
      if (!groups.has(family.name)) groups.set(family.name, []);
      groups.get(family.name).push(skill);
    } else {
      other.push(skill);
    }
  }

  const classified = list.length - other.length;
  // Below this ratio the grouping would be mostly "Other", which reads worse
  // than a single clean list.
  if (classified / list.length < 0.5) {
    return { grouped: false, groups: [], skills: list };
  }

  const ordered = SKILL_FAMILIES.filter((f) => groups.has(f.name)).map((f) => ({
    name: f.name,
    items: groups.get(f.name)
  }));

  if (other.length) ordered.push({ name: 'Other', items: other });

  return { grouped: true, groups: ordered, skills: list };
};
