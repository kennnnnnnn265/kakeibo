import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus, Trash2, Wallet, PiggyBank,
  Receipt, Landmark, NotebookPen, Loader2, TrendingUp, Save, Printer, LogOut, Pencil, Download,
} from "lucide-react";
import * as db from "./db.js";

/* ---------------------------------------------------------
   カテゴリ定義（元のKAKEIBOと同じ）
--------------------------------------------------------- */
const INCOME_FIELDS = [
  { key: "salary", label: "給料" },
  { key: "salaryPlus", label: "給料ぷらす" },
  { key: "bonus", label: "ボーナス" },
];
const SAVINGS_FIELDS = [
  { key: "sagawa", label: "佐川持ち株" },
  { key: "nisa", label: "積み立てNISA" },
  { key: "sonyLife", label: "ソニー生命" },
  { key: "remaining", label: "残り貯金" },
];
const FIXED_CATEGORIES = [
  { key: "rent", label: "家賃" },
  { key: "insurance", label: "保険" },
  { key: "gas", label: "ガス" },
  { key: "electricity", label: "電気" },
  { key: "water", label: "水道" },
  { key: "phone", label: "携帯" },
  { key: "wifi", label: "wi-fi" },
  { key: "food", label: "食費" },
  { key: "subscription", label: "サブスク" },
];
const VARIABLE_CATEGORIES = [
  { key: "transport", label: "交通費" },
  { key: "convenience", label: "コンビニ・売店" },
  { key: "diningOut", label: "外食費" },
  { key: "medical", label: "医療費" },
  { key: "hobby", label: "趣味" },
  { key: "necessity", label: "必要経費" },
  { key: "personal", label: "私用経費" },
  { key: "other", label: "その他" },
];
const BALANCE_FIELDS = [
  { key: "rakuten", label: "楽天銀行" },
  { key: "yucho", label: "ゆうちょ銀行" },
  { key: "bank77_1", label: "七十七銀行①" },
  { key: "bank77_2", label: "七十七銀行②" },
];

// 食費の内訳（アプリ内でオン・オフ・追加できる）。key は "food"（基本）または "food:xxx"
const DEFAULT_FOOD_SUBS = [
  { key: "food", label: "食費", on: true },
  { key: "food:daily", label: "日用品", on: true },
  { key: "food:pet", label: "ペット費", on: false },
  { key: "food:baby", label: "赤ちゃん費", on: false },
];
const isFood = (cat) => cat === "food" || String(cat).startsWith("food:");

const PIE_COLORS = ["#22304A", "#8C5A3C", "#B23A2F", "#6B7F5E", "#7C6A9C", "#C9A15A", "#4A6B7C", "#8A8F5C"];
// 推移グラフの色（固定費・変動費・貯蓄）
const TREND_COLORS = { fixed: "#22304A", variable: "#C9A15A", savings: "#6B7F5E", budget: "#B23A2F" };

