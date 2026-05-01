import type { Member } from "./teamLogic";

const KEY_MEMBERS = "team-maker.members.v1";

export function loadMembers(): Member[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY_MEMBERS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (m): m is Record<string, unknown> =>
          m !== null && typeof m === "object",
      )
      .filter(
        (m) => typeof m.id === "string" && typeof m.name === "string",
      )
      .map((m) => ({
        id: m.id as string,
        name: m.name as string,
        // 旧データに grade がなければ "other" で補完
        grade: m.grade === "elementary" ? "elementary" : ("other" as const),
      }));
  } catch {
    return [];
  }
}

export function saveMembers(members: Member[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY_MEMBERS, JSON.stringify(members));
  } catch {
    // QuotaExceeded 等は黙殺
  }
}

export function newMemberId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}
