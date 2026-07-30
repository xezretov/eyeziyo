/**
 * HEMIS API client — thin wrapper over the HEMIS "Backend API" (/v1/data/*)
 * and the SSO verify endpoint.
 *
 * Auth: the Backend API uses a per-university bearer token issued by the
 * university's HEMIS admin ("integration token"). It is a plain opaque token,
 * NOT a JWT. SSO verify instead takes a shared `secret` in the request body.
 *
 * Config comes from the environment:
 *   HEMIS_BASE_URL   (var)    e.g. https://student.atmu.uz/rest  (no trailing slash)
 *   HEMIS_API_TOKEN  (secret) Backend API bearer token
 *   HEMIS_SSO_SECRET (secret) SSO "maxfiy kalit"
 */

export interface HemisEnv {
  HEMIS_BASE_URL?: string;
  HEMIS_API_TOKEN?: string;
  HEMIS_SSO_SECRET?: string;
}

const DEFAULT_BASE_URL = "https://student.atmu.uz/rest";
const PAGE_LIMIT = 200; // HEMIS max items per page
const MAX_PAGES = 500; // hard safety cap to avoid runaway pagination

export function hemisConfigured(env: HemisEnv): boolean {
  return !!(env.HEMIS_API_TOKEN && env.HEMIS_API_TOKEN.trim());
}

export function ssoConfigured(env: HemisEnv): boolean {
  return !!(env.HEMIS_SSO_SECRET && env.HEMIS_SSO_SECRET.trim());
}

function baseUrl(env: HemisEnv): string {
  return (env.HEMIS_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
}

export class HemisError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "HemisError";
    this.status = status;
  }
}

/** HEMIS envelope for /v1/data/* list endpoints. */
interface HemisListEnvelope<T> {
  success: boolean;
  error: string | null;
  code: number;
  data: {
    items: T[];
    pagination?: {
      totalCount: number;
      pageSize: number;
      pageCount: number;
      page: number;
    };
  };
}

interface HemisPage<T> {
  items: T[];
  totalCount: number;
  pageCount: number;
  page: number;
}

/** Fetch a single page from a /v1/data/* list endpoint. */
export async function hemisFetchPage<T>(
  env: HemisEnv,
  path: string,
  params: Record<string, string | number> = {},
  page = 1,
  limit = PAGE_LIMIT
): Promise<HemisPage<T>> {
  if (!hemisConfigured(env)) {
    throw new HemisError("HEMIS_API_TOKEN sozlanmagan", 503);
  }
  const url = new URL(`${baseUrl(env)}/${path.replace(/^\/+/, "")}`);
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(limit));
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }

  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${env.HEMIS_API_TOKEN}`,
      Accept: "application/json",
    },
  });

  if (resp.status === 401) {
    throw new HemisError("HEMIS token yaroqsiz yoki muddati o'tgan", 401);
  }
  if (!resp.ok) {
    throw new HemisError(`HEMIS so'rovi muvaffaqiyatsiz (${resp.status})`, 502);
  }

  const body = (await resp.json()) as HemisListEnvelope<T>;
  if (!body.success) {
    throw new HemisError(body.error || "HEMIS xatosi", 502);
  }
  const items = body.data?.items || [];
  const pg = body.data?.pagination;
  return {
    items,
    totalCount: pg?.totalCount ?? items.length,
    pageCount: pg?.pageCount ?? 1,
    page: pg?.page ?? page,
  };
}

/**
 * Fetch every page of a /v1/data/* endpoint and return the concatenated items.
 * Use only for small collections (departments, specialties, subjects, groups,
 * teachers). For large ones (students, schedule) drive pagination yourself.
 */
export async function hemisFetchAll<T>(
  env: HemisEnv,
  path: string,
  params: Record<string, string | number> = {}
): Promise<T[]> {
  const first = await hemisFetchPage<T>(env, path, params, 1);
  const out = [...first.items];
  const pages = Math.min(first.pageCount, MAX_PAGES);
  for (let p = 2; p <= pages; p++) {
    const next = await hemisFetchPage<T>(env, path, params, p);
    out.push(...next.items);
  }
  return out;
}

