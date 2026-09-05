/**
 * Mentor (o'quvchi app) API bu loyihada YO'Q. mentor-admin.ts faqat
 * parseGroups yordamchisini import qiladi — shu yerda saqlanadi.
 */
export function parseGroups(raw: string | null | undefined): Array<string> {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.map((g: any) => typeof g === "string" ? g : (g?.name || "")).filter(Boolean);
  } catch {
    return [];
  }
}
