/**
 * Audio manbalar (xonalar). Admin-web "Xonalar" sahifasi /api/admin/auditoriums
 * ni kutadi — biz audiotap manbalarini o'sha shaklda qaytaramiz va tahrirlash
 * imkonini beramiz (eyeziyo'da HEMIS'dan kelardi, bu yerda audiotap'dan).
 */
import { Env, json, err } from "./types";

export async function listSources(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT s.*, COUNT(r.id) AS recording_count, MAX(r.created_at) AS last_seen
       FROM sources s LEFT JOIN recordings r ON r.source_id = s.id
      GROUP BY s.id ORDER BY s.display_name`
  ).all();
  return json({ items: rows.results });
}

/** admin-web "Xonalar" formati: name, building_name, type_name, volume, active + audiotap maydonlari. */
export async function listAuditoriums(env: Env): Promise<Response> {
  const rows = await env.DB.prepare(
    `SELECT s.*, COUNT(r.id) AS recording_count, MAX(r.created_at) AS last_seen
       FROM sources s LEFT JOIN recordings r ON r.source_id = s.id
      GROUP BY s.id ORDER BY s.display_name`
  ).all();
  return json((rows.results as any[]).map((s) => ({
    id: s.id,
    name: s.display_name || s.audiotap_name,
    building_name: s.building || "",
    type_name: s.room ? `Xona ${s.room}` : "Audiotap mikrofoni",
    volume: 0,
    active: s.active,
    audiotap_name: s.audiotap_name,
    display_name: s.display_name,
    building: s.building,
    room: s.room,
    recording_count: s.recording_count || 0,
    last_seen: s.last_seen || null,
  })));
}

export async function updateSource(request: Request, env: Env, id: number): Promise<Response> {
  const b: any = await request.json().catch(() => ({}));
  const r = await env.DB.prepare(
    `UPDATE sources SET
       display_name = COALESCE(?, display_name),
       building     = COALESCE(?, building),
       room         = COALESCE(?, room),
       active       = COALESCE(?, active)
     WHERE id = ?`
  ).bind(b.display_name ?? null, b.building ?? null, b.room ?? null,
         b.active === undefined ? null : (b.active ? 1 : 0), id).run();
  if (!r.meta.changes) return err("Topilmadi", 404);
  return json({ ok: true });
}
