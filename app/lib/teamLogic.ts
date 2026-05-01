// チーム振り分け & 対戦表生成のロジック

export type Format = "doubles" | "triples" | "teamcount";

/** doubles / triples のみ有効。teamcount は別途 calcTeamSizesFromCount を使う */
export const FORMAT_BASE_SIZE: Record<"doubles" | "triples", number> = {
  doubles: 2,
  triples: 3,
};

export const FORMAT_LABEL: Record<Format, string> = {
  doubles: "ダブルス",
  triples: "トリプルス",
  teamcount: "チーム数",
};

/**
 * チーム数を直接指定する場合のサイズ計算。
 * 人数をチーム数で均等割り。端数は先頭チームに +1。
 *
 * 例) 10人 / 3チーム → [4, 3, 3]
 * 例) 11人 / 4チーム → [3, 3, 3, 2]
 */
export function calcTeamSizesFromCount(
  numParticipants: number,
  numTeams: number,
): number[] {
  if (numTeams < 1 || numParticipants < numTeams) return [];
  const base = Math.floor(numParticipants / numTeams);
  const remainder = numParticipants % numTeams;
  const sizes = new Array<number>(numTeams).fill(base);
  for (let i = 0; i < remainder; i++) sizes[i] += 1;
  return sizes;
}

export type CourtCount = 1 | 2 | 3;

export const COURT_NAMES: Record<CourtCount, string[]> = {
  1: ["中央"],
  2: ["倉庫側", "ステージ側"],
  3: ["倉庫側", "中央", "ステージ側"],
};

export type Grade = "elementary" | "other";

export type Member = {
  id: string;
  name: string;
  /** 小学生 = "elementary", 中学生以上 = "other" (省略時は "other" 扱い) */
  grade?: Grade;
};

// ---------- チームサイズ計算 ----------

/**
 * 参加者数とベースチームサイズから各チームのサイズ配列を計算。
 * 端数は先頭チームから順に +1 人で吸収。
 *
 * 例) 10人 / 3人 → [4, 3, 3]
 * 例) 7人 / 3人 → [4, 3]
 * 例) 5人 / 2人 → [3, 2]
 */
export function calcTeamSizes(
  numParticipants: number,
  baseSize: number,
): number[] {
  if (numParticipants < baseSize) return [];
  const numTeams = Math.floor(numParticipants / baseSize);
  const remainder = numParticipants % baseSize;
  const sizes = new Array<number>(numTeams).fill(baseSize);
  for (let i = 0; i < remainder; i++) sizes[i] += 1;
  return sizes;
}

// ---------- チーム振り分け ----------

export type TeamAssignment = Map<number, string[]>; // teamNumber → memberId[]

/** Fisher-Yates in-place shuffle */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * メンバーをチームに振り分ける。
 *
 * - fixedAssignments で固定指定されたメンバーは先に配置
 * - gradeMap に "elementary" が含まれる場合、小学生を各チームに均等に分散
 * - 残りのスロットをその他メンバーでランダム埋め
 */
export function assignTeams(
  memberIds: string[],
  teamSizes: number[],
  fixedAssignments: Map<number, string[]> = new Map(),
  gradeMap: Map<string, Grade> = new Map(),
): TeamAssignment {
  const numTeams = teamSizes.length;
  const result: TeamAssignment = new Map();

  // 1. 固定メンバーを配置（チームサイズを超えない範囲で）
  for (let t = 1; t <= numTeams; t++) {
    const fixed = (fixedAssignments.get(t) ?? []).slice(0, teamSizes[t - 1]);
    result.set(t, [...fixed]);
  }

  // 2. 未配置メンバーを取り出す
  const fixedSet = new Set<string>();
  result.forEach((ids) => ids.forEach((id) => fixedSet.add(id)));
  const unfixed = memberIds.filter((id) => !fixedSet.has(id));

  // 3. 小学生 / その他 に分類してシャッフル
  const isElementary = (id: string) => gradeMap.get(id) === "elementary";
  const elementary = shuffle(unfixed.filter(isElementary));
  const others = shuffle(unfixed.filter((id) => !isElementary(id)));

  // 4. 小学生を「各チームの小学生数が最小のチーム」から優先して配置
  //    ランダム性を保つため同数チームはシャッフル
  for (const id of elementary) {
    // スロットが残っているチームを列挙
    const eligible: { t: number; eleCount: number }[] = [];
    for (let t = 1; t <= numTeams; t++) {
      const arr = result.get(t)!;
      if (arr.length < teamSizes[t - 1]) {
        const eleCount = arr.filter(isElementary).length;
        eligible.push({ t, eleCount });
      }
    }
    if (eligible.length === 0) break;
    // 小学生数が最少のチームを選ぶ（同数なら乱数で決定）
    eligible.sort((a, b) => a.eleCount - b.eleCount);
    const minCount = eligible[0].eleCount;
    const tied = eligible.filter((e) => e.eleCount === minCount);
    const chosen = tied[Math.floor(Math.random() * tied.length)];
    result.get(chosen.t)!.push(id);
  }

  // 5. その他メンバーで残りスロットをランダムに埋める
  //    チームの埋め順もランダム化
  const teamOrder = shuffle(
    Array.from({ length: numTeams }, (_, i) => i + 1),
  );
  let oi = 0;
  for (const t of teamOrder) {
    const arr = result.get(t)!;
    while (arr.length < teamSizes[t - 1] && oi < others.length) {
      arr.push(others[oi++]);
    }
  }
  // チームをランダムに選んでも埋まらなかった分を後詰め
  if (oi < others.length) {
    for (let t = 1; t <= numTeams && oi < others.length; t++) {
      const arr = result.get(t)!;
      while (arr.length < teamSizes[t - 1] && oi < others.length) {
        arr.push(others[oi++]);
      }
    }
  }

  return result;
}

