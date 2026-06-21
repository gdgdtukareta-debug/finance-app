/**
 * ユーザー別データストア
 * LocalStorage（ブラウザ内の保存領域）を正としつつ、
 * Supabaseが設定されていれば非同期で同期する Local-First アーキテクチャ
 */

import { Stock, PriceData, BudgetSettings, AppSettings } from './types';
import { supabase } from './supabase';

// ==================== ログインユーザーの動的ID管理 ====================
let currentUserId = 'default_user';

export function setUserId(userId: string): void {
  currentUserId = userId || 'default_user';
}

export function getUserId(): string {
  return currentUserId;
}

// ==================== LocalStorageのキー取得（ユーザー毎に分離） ====================
const KEYS = {
  STOCKS: 'finapp_stocks',
  PRICES: 'finapp_prices',
  BUDGET: 'finapp_budget',
  SETTINGS: 'finapp_settings',
  BUY_HISTORY: 'finapp_buy_history',
};

function getKey(baseKey: string): string {
  return `${baseKey}_${currentUserId}`;
}

// ==================== デフォルト設定 ====================
export const DEFAULT_SETTINGS: AppSettings = {
  demo_mode: true,
  judge_time_start: 11,
  judge_time_end: 14,
  drop_high_threshold: -5,
  drop_avg_threshold: -7,
  surplus_threshold: -15,
  supabase_url: '',
  supabase_anon_key: '',
  stock_api_key: '',
  line_token: '',
  line_user_id: '',
  updated_at: new Date().toISOString(),
};

export function getDefaultBudget(): BudgetSettings {
  return {
    user_id: currentUserId,
    monthly_budget: 0,
    rollover_enabled: false,
    rollover_limit: 10000,
    current_budget: 0,
    updated_at: new Date().toISOString(),
  };
}

// ==================== デモ用サンプルデータ ====================
export const DEMO_STOCKS: Stock[] = [
  {
    id: 'demo-1',
    user_id: 'default_user',
    symbol: '7956',
    name: 'ピジョン',
    avg_price: 1800,
    shares: 100,
    is_target: true,
    is_watchlist: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-2',
    user_id: 'default_user',
    symbol: '7267',
    name: 'ホンダ',
    avg_price: 3500,
    shares: 50,
    is_target: true,
    is_watchlist: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-3',
    user_id: 'default_user',
    symbol: '9984',
    name: 'ソフトバンクグループ',
    avg_price: 6800,
    shares: 30,
    is_target: true,
    is_watchlist: false,
    created_at: new Date().toISOString(),
  },
];

// ==================== 読み込み・保存ユーティリティ ====================
function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(getKey(key));
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getKey(key), JSON.stringify(data));
}

// 価格キャッシュのみユーザー共通で利用可能にする（銘柄の現在株価はユーザーごとに変わらないため）
function loadPriceCache(fallback: Record<string, PriceData>): Record<string, PriceData> {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(KEYS.PRICES);
    if (!raw) return fallback;
    return JSON.parse(raw) as Record<string, PriceData>;
  } catch {
    return fallback;
  }
}

function savePriceCacheRaw(data: Record<string, PriceData>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEYS.PRICES, JSON.stringify(data));
}

// ==================== Supabase 同期ユーティリティ ====================

// 起動時にSupabaseからデータを取得してローカルを更新する
export async function syncFromSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || currentUserId === 'default_user') return;

  try {
    const [{ data: stocksData }, { data: budgetData }, { data: settingsData }] = await Promise.all([
      supabase.from('stocks').select('*').eq('user_id', currentUserId),
      supabase.from('budget_settings').select('*').eq('user_id', currentUserId).maybeSingle(),
      supabase.from('app_settings').select('*').eq('user_id', currentUserId).maybeSingle()
    ]);

    if (stocksData && stocksData.length > 0) save(KEYS.STOCKS, stocksData);
    if (budgetData) save(KEYS.BUDGET, budgetData);
    if (settingsData) {
      // settings から supabase 関連のキーを除外し、環境変数と混ざらないようにマージ
      save(KEYS.SETTINGS, { ...DEFAULT_SETTINGS, ...settingsData });
    }
  } catch (error) {
    console.error('Supabaseからの同期に失敗しました:', error);
  }
}

// ==================== 銘柄（ポートフォリオ）管理 ====================