/** SSO token verification result (student identity). */
export interface HemisSsoStudent {
  student_id: number;
  pinfl: string;
  student_id_number: string;
  first_name: string;
  second_name: string;
  third_name: string;
  email?: string;
  phone?: string;
  group?: string;
  university_code?: string;
}

/**
 * Verify an SSO token that HEMIS handed to the registered return URL
 * (admin.eyeziyo.uz). Returns the resolved student identity, or throws.
 */
export async function hemisVerifySso(env: HemisEnv, token: string): Promise<HemisSsoStudent> {
  if (!ssoConfigured(env)) {
    throw new HemisError("HEMIS_SSO_SECRET sozlanmagan", 503);
  }
  const resp = await fetch(`${baseUrl(env)}/v1/sso/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ token, secret: env.HEMIS_SSO_SECRET }),
  });
  if (!resp.ok) {
    throw new HemisError(`SSO tekshiruvi muvaffaqiyatsiz (${resp.status})`, 401);
  }
  const body = (await resp.json()) as {
    success?: boolean;
    error?: string | null;
    student?: HemisSsoStudent;
    data?: { success?: boolean; student?: HemisSsoStudent } & Partial<HemisSsoStudent>;
  };
  // Tolerate the response shapes HEMIS may use: { data: { student } },
  // { data: <student> }, or { student } at the top level.
  const student: HemisSsoStudent | undefined =
    body.data?.student ??
    body.student ??
    (body.data && (body.data as any).pinfl ? (body.data as HemisSsoStudent) : undefined);
  if (body.success === false || !student?.pinfl) {
    throw new HemisError(body.error || "SSO token yaroqsiz", 401);
  }
  return student;
}

// ── HEMIS entity shapes (only the fields we consume) ──

export interface HemisClassifier {
  code: string;
  name: string;
}

export interface HemisDepartment {
  id: number;
  name: string;
  code: string;
  parent: number | null;
  active: boolean;
  structureType?: HemisClassifier;
  localityType?: HemisClassifier;
}

export interface HemisSpecialty {
  id: number;
  name: string;
  code: string;
  active?: boolean;
  department?: HemisDepartment;
  educationType?: HemisClassifier;
}

export interface HemisSubject {
  id: number;
  name: string;
  code: string;
  active?: boolean;
  subjectGroup?: { code: string; name: string };
  educationType?: HemisClassifier;
}

export interface HemisGroup {
  id: number;
  name: string;
  active?: boolean;
  educationLang?: HemisClassifier;
  department?: HemisDepartment;
  specialty?: HemisSpecialty;
  _curriculum?: number;
}

export interface HemisEmployee {
  id: number;
  full_name: string;
  short_name?: string;
  first_name?: string;
  second_name?: string;
  third_name?: string;
  employee_id_number?: string | number;
  image_full?: string;
  department?: HemisDepartment;
  staffPosition?: HemisClassifier;
  active?: boolean;
}

export interface HemisStudent {
  id: number;
  full_name: string;
  short_name?: string;
  first_name?: string;
  second_name?: string;
  third_name?: string;
  student_id_number: string;
  image_full?: string;
  department?: HemisDepartment;
  specialty?: HemisSpecialty;
  group?: { id: number; name: string };
  level?: HemisClassifier;
  studentStatus?: HemisClassifier;
}

export interface HemisAuditorium {
  code: number;
  name: string;
  auditoriumType?: HemisClassifier;
  building?: { id: number; name: string };
  volume?: number;
  active?: boolean;
}

export interface HemisCurriculumSubjectTeacher {
  id: number;
  _group?: number;
  _semester?: number;
  subject?: { id: number; code?: string; name?: string };
  employee?: { id: number; name?: string };
  active?: boolean;
}

export { PAGE_LIMIT };
