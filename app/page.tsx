"use client";

import { useEffect, useMemo, useState } from "react";
import {
  COURT_NAMES,
  CourtCount,
  Format,
  FORMAT_BASE_SIZE,
  FORMAT_LABEL,
  Grade,
  Member,
  Session,
  TeamAssignment,
  assignTeams,
  calcTeamSizes,
  calcTeamSizesFromCount,
  distributeToSessions,
  generateRoundRobin,
  teamColor,
  teamName,
  teamTextColor,
} from "./lib/teamLogic";
import { loadMembers, newMemberId, saveMembers } from "./lib/storage";

type Phase = "setup" | "reveal" | "matches";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("setup");

  // メンバー帳
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // 設定
  const [format, setFormat] = useState<Format>("triples");
  const [customNumTeams, setCustomNumTeams] = useState(3);
  const [courtCount, setCourtCount] = useState<CourtCount>(2);
  const [refereeMode, setRefereeMode] = useState<boolean>(true);

  // 手動チーム固定
  const [manualFixed, setManualFixed] = useState<Map<string, number>>(new Map());

  // 振り分け結果
  const [assignment, setAssignment] = useState<TeamAssignment>(new Map());
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const [lastReveal, setLastReveal] = useState<{
    memberId: string;
    teamNumber: number;
  } | null>(null);

  // localStorage
  useEffect(() => { setMembers(loadMembers()); }, []);
  useEffect(() => { saveMembers(members); }, [members]);

  // ---------- 派生値 ----------
  const selectedMembers = useMemo(
    () => members.filter((m) => selectedIds.has(m.id)),
    [members, selectedIds],
  );

  const teamSizes = useMemo(() => {
    const n = selectedMembers.length;
    if (format === "teamcount") return calcTeamSizesFromCount(n, customNumTeams);
    return calcTeamSizes(n, FORMAT_BASE_SIZE[format]);
  }, [selectedMembers.length, format, customNumTeams]);

  const numTeams = teamSizes.length;

  const memberTeam = useMemo(() => {
    const map = new Map<string, number>();
    assignment.forEach((ids, t) => ids.forEach((id) => map.set(id, t)));
    return map;
  }, [assignment]);

  const memberById = useMemo(() => {
    const map = new Map<string, Member>();
    members.forEach((m) => map.set(m.id, m));
    return map;
  }, [members]);

  const gradeMap = useMemo(
    () => new Map(members.map((m) => [m.id, m.grade ?? "other"] as [string, Grade])),
    [members],
  );

  const elementaryCount = useMemo(
    () => selectedMembers.filter((m) => m.grade === "elementary").length,
    [selectedMembers],
  );

  // ---------- アクション ----------
  function addMember(name: string) {
    const t = name.trim();
    if (!t) return;
    setMembers((p) => [...p, { id: newMemberId(), name: t, grade: "other" }]);
  }
  function bulkAddMembers(text: string) {
    const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    setMembers((p) => [...p, ...lines.map((name) => ({ id: newMemberId(), name, grade: "other" as Grade }))]);
  }
  function deleteMember(id: string) {
    setMembers((p) => p.filter((m) => m.id !== id));
    setSelectedIds((p) => { const n = new Set(p); n.delete(id); return n; });
    setManualFixed((p) => { const n = new Map(p); n.delete(id); return n; });
  }
  function renameMember(id: string, name: string) {
    const t = name.trim();
    if (!t) return;
    setMembers((p) => p.map((m) => (m.id === id ? { ...m, name: t } : m)));
  }
  function setMemberGrade(id: string, grade: Grade) {
    setMembers((p) => p.map((m) => (m.id === id ? { ...m, grade } : m)));
  }
  function toggleSelect(id: string) {
    setSelectedIds((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function selectAll() { setSelectedIds(new Set(members.map((m) => m.id))); }
  function deselectAll() { setSelectedIds(new Set()); }
  function setManualTeam(id: string, t: number | null) {
    setManualFixed((p) => { const n = new Map(p); t === null ? n.delete(id) : n.set(id, t); return n; });
  }
  function clearAllManual() { setManualFixed(new Map()); }

  function buildAssignment(): TeamAssignment {
    const ids = selectedMembers.map((m) => m.id);
    const fixed = new Map<number, string[]>();
    manualFixed.forEach((t, id) => {
      if (!selectedIds.has(id) || t < 1 || t > numTeams) return;
      const a = fixed.get(t) ?? [];
      a.push(id);
      fixed.set(t, a);
    });
    return assignTeams(ids, teamSizes, fixed, gradeMap);
  }

  function startReveal() {
    if (numTeams < 2) return;
    setAssignment(buildAssignment());
    setRevealedIds(new Set());
    setLastReveal(null);
    setPhase("reveal");
  }

  function handleReveal(memberId: string) {
    const t = memberTeam.get(memberId);
    if (t === undefined || revealedIds.has(memberId)) return;
    setRevealedIds((p) => new Set(p).add(memberId));
    setLastReveal({ memberId, teamNumber: t });
  }

  function revealAll() {
    setRevealedIds(new Set(selectedMembers.map((m) => m.id)));
    setLastReveal(null);
  }

  function dismissReveal() { setLastReveal(null); }

  function reshuffleAndReveal() {
    setAssignment(buildAssignment());
    setRevealedIds(new Set());
    setLastReveal(null);
  }

  function gotoMatches() { setPhase("matches"); }
  function backToSetup() { setPhase("setup"); }

  // ---------- 描画 ----------
  if (phase === "setup") {
    return (
      <SetupScreen
        members={members}
        selectedIds={selectedIds}
        format={format}
        customNumTeams={customNumTeams}
        courtCount={courtCount}
        refereeMode={refereeMode}
        manualFixed={manualFixed}
        teamSizes={teamSizes}
        elementaryCount={elementaryCount}
        onAddMember={addMember}
        onBulkAdd={bulkAddMembers}
        onDeleteMember={deleteMember}
        onRenameMember={renameMember}
        onSetMemberGrade={setMemberGrade}
        onToggleSelect={toggleSelect}
        onSelectAll={selectAll}
        onDeselectAll={deselectAll}
        onSetFormat={setFormat}
        onSetCustomNumTeams={setCustomNumTeams}
        onSetCourtCount={setCourtCount}
        onSetReferee={setRefereeMode}
        onSetManualTeam={setManualTeam}
        onClearManual={clearAllManual}
        onStart={startReveal}
      />
    );
  }

  if (phase === "reveal") {
    return (
      <RevealScreen
        selectedMembers={selectedMembers}
        memberTeam={memberTeam}
        memberById={memberById}
        revealedIds={revealedIds}
        lastReveal={lastReveal}
        onReveal={handleReveal}
        onRevealAll={revealAll}
        onDismissReveal={dismissReveal}
        onGotoMatches={gotoMatches}
        onReshuffle={reshuffleAndReveal}
        onBack={backToSetup}
      />
    );
  }

  return (
    <MatchesScreen
      assignment={assignment}
      memberById={memberById}
      numTeams={numTeams}
      courtCount={courtCount}
      refereeMode={refereeMode}
      onReshuffle={() => { reshuffleAndReveal(); setPhase("reveal"); }}
      onBack={backToSetup}
    />
  );
}

/* =====================================================================
 *  SetupScreen
 * ==================================================================== */

function SetupScreen(props: {
  members: Member[];
  selectedIds: Set<string>;
  format: Format;
  customNumTeams: number;
  courtCount: CourtCount;
  refereeMode: boolean;
  manualFixed: Map<string, number>;
  teamSizes: number[];
  elementaryCount: number;
  onAddMember: (n: string) => void;
  onBulkAdd: (t: string) => void;
  onDeleteMember: (id: string) => void;
  onRenameMember: (id: string, n: string) => void;
  onSetMemberGrade: (id: string, g: Grade) => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onSetFormat: (f: Format) => void;
  onSetCustomNumTeams: (n: number) => void;
  onSetCourtCount: (c: CourtCount) => void;
  onSetReferee: (b: boolean) => void;
  onSetManualTeam: (id: string, t: number | null) => void;
  onClearManual: () => void;
  onStart: () => void;
}) {
  const {
    members, selectedIds, format, customNumTeams, courtCount, refereeMode,
    manualFixed, teamSizes, elementaryCount,
    onAddMember, onBulkAdd, onDeleteMember, onRenameMember, onSetMemberGrade,
    onToggleSelect, onSelectAll, onDeselectAll,
    onSetFormat, onSetCustomNumTeams, onSetCourtCount, onSetReferee,
    onSetManualTeam, onClearManual, onStart,
  } = props;

  const numParticipants = selectedIds.size;
  const numTeams = teamSizes.length;
  const baseSize = format !== "teamcount" ? FORMAT_BASE_SIZE[format] : null;
  const canStart = numTeams >= 2;

  return (
    <main className="max-w-md mx-auto p-4 pb-32">
      <header className="py-5 text-center">
        <h1 className="text-2xl font-bold tracking-tight">チーム組み合わせメーカー</h1>
        <p className="text-xs text-slate-500 mt-1">ファミリーバドミントン練習会用</p>
      </header>

      {/* ① 形式 */}
      <Section title="① 形式">
        <div className="grid grid-cols-3 gap-2">
          {(["triples", "doubles", "teamcount"] as Format[]).map((f) => (
            <button
              key={f}
              onClick={() => onSetFormat(f)}
              className={`py-3 rounded-xl border-2 text-sm font-semibold transition ${
                format === f
                  ? "border-sky-500 bg-sky-50 text-sky-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {FORMAT_LABEL[f]}
              <div className="text-xs font-normal opacity-70 mt-0.5">
                {f === "triples" && "3人/チーム（既定）"}
                {f === "doubles" && "2人/チーム"}
                {f === "teamcount" && "チーム数を指定"}
              </div>
            </button>
          ))}
        </div>

        {format === "teamcount" && (
          <div className="mt-3 flex items-center justify-between bg-slate-50 rounded-xl p-3">
            <span className="text-sm font-medium text-slate-700">チーム数</span>
            <div className="flex items-center gap-4">
              <button
                onClick={() => onSetCustomNumTeams(Math.max(2, customNumTeams - 1))}
                className="w-9 h-9 rounded-full bg-white border-2 border-slate-200 text-xl font-bold text-slate-600 active:bg-slate-100"
              >−</button>
              <span className="text-3xl font-black tabular-nums w-8 text-center">{customNumTeams}</span>
              <button
                onClick={() => onSetCustomNumTeams(Math.min(20, customNumTeams + 1))}
                className="w-9 h-9 rounded-full bg-white border-2 border-slate-200 text-xl font-bold text-slate-600 active:bg-slate-100"
              >＋</button>
            </div>
          </div>
        )}
      </Section>

      {/* ② コート数 */}
      <Section title="② コート数">
        <div className="grid grid-cols-3 gap-2">
          {([1, 2, 3] as CourtCount[]).map((c) => (
            <button
              key={c}
              onClick={() => onSetCourtCount(c)}
              className={`py-3 rounded-xl border-2 text-sm font-semibold transition ${
                courtCount === c
                  ? "border-sky-500 bg-sky-50 text-sky-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >{c} コート</button>
          ))}
        </div>
        <p className="mt-2 text-xs text-center text-slate-500">{COURT_NAMES[courtCount].join(" / ")}</p>
      </Section>

      {/* ③ 審判 */}
      <Section title="③ 審判担当">
        <div className="grid grid-cols-2 gap-2">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              onClick={() => onSetReferee(v)}
              className={`py-3 rounded-xl border-2 text-sm font-semibold transition ${
                refereeMode === v
                  ? "border-sky-500 bg-sky-50 text-sky-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {v ? "あり" : "なし"}
              <div className="text-xs font-normal opacity-70 mt-0.5">{v ? "休みチームが審判" : "休みチームは休憩"}</div>
            </button>
          ))}
        </div>
      </Section>

      {/* ④ メンバー帳 */}
      <Section
        title="④ メンバー帳"
        right={<span className="text-xs text-slate-500">{members.length}名</span>}
        collapsible
        defaultOpen={members.length === 0}
      >
        <MemberRegistry
          members={members}
          onAdd={onAddMember}
          onBulkAdd={onBulkAdd}
          onDelete={onDeleteMember}
          onRename={onRenameMember}
          onSetGrade={onSetMemberGrade}
        />
      </Section>

      {/* ⑤ 今日の参加者 */}
      <Section
        title="⑤ 今日の参加者"
        right={
          <span className="text-xs text-slate-500">
            {numParticipants}/{members.length}
            {elementaryCount > 0 && (
              <span className="ml-1.5 text-orange-600 font-semibold">小{elementaryCount}</span>
            )}
          </span>
        }
      >
        {members.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">先にメンバー帳に登録してください</p>
        ) : (
          <>
            <div className="flex gap-2 mb-2">
              <button onClick={onSelectAll} className="flex-1 py-2 rounded-lg bg-slate-100 text-xs font-medium text-slate-600 active:bg-slate-200">全員選択</button>
              <button onClick={onDeselectAll} className="flex-1 py-2 rounded-lg bg-slate-100 text-xs font-medium text-slate-600 active:bg-slate-200">全解除</button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto">
              {members.map((m) => {
                const checked = selectedIds.has(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => onToggleSelect(m.id)}
                    className={`flex items-center gap-2 py-2.5 px-3 rounded-xl border-2 text-left transition ${
                      checked ? "border-sky-500 bg-sky-50" : "border-slate-200 bg-white"
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-xs ${checked ? "bg-sky-500 text-white" : "bg-slate-100 text-transparent"}`}>✓</span>
                    <span className="text-sm font-medium truncate">{m.name}</span>
                    {m.grade === "elementary" && <GradeBadge grade="elementary" mini />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </Section>

      {/* プレビュー */}
      {numParticipants > 0 && (
        <section className="bg-gradient-to-br from-sky-50 to-emerald-50 rounded-2xl p-4 my-3 border border-sky-100">
          <h3 className="font-semibold text-sm text-slate-700 mb-2">チーム編成プレビュー</h3>
          {numTeams < 2 ? (
            <p className="text-sm text-rose-600">
              参加者が少なすぎます（
              {format === "teamcount"
                ? `${customNumTeams}チームには最低${customNumTeams}人必要`
                : `最低 ${(baseSize ?? 2) * 2} 人`}）
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-700">
                <span className="font-bold">{numParticipants}</span> 名 →{" "}
                <span className="font-bold">{numTeams}</span> チーム
                {format !== "teamcount" && `（${FORMAT_LABEL[format]}）`}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {teamSizes.map((sz, i) => (
                  <span key={i} className={`text-xs font-bold text-white px-2 py-0.5 rounded ${teamColor(i + 1)}`}>
                    {i + 1}: {sz}人
                  </span>
                ))}
              </div>
              {teamSizes.some((s, _, a) => s !== a[0]) && (
                <p className="text-xs text-slate-500 mt-1.5">※ 端数のため人数が異なるチームがあります</p>
              )}
              {elementaryCount > 0 && (
                <p className="text-xs text-orange-700 mt-1">🏸 小学生 {elementaryCount} 名を各チームに均等配置</p>
              )}
            </>
          )}
        </section>
      )}

      {/* ⑥ 手動チーム固定 */}
      {numTeams >= 2 && (
        <Section
          title="⑥ 手動でチーム固定（任意）"
          right={
            manualFixed.size > 0
              ? <button onClick={onClearManual} className="text-xs text-sky-600 underline">全解除({manualFixed.size})</button>
              : <span className="text-xs text-slate-400">未指定はランダム</span>
          }
          collapsible
          defaultOpen={false}
        >
          <ManualFixList
            members={members.filter((m) => selectedIds.has(m.id))}
            numTeams={numTeams}
            manualFixed={manualFixed}
            onSet={onSetManualTeam}
          />
        </Section>
      )}

      <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
        <div className="max-w-md mx-auto">
          <button
            onClick={onStart}
            disabled={!canStart}
            className="w-full py-4 rounded-2xl bg-sky-600 text-white text-lg font-bold shadow-lg active:bg-sky-700 disabled:bg-slate-300 disabled:text-slate-400"
          >
            ランダム配置 → タップ開始
          </button>
        </div>
      </div>
    </main>
  );
}

/* ---------- Section ---------- */
function Section({ title, right, children, collapsible, defaultOpen = true }: {
  title: string; right?: React.ReactNode; children: React.ReactNode;
  collapsible?: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="bg-white rounded-2xl shadow-sm p-4 mb-3">
      <div
        className="flex items-center justify-between mb-3"
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
        style={{ cursor: collapsible ? "pointer" : "default" }}
      >
        <h2 className="font-semibold flex items-center gap-2">
          {collapsible && (
            <span className="text-slate-400 text-xs inline-block transition-transform"
              style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
          )}
          {title}
        </h2>
        {right}
      </div>
      {(!collapsible || open) && children}
    </section>
  );
}

/* ---------- GradeBadge ---------- */
function GradeBadge({ grade, mini = false }: { grade?: Grade; mini?: boolean }) {
  if (grade !== "elementary") return null;
  return (
    <span className={`inline-block rounded font-bold leading-none ${
      mini ? "text-[9px] px-1 py-0.5 bg-orange-100 text-orange-700"
           : "text-xs px-1.5 py-0.5 bg-orange-100 text-orange-700"
    }`}>小</span>
  );
}

/* ---------- MemberRegistry ---------- */
function MemberRegistry({ members, onAdd, onBulkAdd, onDelete, onRename, onSetGrade }: {
  members: Member[]; onAdd: (n: string) => void; onBulkAdd: (t: string) => void;
  onDelete: (id: string) => void; onRename: (id: string, n: string) => void;
  onSetGrade: (id: string, g: Grade) => void;
}) {
  const [name, setName] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  return (
    <>
      <div className="flex gap-2 mb-2">
        <input value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { onAdd(name); setName(""); } }}
          placeholder="名前を入力"
          className="flex-1 px-3 py-2 rounded-lg border-2 border-slate-200 focus:border-sky-500 outline-none text-sm" />
        <button onClick={() => { if (name.trim()) { onAdd(name); setName(""); } }} disabled={!name.trim()}
          className="px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold disabled:bg-slate-300">追加</button>
      </div>
      <div className="mb-3">
        <button onClick={() => setBulkOpen((b) => !b)} className="text-xs text-sky-600 underline">
          {bulkOpen ? "閉じる" : "▸ まとめて追加（1行1名）"}
        </button>
        {bulkOpen && (
          <div className="mt-2">
            <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)}
              rows={4} placeholder={"田中\n佐藤\n山田"}
              className="w-full px-3 py-2 rounded-lg border-2 border-slate-200 outline-none text-sm font-mono" />
            <button onClick={() => { onBulkAdd(bulkText); setBulkText(""); setBulkOpen(false); }}
              className="mt-1.5 w-full py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold">一括追加</button>
          </div>
        )}
      </div>
      {members.length === 0
        ? <p className="text-sm text-slate-400 text-center py-2">まだ登録されていません</p>
        : <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {members.map((m) => (
              <MemberRow key={m.id} member={m}
                onDelete={() => onDelete(m.id)}
                onRename={(n) => onRename(m.id, n)}
                onSetGrade={(g) => onSetGrade(m.id, g)} />
            ))}
          </div>
      }
    </>
  );
}

function MemberRow({ member, onDelete, onRename, onSetGrade }: {
  member: Member; onDelete: () => void;
  onRename: (n: string) => void; onSetGrade: (g: Grade) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(member.name);
  useEffect(() => { setDraft(member.name); }, [member.name]);

  if (editing) {
    return (
      <div className="flex items-center gap-2 bg-sky-50 rounded-xl px-3 py-2 border-2 border-sky-300">
        <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onRename(draft); setEditing(false); }
            if (e.key === "Escape") { setDraft(member.name); setEditing(false); }
          }}
          className="flex-1 px-2 py-1 rounded-lg border border-sky-300 outline-none text-sm bg-white" />
        <button onClick={() => { onRename(draft); setEditing(false); }} className="text-sm font-bold text-sky-700 px-2">保存</button>
        <button onClick={() => { setDraft(member.name); setEditing(false); }} className="text-sm text-slate-400 px-1">×</button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
      <button
        onClick={() => onSetGrade(member.grade === "elementary" ? "other" : "elementary")}
        className={`shrink-0 text-xs font-bold px-1.5 py-0.5 rounded border transition ${
          member.grade === "elementary"
            ? "bg-orange-100 text-orange-700 border-orange-300"
            : "bg-slate-100 text-slate-400 border-slate-200"
        }`}
        title={member.grade === "elementary" ? "中学生以上に変更" : "小学生に変更"}
      >
        {member.grade === "elementary" ? "小" : "中+"}
      </button>
      <span className="flex-1 text-sm font-medium truncate cursor-pointer" onClick={() => setEditing(true)}>
        {member.name}
      </span>
      <button onClick={() => setEditing(true)} className="shrink-0 text-xs text-slate-400 underline px-1">編集</button>
      <button
        onClick={() => { if (confirm(`「${member.name}」を削除しますか？`)) onDelete(); }}
        className="shrink-0 text-xs text-rose-500 px-1">削除</button>
    </div>
  );
}

/* ---------- ManualFixList ---------- */
function ManualFixList({ members, numTeams, manualFixed, onSet }: {
  members: Member[]; numTeams: number;
  manualFixed: Map<string, number>; onSet: (id: string, t: number | null) => void;
}) {
  if (!members.length) return <p className="text-sm text-slate-400 text-center py-2">参加者を選択してください</p>;
  return (
    <div className="space-y-1.5 max-h-64 overflow-y-auto">
      {members.map((m) => {
        const fixed = manualFixed.get(m.id);
        const valid = fixed !== undefined && fixed >= 1 && fixed <= numTeams;
        return (
          <div key={m.id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
            {m.grade === "elementary" && <GradeBadge grade="elementary" mini />}
            <span className="flex-1 text-sm font-medium truncate">{m.name}</span>
            <select value={valid ? String(fixed) : "auto"}
              onChange={(e) => { const v = e.target.value; onSet(m.id, v === "auto" ? null : Number(v)); }}
              className="px-2 py-1.5 rounded-lg border-2 border-slate-200 bg-white text-sm focus:border-sky-500 outline-none">
              <option value="auto">自動</option>
              {Array.from({ length: numTeams }, (_, i) => i + 1).map((t) => (
                <option key={t} value={t}>チーム {t}</option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
}

/* =====================================================================
 *  RevealScreen
 * ==================================================================== */

function RevealScreen({
  selectedMembers, memberTeam, memberById,
  revealedIds, lastReveal,
  onReveal, onRevealAll, onDismissReveal,
  onGotoMatches, onReshuffle, onBack,
}: {
  selectedMembers: Member[];
  memberTeam: Map<string, number>;
  memberById: Map<string, Member>;
  revealedIds: Set<string>;
  lastReveal: { memberId: string; teamNumber: number } | null;
  onReveal: (id: string) => void;
  onRevealAll: () => void;
  onDismissReveal: () => void;
  onGotoMatches: () => void;
  onReshuffle: () => void;
  onBack: () => void;
}) {
  const total = selectedMembers.length;
  const done = revealedIds.size;
  const allDone = done >= total;

  const teamMembersMap = useMemo(() => {
    const map = new Map<number, Member[]>();
    selectedMembers.forEach((m) => {
      const t = memberTeam.get(m.id);
      if (t === undefined) return;
      const arr = map.get(t) ?? [];
      arr.push(m);
      map.set(t, arr);
    });
    return map;
  }, [selectedMembers, memberTeam]);

  if (lastReveal) {
    const member = memberById.get(lastReveal.memberId);
    return (
      <RevealOverlay
        memberName={member?.name ?? ""}
        grade={member?.grade}
        teamNumber={lastReveal.teamNumber}
        onDismiss={onDismissReveal}
      />
    );
  }

  return (
    <main className="max-w-md mx-auto p-4 pb-36 min-h-screen">
      <header className="py-3 flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-slate-500 underline">← 設定</button>
        <span className="text-sm font-medium text-slate-600">{done} / {total}</span>
      </header>

      {!allDone ? (
        <>
          <h2 className="text-center text-lg font-bold mt-2 mb-1">自分の名前をタップ</h2>
          <p className="text-center text-xs text-slate-500 mb-5">タップするとあなたのチームが表示されます</p>
          <div className="grid grid-cols-2 gap-3">
            {selectedMembers.map((m) => {
              const revealed = revealedIds.has(m.id);
              const team = memberTeam.get(m.id);
              return (
                <button key={m.id} onClick={() => onReveal(m.id)} disabled={revealed}
                  className={`relative py-5 px-3 rounded-2xl text-base font-bold shadow-sm transition active:scale-[0.97] ${
                    revealed
                      ? `${teamColor(team ?? 1)} text-white opacity-60`
                      : "bg-white text-slate-800 border-2 border-slate-200"
                  }`}>
                  <span className="block truncate">{m.name}</span>
                  {m.grade === "elementary" && (
                    <span className="absolute top-1.5 left-2"><GradeBadge grade="elementary" mini /></span>
                  )}
                  {revealed && team !== undefined && (
                    <span className="absolute top-1.5 right-2 text-xs bg-white/30 rounded px-1.5">{team}</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <h2 className="text-center text-lg font-bold mt-3 mb-4">🎉 全員のチームが決定</h2>
          <div className="space-y-2">
            {Array.from(teamMembersMap.keys()).sort((a, b) => a - b).map((t) => (
              <TeamCard key={t} teamNumber={t} members={teamMembersMap.get(t) ?? []} />
            ))}
          </div>
        </>
      )}

      <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
        <div className="max-w-md mx-auto space-y-2">
          {!allDone && (
            <button onClick={onRevealAll}
              className="w-full py-3 rounded-2xl bg-amber-500 text-white font-bold shadow active:bg-amber-600">
              ⚡ 全員を一括でチーム確定
            </button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={onReshuffle}
              className="py-3 rounded-2xl bg-white border-2 border-slate-200 text-slate-700 font-semibold active:bg-slate-100">
              🔀 再シャッフル
            </button>
            <button onClick={onGotoMatches} disabled={!allDone}
              className="py-3 rounded-2xl bg-emerald-600 text-white font-bold shadow active:bg-emerald-700 disabled:bg-slate-300 disabled:text-slate-400">
              対戦表を作成
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function RevealOverlay({ memberName, grade, teamNumber, onDismiss }: {
  memberName: string; grade?: Grade; teamNumber: number; onDismiss: () => void;
}) {
  return (
    <button onClick={onDismiss}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/96 backdrop-blur-sm p-6 w-full">
      <div className="flex items-center gap-2 text-sm text-slate-500 mb-2">
        <span>{memberName} さんのチームは</span>
        <GradeBadge grade={grade} />
      </div>
      <div className={`reveal-pop w-52 h-52 rounded-full flex flex-col items-center justify-center text-white shadow-2xl ${teamColor(teamNumber)}`}>
        <div className="text-sm opacity-90 tracking-wide">YOUR TEAM</div>
        <div className="text-8xl font-black leading-none">{teamNumber}</div>
      </div>
      <div className={`mt-5 text-2xl font-bold ${teamTextColor(teamNumber)}`}>{teamName(teamNumber)}</div>
      <div className="mt-10 text-sm text-slate-400">タップして次の人へ →</div>
      <style jsx>{`
        .reveal-pop { animation: pop 0.45s cubic-bezier(0.2, 0.9, 0.3, 1.2); }
        @keyframes pop {
          0% { opacity: 0; transform: scale(0.5); }
          70% { opacity: 1; transform: scale(1.06); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </button>
  );
}

function TeamCard({ teamNumber, members }: { teamNumber: number; members: Member[] }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-3 flex items-start gap-3">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shrink-0 ${teamColor(teamNumber)}`}>
        {teamNumber}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-500 mb-0.5">{teamName(teamNumber)}</div>
        <div className="flex flex-wrap gap-x-2 gap-y-0.5">
          {members.map((m) => (
            <span key={m.id} className="flex items-center gap-0.5 text-sm font-medium">
              {m.name}<GradeBadge grade={m.grade} mini />
            </span>
          ))}
        </div>
      </div>
      <div className="text-xs text-slate-400 shrink-0 mt-1">{members.length}人</div>
    </div>
  );
}

/* =====================================================================
 *  MatchesScreen
 * ==================================================================== */

function MatchesScreen({ assignment, memberById, numTeams, courtCount, refereeMode, onReshuffle, onBack }: {
  assignment: TeamAssignment; memberById: Map<string, Member>;
  numTeams: number; courtCount: CourtCount; refereeMode: boolean;
  onReshuffle: () => void; onBack: () => void;
}) {
  const sessions = useMemo<Session[]>(() => {
    const rounds = generateRoundRobin(numTeams);
    return distributeToSessions(rounds, courtCount);
  }, [numTeams, courtCount]);

  const restLabel = refereeMode ? "審判" : "休憩";

  function getMembers(t: number): Member[] {
    return (assignment.get(t) ?? []).map((id) => memberById.get(id)).filter(Boolean) as Member[];
  }

  return (
    <main className="max-w-md mx-auto p-4 pb-32">
      <header className="py-3 flex items-center justify-between">
        <button onClick={onBack} className="text-sm text-slate-500 underline">← 戻る</button>
        <div className="text-sm text-slate-500">対戦表</div>
      </header>

      <h1 className="text-xl font-bold text-center mt-2 mb-1">対戦組み合わせ</h1>
      <p className="text-xs text-center text-slate-500 mb-4">
        {numTeams}チーム / {courtCount}コート / 全{sessions.length}試合
      </p>

      {/* チーム編成 */}
      <section className="mb-4 bg-white rounded-2xl shadow-sm p-4">
        <h2 className="text-sm font-semibold text-slate-600 mb-2">チーム編成</h2>
        <div className="space-y-2">
          {Array.from({ length: numTeams }, (_, i) => i + 1).map((t) => {
            const ms = getMembers(t);
            return (
              <div key={t} className="flex items-start gap-2">
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0 ${teamColor(t)}`}>{t}</span>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 pt-0.5">
                  {ms.map((m) => (
                    <span key={m.id} className="flex items-center gap-0.5 text-sm text-slate-700 font-medium">
                      {m.name}<GradeBadge grade={m.grade} mini />
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* セッション */}
      <section className="space-y-3">
        {sessions.map((s) => (
          <div key={s.sessionNumber} className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="font-bold">
                第 {s.sessionNumber} 試合
                {s.totalSubs > 1 && (
                  <span className="text-xs text-slate-400 ml-1.5 font-normal">
                    （第{s.roundNumber}回 {s.subIndex + 1}/{s.totalSubs}）
                  </span>
                )}
              </div>
              {s.refereeOrRest !== null && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-slate-500">{restLabel}:</span>
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-sm ${teamColor(s.refereeOrRest)}`}>{s.refereeOrRest}</span>
                  <span className="text-xs text-slate-500 truncate max-w-[100px]">
                    {getMembers(s.refereeOrRest).map((m) => m.name).join("/")}
                  </span>
                </div>
              )}
            </div>
            {s.matches.length === 0
              ? <p className="text-sm text-slate-400 text-center py-2">全員 {restLabel}</p>
              : <div className="space-y-2">
                  {s.matches.map((m, idx) => (
                    <div key={idx} className="bg-slate-50 rounded-xl p-3">
                      <div className="text-xs font-bold text-slate-500 mb-2">{m.courtName}</div>
                      <div className="flex items-start gap-2">
                        <TeamPill teamNumber={m.teamA} members={getMembers(m.teamA)} />
                        <span className="text-slate-400 text-xs font-bold pt-3 shrink-0">VS</span>
                        <TeamPill teamNumber={m.teamB} members={getMembers(m.teamB)} />
                      </div>
                    </div>
                  ))}
                </div>
            }
          </div>
        ))}
      </section>

      <div className="fixed bottom-0 inset-x-0 p-4 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent">
        <div className="max-w-md mx-auto grid grid-cols-2 gap-2">
          <button onClick={onReshuffle}
            className="py-3 rounded-2xl bg-white border-2 border-slate-200 text-slate-700 font-semibold active:bg-slate-100">
            🔀 再シャッフル
          </button>
          <button onClick={onBack}
            className="py-3 rounded-2xl bg-slate-700 text-white font-semibold active:bg-slate-800">
            設定に戻る
          </button>
        </div>
      </div>
    </main>
  );
}

function TeamPill({ teamNumber, members }: { teamNumber: number; members: Member[] }) {
  return (
    <div className="flex-1 flex items-start gap-2 min-w-0">
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold shrink-0 ${teamColor(teamNumber)}`}>{teamNumber}</span>
      <div className="min-w-0 flex flex-wrap gap-x-1.5 gap-y-0.5 pt-1">
        {members.map((m) => (
          <span key={m.id} className="flex items-center gap-0.5 text-xs text-slate-700 font-medium">
            {m.name}<GradeBadge grade={m.grade} mini />
          </span>
        ))}
      </div>
    </div>
  );
}