export function getStocks(): Stock[] {
  const stocks = load<Stock[]>(KEYS.STOCKS, []);
  if (stocks.length === 0 && currentUserId === 'default_user') {
    save(KEYS.STOCKS, DEMO_STOCKS);
    return DEMO_STOCKS;
  }
  // 下位互換性のため is_watchlist が無ければ false にする
  return stocks.map(s => ({ ...s, is_watchlist: s.is_watchlist ?? false }));
}

export function saveStock(stock: Stock): void {
  const stocks = getStocks();
  const idx = stocks.findIndex(s => s.symbol === stock.symbol);
  
  const updatedStock = { ...stock, user_id: currentUserId };

  if (idx >= 0) {
    stocks[idx] = updatedStock;
  } else {
    stocks.push(updatedStock);
  }
  save(KEYS.STOCKS, stocks);

  // Supabaseへ非同期保存
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && currentUserId !== 'default_user') {
    supabase.from('stocks').upsert(updatedStock, { onConflict: 'id' }).then(({ error }) => {
      if (error) console.error('Supabase保存エラー:', error);
    });
  }
}

export function deleteStock(symbol: string): void {
  const stocks = getStocks();
  const stockToDelete = stocks.find(s => s.symbol === symbol);
  const newStocks = stocks.filter(s => s.symbol !== symbol);
  save(KEYS.STOCKS, newStocks);

  // Supabaseから非同期削除
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && stockToDelete && currentUserId !== 'default_user') {
    supabase.from('stocks').delete().eq('id', stockToDelete.id).then(({ error }) => {
      if (error) console.error('Supabase削除エラー:', error);
    });
  }
}

export function upsertStockFromCSV(
  symbol: string,
  name: string,
  newShares: number,
  newAvgPrice: number,
  accountType?: string,
  memo?: string
): void {
  const stocks = getStocks();
  const existing = stocks.find(s => s.symbol === symbol && s.account_type === accountType);

  let updatedStock: Stock;

  if (existing) {
    const totalCost = existing.avg_price * existing.shares + newAvgPrice * newShares;
    const totalShares = existing.shares + newShares;
    existing.avg_price = Math.round(totalCost / totalShares);
    existing.shares = totalShares;
    existing.name = name;
    if (memo !== undefined) existing.memo = memo;
    updatedStock = existing;
  } else {
    updatedStock = {
      id: `stock-${symbol}-${Date.now()}`,
      user_id: currentUserId,
      symbol,
      name,
      avg_price: newAvgPrice,
      shares: newShares,
      account_type: accountType,
      is_target: false,
      is_watchlist: false,
      memo: memo || '',
      created_at: new Date().toISOString(),
    };
    stocks.push(updatedStock);
  }
  
  save(KEYS.STOCKS, stocks);

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && currentUserId !== 'default_user') {
    supabase.from('stocks').upsert(updatedStock, { onConflict: 'id' }).then(({ error }) => {
      if (error) console.error(error);
    });
  }
}

// ==================== 株価キャッシュ管理 ====================

export function getPriceCache(): Record<string, PriceData> {
  return loadPriceCache({});
}

export function savePriceCache(prices: Record<string, PriceData>): void {
  savePriceCacheRaw(prices);
}

// ==================== 予算管理 ====================

export function getBudget(): BudgetSettings {
  return load<BudgetSettings>(KEYS.BUDGET, getDefaultBudget());
}

export function saveBudget(budget: BudgetSettings): void {
  const updatedBudget = { ...budget, user_id: currentUserId };
  save(KEYS.BUDGET, updatedBudget);
  
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && currentUserId !== 'default_user') {
    supabase.from('budget_settings').upsert(updatedBudget, { onConflict: 'user_id' }).then(({ error }) => {
      if (error) console.error(error);
    });
  }
}

// ==================== アプリ設定管理 ====================

export function getSettings(): AppSettings {
  return load<AppSettings>(KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export function saveSettings(settings: AppSettings): void {
  save(KEYS.SETTINGS, settings);

  if (process.env.NEXT_PUBLIC_SUPABASE_URL && currentUserId !== 'default_user') {
    supabase.from('app_settings').upsert({ ...settings, user_id: currentUserId }, { onConflict: 'user_id' }).then(({ error }) => {
      if (error) console.error(error);
    });
  }
}

// ==================== 月末繰越処理 ====================

export function processMonthlyRollover(): void {
  const budget = getBudget();
  if (!budget.rollover_enabled) return;

  const leftover = budget.current_budget;
  const rollover = Math.min(leftover, budget.rollover_limit);

  budget.current_budget = budget.monthly_budget + rollover;
  budget.updated_at = new Date().toISOString();
  saveBudget(budget);
}