// ---------- 対戦表（ラウンドロビン） ----------

export type Match = { teamA: number; teamB: number };

export type Round = {
  roundNumber: number;
  matches: Match[];
  refereeOrRest: number | null;
};

/**
 * Circle method による総当たり戦。
 * チーム数が奇数 → 毎回1チームが余り refereeOrRest に入る。
 * チーム数が偶数 → 全チーム毎回対戦、refereeOrRest = null。
 */
export function generateRoundRobin(numTeams: number): Round[] {
  if (numTeams < 2) return [];

  const teams: number[] = Array.from({ length: numTeams }, (_, i) => i + 1);
  if (numTeams % 2 !== 0) teams.push(0); // 0 = ダミー（休み枠）

  const n = teams.length;
  const rot = [...teams];
  const rounds: Round[] = [];

  for (let r = 0; r < n - 1; r++) {
    const matches: Match[] = [];
    let refereeOrRest: number | null = null;

    for (let i = 0; i < n / 2; i++) {
      const a = rot[i];
      const b = rot[n - 1 - i];
      if (a === 0) refereeOrRest = b;
      else if (b === 0) refereeOrRest = a;
      else matches.push({ teamA: Math.min(a, b), teamB: Math.max(a, b) });
    }

    rounds.push({ roundNumber: r + 1, matches, refereeOrRest });

    const last = rot.pop()!;
    rot.splice(1, 0, last);
  }

  return rounds;
}

// ---------- コート別セッション ----------

export type SessionMatch = {
  teamA: number;
  teamB: number;
  courtName: string;
};

export type Session = {
  sessionNumber: number;
  roundNumber: number;
  subIndex: number;
  totalSubs: number;
  matches: SessionMatch[];
  refereeOrRest: number | null;
};

/**
 * Round 列をコート数で分割したセッション列に変換。
 * マッチ数 > コート数の場合は同一回を複数セッションに分割する。
 */
export function distributeToSessions(
  rounds: Round[],
  courtCount: CourtCount,
): Session[] {
  const courtNames = COURT_NAMES[courtCount];
  const sessions: Session[] = [];
  let sessionNum = 1;

  for (const round of rounds) {
    if (round.matches.length === 0) {
      sessions.push({
        sessionNumber: sessionNum++,
        roundNumber: round.roundNumber,
        subIndex: 0,
        totalSubs: 1,
        matches: [],
        refereeOrRest: round.refereeOrRest,
      });
      continue;
    }
    const chunks: Match[][] = [];
    for (let i = 0; i < round.matches.length; i += courtCount) {
      chunks.push(round.matches.slice(i, i + courtCount));
    }
    chunks.forEach((chunk, idx) => {
      sessions.push({
        sessionNumber: sessionNum++,
        roundNumber: round.roundNumber,
        subIndex: idx,
        totalSubs: chunks.length,
        matches: chunk.map((m, mi) => ({
          ...m,
          courtName: courtNames[mi] ?? `コート${mi + 1}`,
        })),
        refereeOrRest: round.refereeOrRest,
      });
    });
  }
  return sessions;
}

// ---------- 表示用ヘルパー ----------

export function teamName(num: number): string {
  return `チーム${num}`;
}

const TEAM_COLORS = [
  "bg-rose-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-pink-500",
  "bg-cyan-500",
  "bg-lime-500",
  "bg-orange-500",
  "bg-indigo-500",
  "bg-teal-500",
  "bg-fuchsia-500",
];

export function teamColor(num: number): string {
  return TEAM_COLORS[(num - 1) % TEAM_COLORS.length];
}

const TEAM_TEXT_COLORS = [
  "text-rose-600",
  "text-sky-600",
  "text-emerald-600",
  "text-amber-600",
  "text-violet-600",
  "text-pink-600",
  "text-cyan-600",
  "text-lime-600",
  "text-orange-600",
  "text-indigo-600",
  "text-teal-600",
  "text-fuchsia-600",
];

export function teamTextColor(num: number): string {
  return TEAM_TEXT_COLORS[(num - 1) % TEAM_TEXT_COLORS.length];
}