/* ---------------------------------------------------------
   ユーティリティ
--------------------------------------------------------- */
function pad(n) { return n < 10 ? "0" + n : "" + n; }
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function monthKeyOf(dateStr) { return dateStr.slice(0, 7); }
function yen(n) { return (Number(n) || 0).toLocaleString("ja-JP"); }
function shiftMonth(monthStr, delta) {
  const [y, m] = monthStr.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function monthLabel(monthStr) { const [y, m] = monthStr.split("-").map(Number); return `${y}年${m}月`; }
function shortMonthLabel(monthStr) { return `${Number(monthStr.split("-")[1])}月`; }
function emptyMonthData() {
  return {
    income: Object.fromEntries(INCOME_FIELDS.map(f => [f.key, 0])),
    balances: Object.fromEntries(BALANCE_FIELDS.map(f => [f.key, 0])),
    notes: "",
  };
}
function mergeMonthData(saved) {
  const base = emptyMonthData();
  if (!saved) return base;
  return {
    income: { ...base.income, ...(saved.income || {}) },
    balances: { ...base.balances, ...(saved.balances || {}) },
    notes: saved.notes ?? base.notes,
  };
}
function emptySettings() {
  return {
    savings: Object.fromEntries(SAVINGS_FIELDS.map(f => [f.key, 0])),
    fixedBudget: Object.fromEntries(FIXED_CATEGORIES.map(f => [f.key, 0])),
    fixedActual: Object.fromEntries(FIXED_CATEGORIES.map(f => [f.key, 0])),
    variableBudget: Object.fromEntries(VARIABLE_CATEGORIES.map(f => [f.key, 0])),
    foodSubs: DEFAULT_FOOD_SUBS,
  };
}
function mergeSettings(saved) {
  const base = emptySettings();
  if (!saved) return base;
  return {
    savings: { ...base.savings, ...(saved.savings || {}) },
    fixedBudget: { ...base.fixedBudget, ...(saved.fixedBudget || {}) },
    fixedActual: { ...base.fixedActual, ...(saved.fixedActual || {}) },
    variableBudget: { ...base.variableBudget, ...(saved.variableBudget || {}) },
    foodSubs: Array.isArray(saved.foodSubs) && saved.foodSubs.length ? saved.foodSubs : base.foodSubs,
  };
}
function sumValues(obj) { return Object.values(obj).reduce((a, b) => a + (Number(b) || 0), 0); }
// 全角数字も半角にして、数字以外を取り除く
function digitsOnly(s) {
  return String(s).replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, "");
}
function newId() { return `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }
function sortExpenses(list) { return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)); }

/* ---------------------------------------------------------
   小さな部品
--------------------------------------------------------- */
function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="section-header">
      <Icon size={16} strokeWidth={2} />
      <span>{title}</span>
      <div className="rule" />
    </div>
  );
}

// 金額入力：＋−ボタンなし（type="number" をやめ、数字キーボードの文字入力にする）
function AmountInput({ value, onChange, placeholder, className = "amount-input", onKeyDown, name }) {
  const num = Number(value) || 0;
  const shown = num === 0 ? "" : String(num);
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      name={name}
      className={className}
      value={shown}
      placeholder={placeholder ?? "0"}
      onKeyDown={onKeyDown}
      onChange={(e) => { const d = digitsOnly(e.target.value); onChange(d === "" ? 0 : Number(d)); }}
    />
  );
}

function LedgerRow({ label, children }) {
  return (
    <div className="ledger-row">
      <span className="ledger-label">{label}</span>
      <div className="ledger-leader" />
      <div className="ledger-value">{children}</div>
    </div>
  );
}

// 支出1件の表示と編集（タップで編集欄が開く）
function ExpenseItem({ e, showCategory, onSave, onDelete, options = VARIABLE_CATEGORIES, memoPlaceholder = "メモ（任意）" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(e);
  const cat = options.find(c => c.key === e.category);

  function open() { setDraft({ ...e }); setEditing(true); }
  async function save() {
    const amount = Number(draft.amount);
    if (!draft.date || !amount || amount <= 0) return;
    await onSave({ ...draft, amount });
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="expense-edit">
        <div className="expense-form">
          <input type="date" value={draft.date} onChange={ev => setDraft(d => ({ ...d, date: ev.target.value }))} />
          <select value={draft.category} onChange={ev => setDraft(d => ({ ...d, category: ev.target.value }))}>
            {options.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <AmountInput name="amount" className="" placeholder="金額" value={draft.amount}
            onChange={v => setDraft(d => ({ ...d, amount: v }))} />
          <input type="text" name="memo" placeholder={memoPlaceholder} value={draft.memo || ""}
            onChange={ev => setDraft(d => ({ ...d, memo: ev.target.value }))} />
        </div>
        <div className="edit-actions">
          <button type="button" className="edit-del" onClick={() => onDelete(e)}><Trash2 size={13} /> 削除</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="edit-cancel" onClick={() => setEditing(false)}>やめる</button>
          <button type="button" className="edit-save" onClick={save}>保存</button>
        </div>
      </div>
    );
  }
  return (
    <div className="expense-item" role="button" tabIndex={0} onClick={open}
      onKeyDown={ev => { if (ev.key === "Enter") open(); }}>
      <span className="expense-date">{e.date.slice(5).replace("-", "/")}</span>
      {showCategory && <span className="expense-cat">{cat?.label ?? e.category}</span>}
      <span className="expense-memo">{e.memo || ""}</span>
      <span className="expense-amount">¥{yen(e.amount)}</span>
      <Pencil size={12} className="edit-hint" />
    </div>
  );
}

function CategoryProgress({
  label, budget, actual, readOnlyBudget, onBudgetChange, actualNode,
  clickableLabel, expanded, onToggleLabel, detailItems, onSaveDetail, onDeleteDetail, detailNode,
}) {
  const pct = budget > 0 ? Math.min(150, (actual / budget) * 100) : (actual > 0 ? 100 : 0);
  const over = budget > 0 && actual > budget;
  const barColor = over ? "#B23A2F" : pct >= 85 ? "#C9A15A" : "#6B7F5E";
  return (
    <div className="cat-row">
      <div className="cat-top">
        {clickableLabel ? (
          <button type="button" className="cat-label cat-label-clickable" onClick={onToggleLabel}>
            {label}
            <ChevronDown size={12} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
          </button>
        ) : (
          <span className="cat-label">{label}</span>
        )}
        <div className="cat-amounts">
          <span className="cat-actual" style={{ color: over ? "#B23A2F" : "#22304A" }}>¥{yen(actual)}</span>
          <span className="cat-slash">/</span>
          {readOnlyBudget ? (
            <span className="cat-budget-readonly">¥{yen(budget)}</span>
          ) : (
            <div className="cat-budget-input">
              <span>¥</span>
              <AmountInput value={budget} onChange={onBudgetChange} />
            </div>
          )}
        </div>
      </div>
      {actualNode}
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${Math.min(100, pct)}%`, background: barColor }} />
      </div>
      {clickableLabel && expanded && detailNode}
      {clickableLabel && expanded && !detailNode && (
        <div className="cat-detail">
          {(!detailItems || detailItems.length === 0) ? (
            <div className="empty-note-small">この月の記録はありません</div>
          ) : detailItems.map(e => (
            <ExpenseItem key={e.id} e={e} onSave={onSaveDetail} onDelete={onDeleteDetail} />
          ))}
        </div>
      )}
    </div>
  );
}

