// データの読み書き（Supabase）
// テーブル: kakeibo_settings / kakeibo_months / kakeibo_expenses（setup.sql 参照）
// 各行は user_id = ログインした本人 のときだけ読み書きできる（RLS）。
import { createClient } from "@supabase/supabase-js";

const cfg = window.KK_CONFIG || {};
export const isMock = !!cfg.mock;

export const supabase = isMock
  ? null
  : createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "kakeibo-auth" },
    });

/* ---------- 動作確認用のモック（本番では使わない） ---------- */
const mock = {
  read() { try { return JSON.parse(localStorage.getItem("kk-mock") || "{}"); } catch { return {}; } },
  write(d) { localStorage.setItem("kk-mock", JSON.stringify(d)); },
};

function check({ error }) { if (error) throw error; }

/* ---------- 認証 ---------- */
export async function getSession() {
  if (isMock) return { user: { id: "mock", email: "demo@example.com" } };
  const { data } = await supabase.auth.getSession();
  return data.session;
}
export function onAuthChange(cb) {
  if (isMock) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_e, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
export async function signIn(email, password) {
  if (isMock) return;
  check(await supabase.auth.signInWithPassword({ email, password }));
}
export async function signOut() {
  if (isMock) return;
  await supabase.auth.signOut();
}

/* ---------- 読み込み（データ量が少ないので全期間まとめて） ---------- */
export async function loadAll() {
  if (isMock) {
    const d = mock.read();
    return { settings: d.settings || null, months: d.months || {}, expenses: d.expenses || [] };
  }
  const [s, m, e] = await Promise.all([
    supabase.from("kakeibo_settings").select("data").maybeSingle(),
    supabase.from("kakeibo_months").select("month,data"),
    supabase.from("kakeibo_expenses").select("id,date,category,amount,memo").order("date", { ascending: false }),
  ]);
  check(s); check(m); check(e);
  const months = {};
  for (const r of m.data || []) months[r.month] = r.data;
  return { settings: s.data ? s.data.data : null, months, expenses: e.data || [] };
}

/* ---------- 保存 ---------- */
export async function saveSettings(data) {
  if (isMock) { const d = mock.read(); d.settings = data; mock.write(d); return; }
  check(await supabase.from("kakeibo_settings").upsert({ data, updated_at: new Date().toISOString() }));
}
export async function saveMonth(month, data) {
  if (isMock) { const d = mock.read(); d.months = { ...(d.months || {}), [month]: data }; mock.write(d); return; }
  check(await supabase.from("kakeibo_months").upsert({ month, data, updated_at: new Date().toISOString() }));
}
function cleanExpense(e) {
  return { id: e.id, date: e.date, category: e.category, amount: Number(e.amount) || 0, memo: e.memo || "" };
}
export async function upsertExpenses(list) {
  if (!list.length) return;
  if (isMock) {
    const d = mock.read(); const cur = d.expenses || [];
    const byId = new Map(cur.map(x => [x.id, x]));
    for (const e of list) byId.set(e.id, cleanExpense(e));
    d.expenses = [...byId.values()]; mock.write(d); return;
  }
  check(await supabase.from("kakeibo_expenses").upsert(list.map(cleanExpense)));
}
export async function deleteExpense(id) {
  if (isMock) { const d = mock.read(); d.expenses = (d.expenses || []).filter(x => x.id !== id); mock.write(d); return; }
  check(await supabase.from("kakeibo_expenses").delete().eq("id", id));
}

/* ---------- バックアップの取り込み ---------- */
export async function importDump(dump) {
  if (dump.settings) await saveSettings(dump.settings);
  for (const [m, data] of Object.entries(dump.months || {})) await saveMonth(m, data);
  await upsertExpenses(dump.expenses || []);
}
