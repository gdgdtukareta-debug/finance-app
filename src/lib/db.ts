/**
 * デモ用・本番用データストア
 * LocalStorage（ブラウザ内の保存領域）を正としつつ、
 * Supabaseが設定されていれば非同期で同期する Local-First アーキテクチャ
 */

import { Stock, PriceData, BudgetSettings, AppSettings } from './types';
import { supabase } from './supabase';

// ==================== LocalStorageのキー定義 ====================
const KEYS = {
  STOCKS: 'finapp_stocks',
  PRICES: 'finapp_prices',
  BUDGET: 'finapp_budget',
  SETTINGS: 'finapp_settings',
  BUY_HISTORY: 'finapp_buy_history',
};

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
  updated_at: new Date().toISOString(),
};

export const DEFAULT_BUDGET: BudgetSettings = {
  user_id: 'default_user',
  monthly_budget: 0,
  rollover_enabled: false,
  rollover_limit: 10000,
  current_budget: 0,
  updated_at: new Date().toISOString(),
};

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
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
}

// ==================== Supabase 同期ユーティリティ ====================

// 起動時にSupabaseからデータを取得してローカルを更新する
export async function syncFromSupabase() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return; // Supabase未設定時はスキップ

  try {
    const [{ data: stocksData }, { data: budgetData }, { data: settingsData }] = await Promise.all([
      supabase.from('stocks').select('*'),
      supabase.from('budget_settings').select('*').eq('user_id', 'default_user').single(),
      supabase.from('app_settings').select('*').eq('user_id', 'default_user').single()
    ]);

    if (stocksData && stocksData.length > 0) save(KEYS.STOCKS, stocksData);
    if (budgetData) save(KEYS.BUDGET, budgetData);
    if (settingsData) save(KEYS.SETTINGS, settingsData);
  } catch (error) {
    console.error('Supabaseからの同期に失敗しました:', error);
  }
}

// ==================== 銘柄（ポートフォリオ）管理 ====================

export function getStocks(): Stock[] {
  const stocks = load<Stock[]>(KEYS.STOCKS, []);
  if (stocks.length === 0) {
    save(KEYS.STOCKS, DEMO_STOCKS);
    return DEMO_STOCKS;
  }
  // 下位互換性のため is_watchlist が無ければ false にする
  return stocks.map(s => ({ ...s, is_watchlist: s.is_watchlist ?? false }));
}

export function saveStock(stock: Stock): void {
  const stocks = getStocks();
  const idx = stocks.findIndex(s => s.symbol === stock.symbol);
  
  if (idx >= 0) {
    stocks[idx] = stock;
  } else {
    stocks.push(stock);
  }
  save(KEYS.STOCKS, stocks);

  // Supabaseへ非同期保存
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    supabase.from('stocks').upsert(stock, { onConflict: 'id' }).then(({ error }) => {
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
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && stockToDelete) {
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
      user_id: 'default_user',
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

  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    supabase.from('stocks').upsert(updatedStock, { onConflict: 'id' }).then(({ error }) => {
      if (error) console.error(error);
    });
  }
}

// ==================== 株価キャッシュ管理 ====================

export function getPriceCache(): Record<string, PriceData> {
  return load<Record<string, PriceData>>(KEYS.PRICES, {});
}

export function savePriceCache(prices: Record<string, PriceData>): void {
  save(KEYS.PRICES, prices);
}

// ==================== 予算管理 ====================

export function getBudget(): BudgetSettings {
  return load<BudgetSettings>(KEYS.BUDGET, DEFAULT_BUDGET);
}

export function saveBudget(budget: BudgetSettings): void {
  save(KEYS.BUDGET, budget);
  
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    supabase.from('budget_settings').upsert(budget, { onConflict: 'user_id' }).then(({ error }) => {
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

  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    supabase.from('app_settings').upsert({ ...settings, user_id: 'default_user' }, { onConflict: 'user_id' }).then(({ error }) => {
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