// 食費の明細：お店ごとの買い物を記録して月の合計を出す
function FoodDetail({ subs, items, onAdd, onSave, onDelete, onChangeSubs }) {
  const enabled = subs.filter(s => s.on || s.key === "food");
  const split = enabled.length > 1;
  const [form, setForm] = useState({ date: todayStr(), category: "food", amount: 0, memo: "" });
  const [setupOpen, setSetupOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const totals = {};
  for (const e of items) totals[e.category] = (totals[e.category] || 0) + (Number(e.amount) || 0);
  const total = Object.values(totals).reduce((a, b) => a + b, 0);
  // 表示する内訳：オンのもの＋オフでもこの月に記録があるもの
  const shown = subs.filter(s => s.on || s.key === "food" || totals[s.key]);
  const category = enabled.some(s => s.key === form.category) ? form.category : "food";

  async function add() {
    const amount = Number(form.amount);
    if (!form.date || !amount || amount <= 0) return;
    await onAdd({ date: form.date, category, amount, memo: form.memo.trim() });
    setForm(f => ({ ...f, amount: 0, memo: "" }));
  }
  function toggle(key) {
    onChangeSubs(subs.map(s => s.key === key ? { ...s, on: !s.on } : s));
  }
  function addSub() {
    const label = newName.trim();
    if (!label) return;
    onChangeSubs([...subs, { key: `food:c${Date.now().toString(36)}`, label, on: true }]);
    setNewName("");
  }

  return (
    <div className="cat-detail food-detail">
      {split && (
        <div className="food-totals">
          {shown.map(s => (
            <span key={s.key} className={"food-total-chip" + (s.on || s.key === "food" ? "" : " off")}>
              {s.label} <b>¥{yen(totals[s.key] || 0)}</b>
            </span>
          ))}
        </div>
      )}
      <div className="food-sum">この月の合計 <b>¥{yen(total)}</b>（{items.length}件）</div>

      <div className="expense-form food-form">
        <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
        <input type="text" name="memo" placeholder="お店（例：ヨーク）" value={form.memo}
          onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
        <AmountInput name="amount" className="" placeholder="金額" value={form.amount}
          onKeyDown={e => { if (e.key === "Enter") add(); }}
          onChange={v => setForm(f => ({ ...f, amount: v }))} />
        {split && (
          <div className="sub-chips">
            {enabled.map(s => (
              <button type="button" key={s.key} className={"sub-chip" + (category === s.key ? " active" : "")}
                onClick={() => setForm(f => ({ ...f, category: s.key }))}>{s.label}</button>
            ))}
          </div>
        )}
        <button type="button" className="add-btn" onClick={add}><Plus size={15} /> 追加する</button>
      </div>

      {items.length === 0 ? (
        <div className="empty-note-small">この月の記録はまだありません</div>
      ) : items.map(e => (
        <ExpenseItem key={e.id} e={e} showCategory={split} options={subs} memoPlaceholder="お店"
          onSave={onSave} onDelete={onDelete} />
      ))}

      <button type="button" className="setup-link" onClick={() => setSetupOpen(o => !o)}>
        {setupOpen ? "閉じる" : "分け方を変える（食費・日用品・ペット費など）"}
      </button>
      {setupOpen && (
        <div className="sub-setup">
          <div className="backup-desc" style={{ margin: "0 0 6px" }}>使う項目にチェック。1つだけなら分けずに「食費」でまとめて記録します。オフにしても記録は消えません。</div>
          {subs.map(s => (
            <label key={s.key} className="sub-setup-row">
              <input type="checkbox" checked={s.on || s.key === "food"} disabled={s.key === "food"} onChange={() => toggle(s.key)} />
              <span>{s.label}</span>
            </label>
          ))}
          <div className="sub-add">
            <input type="text" placeholder="項目を追加（例：お酒）" value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addSub(); }} />
            <button type="button" className="edit-cancel" onClick={addSub}>追加</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TrendTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const row = payload[0].payload;
  if (!row.hasData) return null;
  return (
    <div className="trend-tip">
      <div className="trend-tip-title">{label}</div>
      <div><i style={{ background: TREND_COLORS.fixed }} />固定費 ¥{yen(row.fixed)}</div>
      <div><i style={{ background: TREND_COLORS.variable }} />変動費 ¥{yen(row.variable)}</div>
      <div><i style={{ background: TREND_COLORS.savings }} />貯蓄 ¥{yen(row.savings)}</div>
      <div className="trend-tip-total">合計 ¥{yen(row.fixed + row.variable + row.savings)}</div>
      <div style={{ color: TREND_COLORS.budget }}>予算 ¥{yen(row.budget)}</div>
    </div>
  );
}

/* ---------------------------------------------------------
   ログイン画面
--------------------------------------------------------- */
function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function submit(ev) {
    ev.preventDefault();
    setBusy(true); setMsg("");
    try { await db.signIn(email.trim(), password); }
    catch { setMsg("ログインできませんでした。メールアドレスとパスワードを確認してください。"); }
    finally { setBusy(false); }
  }
  return (
    <div className="kakeibo-root">
      <div className="wrap">
        <div className="header-row" style={{ marginTop: 40 }}><div className="stamp">家計簿</div></div>
        <div className="app-title">K A K E I B O</div>
        <form className="card login-card" onSubmit={submit}>
          <p className="backup-desc" style={{ marginTop: 0 }}>「うちの買い物」と同じメールアドレスとパスワードでログインできます。家計簿はあなただけが見られます。</p>
          <input className="login-input" type="email" autoComplete="email" placeholder="メールアドレス" value={email} onChange={e => setEmail(e.target.value)} required />
          <input className="login-input" type="password" autoComplete="current-password" placeholder="パスワード" value={password} onChange={e => setPassword(e.target.value)} required />
          <button className="backup-btn" type="submit" disabled={busy}>{busy ? "ログイン中…" : "ログイン"}</button>
          {msg && <div className="backup-msg" style={{ color: "#B23A2F" }}>{msg}</div>}
        </form>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   バックアップ取り込み欄（初回の引っ越しにも使う）
--------------------------------------------------------- */
function ImportBox({ onImport, intro }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState({ s: "idle", m: "" });
  const fileRef = useRef(null);
  async function run(raw) {
    setStatus({ s: "working", m: "" });
    try {
      const dump = JSON.parse(raw);
      const r = await onImport(dump);
      setStatus({ s: "done", m: `取り込みました（${r.months}か月分・支出${r.expenses}件）` });
      setText("");
    } catch {
      setStatus({ s: "error", m: "取り込めませんでした。書き出したデータをそのまま貼り付けてください。" });
    }
  }
  return (
    <>
      {intro && <p className="backup-desc">{intro}</p>}
      <textarea className="backup-textarea" placeholder="ここに書き出したデータを貼り付け" value={text} onChange={e => setText(e.target.value)} />
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="backup-btn secondary" onClick={() => fileRef.current?.click()} disabled={status.s === "working"}>ファイルから選ぶ</button>
        <button type="button" className="backup-btn" onClick={() => run(text)} disabled={status.s === "working" || !text.trim()}>取り込む</button>
      </div>
      <input ref={fileRef} type="file" accept=".txt,.json,text/plain,application/json" style={{ display: "none" }}
        onChange={async e => { const f = e.target.files?.[0]; if (f) run(await f.text()); e.target.value = ""; }} />
      {status.m && <div className="backup-msg" style={{ color: status.s === "error" ? "#B23A2F" : undefined }}>{status.m}</div>}
    </>
  );
}

/* ---------------------------------------------------------
   メイン
--------------------------------------------------------- */
export default function App() {
  const [session, setSession] = useState(undefined); // undefined=確認中, null=未ログイン
  useEffect(() => {
    db.getSession().then(s => setSession(s ?? null));
    return db.onAuthChange(s => setSession(s ?? null));
  }, []);

  if (session === undefined) return <Loading />;
  if (!session) return <Login />;
  return <Kakeibo key={session.user.id} email={session.user.email} />;
}

function Loading() {
  return (
    <div className="kakeibo-root">
      <div className="loading-screen"><Loader2 className="spin" size={22} /><span>読み込み中…</span></div>
    </div>
  );
}

function Kakeibo({ email }) {
  const [selectedMonth, setSelectedMonth] = useState(todayStr().slice(0, 7));
  const [months, setMonths] = useState({});       // 保存済みの月データ { "2026-10": {...} }
  const [settings, setSettings] = useState(emptySettings());
  const [hasSettings, setHasSettings] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveTag, setSaveTag] = useState("idle"); // idle | saving | saved | error
  const [form, setForm] = useState({ date: todayStr(), category: VARIABLE_CATEGORIES[0].key, amount: 0, memo: "" });
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [backupOpen, setBackupOpen] = useState(false);

  const monthTimers = useRef({});
  const settingsTimer = useRef(null);

  const reload = useCallback(async () => {
    setLoading(true); setLoadError("");
    try {
      const d = await db.loadAll();
      setSettings(mergeSettings(d.settings));
      setHasSettings(!!d.settings);
      setMonths(d.months);
      setExpenses(sortExpenses(d.expenses));
    } catch {
      setLoadError("データを読み込めませんでした。電波の良いところで開き直してください。");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function guard(fn) {
    setSaveTag("saving");
    try { await fn(); setSaveTag("saved"); }
    catch { setSaveTag("error"); }
  }

  /* ---- 表示中の月データ（未保存の月は直近の月から収入だけ引き継ぐ） ---- */
  const monthData = useMemo(() => {
    if (months[selectedMonth]) return mergeMonthData(months[selectedMonth]);
    const base = emptyMonthData();
    const prevKeys = Object.keys(months).filter(k => k < selectedMonth).sort();
    if (prevKeys.length) base.income = { ...base.income, ...(months[prevKeys[prevKeys.length - 1]].income || {}) };
    return base;
  }, [months, selectedMonth]);

  /* ---- 月データの保存（入力が止まって0.7秒後） ---- */
  function scheduleMonthSave(month, data) {
    setSaveTag("saving");
    clearTimeout(monthTimers.current[month]);
    monthTimers.current[month] = setTimeout(() => {
      delete monthTimers.current[month];
      guard(() => db.saveMonth(month, data));
    }, 700);
  }
  function updateMonth(mutator) {
    const next = mutator(monthData);
    setMonths(prev => ({ ...prev, [selectedMonth]: next }));
    scheduleMonthSave(selectedMonth, next);
  }
  function updateSection(section, key, value) {
    updateMonth(prev => ({ ...prev, [section]: { ...prev[section], [key]: value } }));
  }
  function updateNotes(value) { updateMonth(prev => ({ ...prev, notes: value })); }

  /* ---- 共通設定（貯蓄・固定費・変動費予算）の保存 ---- */
  function updateSettingsSection(section, key, value) {
    setSettings(prev => {
      const next = { ...prev, [section]: { ...prev[section], [key]: value } };
      setSaveTag("saving");
      clearTimeout(settingsTimer.current);
      settingsTimer.current = setTimeout(() => {
        settingsTimer.current = null;
        guard(() => db.saveSettings(next));
      }, 700);
      return next;
    });
    setHasSettings(true);
  }

  /* ---- 支出の追加・修正・削除 ---- */
  async function addEntry(fields) {
    const entry = { id: newId(), ...fields };
    setExpenses(prev => sortExpenses([entry, ...prev]));
    await guard(() => db.upsertExpenses([entry]));
  }
  function updateFoodSubs(next) {
    const s2 = { ...settings, foodSubs: next };
    setSettings(s2);
    setHasSettings(true);
    guard(() => db.saveSettings(s2));
  }
  async function addExpense() {
    const amount = Number(form.amount);
    if (!form.date || !amount || amount <= 0) return;
    const entry = { id: newId(), date: form.date, category: form.category, amount, memo: form.memo.trim() };
    setExpenses(prev => sortExpenses([entry, ...prev]));
    setForm(f => ({ ...f, amount: 0, memo: "" }));
    await guard(() => db.upsertExpenses([entry]));
  }
  async function saveExpense(entry) {
    const clean = { ...entry, memo: (entry.memo || "").trim() };
    setExpenses(prev => sortExpenses(prev.map(x => x.id === clean.id ? clean : x)));
    await guard(() => db.upsertExpenses([clean]));
  }
  async function removeExpense(e) {
    if (!window.confirm(`${e.date.slice(5).replace("-", "/")} ${e.memo || ""} ¥${yen(e.amount)} を削除しますか？`)) return;
    setExpenses(prev => prev.filter(x => x.id !== e.id));
    await guard(() => db.deleteExpense(e.id));
  }
  function handleEnterKey(e) { if (e.key === "Enter") addExpense(); }

  /* ---- バックアップ ---- */
  async function importDump(dump) {
    await db.importDump(dump);
    await reload();
    return { months: Object.keys(dump.months || {}).length, expenses: (dump.expenses || []).length };
  }
  function exportBackup() {
    const dump = { exportedAt: new Date().toISOString(), settings, months, expenses };
    const blob = new Blob([JSON.stringify(dump)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `kakeibo-backup-${todayStr()}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /* ---- 集計 ---- */
  const monthAll = useMemo(
    () => expenses.filter(x => monthKeyOf(x.date) === selectedMonth),
    [expenses, selectedMonth]
  );
  const monthExpenses = useMemo(() => monthAll.filter(x => !isFood(x.category)), [monthAll]);
  const foodItems = useMemo(() => monthAll.filter(x => isFood(x.category)), [monthAll]);
  const foodTotal = foodItems.reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const [foodOpen, setFoodOpen] = useState(false);
  const variableActuals = useMemo(() => {
    const acc = Object.fromEntries(VARIABLE_CATEGORIES.map(c => [c.key, 0]));
    for (const e of monthExpenses) if (acc[e.category] !== undefined) acc[e.category] += Number(e.amount) || 0;
    return acc;
  }, [monthExpenses]);

  const incomeTotal = sumValues(monthData.income);
  const savingsTotal = sumValues(settings.savings);
  const fixedBudgetTotal = sumValues(settings.fixedBudget);
  // 固定費の実績：食費だけは「食費の明細」の月合計を使う（他は共通設定）
  const fixedOtherTotal = sumValues(settings.fixedActual) - (Number(settings.fixedActual.food) || 0);
  const fixedActualTotal = fixedOtherTotal + foodTotal;
  const variableBudgetTotal = sumValues(settings.variableBudget);
  const variableActualTotal = sumValues(variableActuals);
  const actualTotal = fixedActualTotal + variableActualTotal + savingsTotal;
  const balanceTotal = sumValues(monthData.balances);
  const diff = incomeTotal - actualTotal;

  /* ---- 推移グラフ：固定費・変動費・貯蓄を積み上げ（記録のない月は空欄） ---- */
  const monthlyTrend = useMemo(() => {
    const budget = fixedBudgetTotal + variableBudgetTotal + savingsTotal;
    const rows = [];
    for (let i = 5; i >= 0; i--) {
      const m = shiftMonth(selectedMonth, -i);
      const mAll = expenses.filter(e => monthKeyOf(e.date) === m);
      const hasData = mAll.length > 0 || !!months[m] || m === selectedMonth;
      const sumOf = list => list.reduce((a, e) => a + (Number(e.amount) || 0), 0);
      const variable = sumOf(mAll.filter(e => !isFood(e.category)));
      const food = sumOf(mAll.filter(e => isFood(e.category)));
      rows.push({
        month: shortMonthLabel(m), hasData, budget,
        fixed: hasData ? fixedOtherTotal + food : 0,
        variable: hasData ? variable : 0,
        savings: hasData ? savingsTotal : 0,
      });
    }
    return rows;
  }, [selectedMonth, expenses, months, fixedOtherTotal, savingsTotal, fixedBudgetTotal, variableBudgetTotal]);

  const pieData = useMemo(() => {
    const rows = [];
    FIXED_CATEGORIES.forEach(c => {
      if (c.key === "food") {
        const t = {};
        for (const e of foodItems) t[e.category] = (t[e.category] || 0) + (Number(e.amount) || 0);
        settings.foodSubs.forEach(s => { if (t[s.key] > 0) rows.push({ name: s.label, value: t[s.key] }); });
      } else if (settings.fixedActual[c.key] > 0) rows.push({ name: c.label, value: settings.fixedActual[c.key] });
    });
    VARIABLE_CATEGORIES.forEach(c => { if (variableActuals[c.key] > 0) rows.push({ name: c.label, value: variableActuals[c.key] }); });
    if (savingsTotal > 0) rows.push({ name: "積立資金", value: savingsTotal });
    return rows;
  }, [settings.fixedActual, settings.foodSubs, foodItems, variableActuals, savingsTotal]);

  const isEmpty = !hasSettings && expenses.length === 0 && Object.keys(months).length === 0;

  return (
    <div className="kakeibo-root">
      <div className="wrap">
        <div className="header-row">
          <button className="month-nav-btn" onClick={() => setSelectedMonth(m => shiftMonth(m, -1))} aria-label="前の月"><ChevronLeft size={18} /></button>
          <div className="stamp">{monthLabel(selectedMonth)}</div>
          <button className="month-nav-btn" onClick={() => setSelectedMonth(m => shiftMonth(m, 1))} aria-label="次の月"><ChevronRight size={18} /></button>
        </div>
        <div className="print-row">
          <button type="button" className="print-btn" onClick={() => window.print()}><Printer size={14} /><span>印刷</span></button>
        </div>
        <div className="app-title">家　計　簿</div>
        <div className="save-tag" style={{ color: saveTag === "error" ? "#B23A2F" : undefined }}>
          {saveTag === "saving" ? "保存中…" : saveTag === "saved" ? "保存済み" : saveTag === "error" ? "保存できませんでした。電波を確認してもう一度入力してください" : ""}
        </div>

        {loading ? (
          <div className="loading-screen"><Loader2 className="spin" size={22} /><span>読み込み中…</span></div>
        ) : loadError ? (
          <div className="card"><p className="backup-desc">{loadError}</p><button className="backup-btn" onClick={reload}>もう一度読み込む</button></div>
        ) : (
          <>
            {isEmpty && (
              <div className="card import-card">
                <SectionHeader icon={Download} title="前のKAKEIBOからデータを引っ越す" />
                <ImportBox onImport={importDump}
                  intro="前のKAKEIBOの「バックアップ・復元」→「データを書き出す」で出てきた文字を貼り付けるか、保存したファイルを選んでください。" />
              </div>
            )}

            {/* サマリー */}
            <div className="stat-cards">
              <div className="stat-card"><div className="stat-label">収入</div><div className="stat-value">¥{yen(incomeTotal)}</div></div>
              <div className="stat-card">
                <div className="stat-label">支出</div>
                <div className="stat-value" style={{ color: actualTotal > incomeTotal && incomeTotal > 0 ? "#B23A2F" : "var(--ink)" }}>¥{yen(actualTotal)}</div>
              </div>
              <div className="stat-card"><div className="stat-label">貯蓄</div><div className="stat-value">¥{yen(savingsTotal)}</div></div>
            </div>
            <div className="diff-row">
              <span className="diff-label">収支差額（収入－支出）</span>
              <span className="diff-value" style={{ color: diff < 0 ? "#B23A2F" : "var(--good)" }}>{diff < 0 ? "－" : ""}¥{yen(Math.abs(diff))}</span>
            </div>

            {/* 収入 */}
            <div className="card">
              <SectionHeader icon={Wallet} title="収入" />
              {INCOME_FIELDS.map(f => (
                <LedgerRow key={f.key} label={f.label}>
                  <AmountInput value={monthData.income[f.key]} onChange={(v) => updateSection("income", f.key, v)} />
                </LedgerRow>
              ))}
              <div className="total-row"><span>合計</span><span className="ledger-value">¥{yen(incomeTotal)}</span></div>
            </div>

            {/* 貯蓄 */}
            <div className="card">
              <SectionHeader icon={PiggyBank} title="貯蓄" />
              {SAVINGS_FIELDS.map(f => (
                <LedgerRow key={f.key} label={f.label}>
                  <AmountInput value={settings.savings[f.key]} onChange={(v) => updateSettingsSection("savings", f.key, v)} />
                </LedgerRow>
              ))}
              <div className="total-row"><span>合計</span><span className="ledger-value">¥{yen(savingsTotal)}</span></div>
            </div>

            {/* 固定費 */}
            <div className="card">
              <SectionHeader icon={Receipt} title="固定費（毎月おおよそ一定）" />
              {FIXED_CATEGORIES.map(c => c.key === "food" ? (
                <CategoryProgress
                  key={c.key} label={c.label}
                  budget={settings.fixedBudget.food} actual={foodTotal}
                  onBudgetChange={(v) => updateSettingsSection("fixedBudget", "food", v)}
                  clickableLabel expanded={foodOpen} onToggleLabel={() => setFoodOpen(o => !o)}
                  actualNode={!foodOpen && (
                    <div className="food-hint" onClick={() => setFoodOpen(true)}>「食費」を押すと、お店ごとの買い物を記録できます</div>
                  )}
                  detailNode={
                    <FoodDetail subs={settings.foodSubs} items={foodItems}
                      onAdd={addEntry} onSave={saveExpense} onDelete={removeExpense} onChangeSubs={updateFoodSubs} />
                  }
                />
              ) : (
                <CategoryProgress
                  key={c.key} label={c.label}
                  budget={settings.fixedBudget[c.key]} actual={settings.fixedActual[c.key]}
                  onBudgetChange={(v) => updateSettingsSection("fixedBudget", c.key, v)}
                  actualNode={
                    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 5 }}>
                      <span style={{ fontSize: 11, color: "var(--ink-soft)", marginRight: 6, alignSelf: "center" }}>実績</span>
                      <div className="cat-budget-input">
                        <span>¥</span>
                        <AmountInput value={settings.fixedActual[c.key]} onChange={(v) => updateSettingsSection("fixedActual", c.key, v)} />
                      </div>
                    </div>
                  }
                />
              ))}
              <div className="total-row"><span>合計</span><span className="ledger-value">¥{yen(fixedActualTotal)} / ¥{yen(fixedBudgetTotal)}</span></div>
            </div>

            {/* 変動費 */}
            <div className="card">
              <SectionHeader icon={Receipt} title="変動費（支出の記録から自動集計）" />
              {VARIABLE_CATEGORIES.map(c => (
                <CategoryProgress
                  key={c.key} label={c.label}
                  budget={settings.variableBudget[c.key]} actual={variableActuals[c.key]}
                  onBudgetChange={(v) => updateSettingsSection("variableBudget", c.key, v)}
                  clickableLabel
                  expanded={expandedCategory === c.key}
                  onToggleLabel={() => setExpandedCategory(prev => prev === c.key ? null : c.key)}
                  detailItems={monthExpenses.filter(e => e.category === c.key)}
                  onSaveDetail={saveExpense}
                  onDeleteDetail={removeExpense}
                />
              ))}
              <CategoryProgress label="積立資金（貯蓄額と連動）" budget={savingsTotal} actual={savingsTotal} readOnlyBudget />
              <div className="total-row"><span>合計</span><span className="ledger-value">¥{yen(variableActualTotal + savingsTotal)} / ¥{yen(variableBudgetTotal + savingsTotal)}</span></div>
            </div>

            {/* 支出の記録 */}
            <div className="card">
              <SectionHeader icon={Plus} title="支出を記録する" />
              <div className="expense-form">
                <input type="date" name="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                <select name="category" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {VARIABLE_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <AmountInput name="amount" className="" placeholder="金額" value={form.amount} onKeyDown={handleEnterKey}
                  onChange={v => setForm(f => ({ ...f, amount: v }))} />
                <input type="text" name="memo" placeholder="メモ（任意）" value={form.memo} onKeyDown={handleEnterKey}
                  onChange={e => setForm(f => ({ ...f, memo: e.target.value }))} />
                <button type="button" className="add-btn" onClick={addExpense}><Plus size={15} /> 追加する</button>
              </div>
              <div className="list-hint">記録をタップすると、日付・金額などを直せます</div>
              <div className="expense-list">
                {monthExpenses.length === 0 ? (
                  <div className="empty-note">この月の記録はまだありません</div>
                ) : monthExpenses.map(e => (
                  <ExpenseItem key={e.id} e={e} showCategory onSave={saveExpense} onDelete={removeExpense} />
                ))}
              </div>
            </div>

            {/* 推移グラフ */}
            <div className="card">
              <SectionHeader icon={TrendingUp} title="支出の推移（直近6か月）" />
              <ResponsiveContainer width="100%" height={210}>
                <ComposedChart data={monthlyTrend} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#DED2B4" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#5B6478" }} axisLine={{ stroke: "#DED2B4" }} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#5B6478" }} axisLine={false} tickLine={false} width={50}
                    tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                  <Tooltip content={<TrendTooltip />} cursor={{ fill: "rgba(34,48,74,0.05)" }} />
                  <Bar dataKey="fixed" name="固定費" stackId="a" fill={TREND_COLORS.fixed} barSize={24} />
                  <Bar dataKey="variable" name="変動費" stackId="a" fill={TREND_COLORS.variable} barSize={24} />
                  <Bar dataKey="savings" name="貯蓄" stackId="a" fill={TREND_COLORS.savings} barSize={24} radius={[3, 3, 0, 0]} />
                  <Line dataKey="budget" name="予算" stroke={TREND_COLORS.budget} strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="trend-legend">
                <span><i className="dot" style={{ background: TREND_COLORS.fixed }} />固定費</span>
                <span><i className="dot" style={{ background: TREND_COLORS.variable }} />変動費</span>
                <span><i className="dot" style={{ background: TREND_COLORS.savings }} />貯蓄</span>
                <span><i className="dash" />予算</span>
              </div>
              <div className="trend-total">
                {selectedMonth.slice(5).replace(/^0/, "")}月：固定費 ¥{yen(fixedActualTotal)} ＋ 変動費 ¥{yen(variableActualTotal)} ＋ 貯蓄 ¥{yen(savingsTotal)} ＝ <b>¥{yen(actualTotal)}</b>
              </div>
            </div>

            {/* 内訳グラフ */}
            {pieData.length > 0 && (
              <div className="card">
                <SectionHeader icon={Receipt} title="支出の内訳" />
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                      {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v) => `¥${yen(v)}`} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* 口座残高 */}
            <div className="card">
              <SectionHeader icon={Landmark} title="口座残高" />
              {BALANCE_FIELDS.map(f => (
                <LedgerRow key={f.key} label={f.label}>
                  <AmountInput value={monthData.balances[f.key]} onChange={(v) => updateSection("balances", f.key, v)} />
                </LedgerRow>
              ))}
              <div className="total-row"><span>合計</span><span className="ledger-value">¥{yen(balanceTotal)}</span></div>
            </div>

            {/* メモ */}
            <div className="card">
              <SectionHeader icon={NotebookPen} title="メモ" />
              <textarea className="notes" placeholder="カード引き落とし予定額、目標残高など自由にメモできます"
                value={monthData.notes} onChange={(e) => updateNotes(e.target.value)} />
            </div>

            {/* バックアップ */}
            <div className="card backup-card">
              <button type="button" className="backup-toggle" onClick={() => setBackupOpen(o => !o)}>
                <span className="section-header" style={{ marginBottom: 0 }}><Save size={16} strokeWidth={2} /><span>バックアップ・復元</span></span>
                {backupOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {backupOpen && (
                <>
                  <p className="backup-desc">全期間のデータをファイルに保存できます（念のための控え）。</p>
                  <button type="button" className="backup-btn" onClick={exportBackup}>データを書き出す</button>
                  <div style={{ height: 14 }} />
                  <ImportBox onImport={importDump} intro="書き出したデータを貼り付ける（またはファイルを選ぶ）と、このアプリに反映されます。同じ記録は重複しません。" />
                </>
              )}
            </div>

            <div className="account-row">
              <span>{email}</span>
              <button type="button" className="print-btn" onClick={() => { if (window.confirm("ログアウトしますか？")) db.signOut(); }}>
                <LogOut size={13} /><span>ログアウト</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
