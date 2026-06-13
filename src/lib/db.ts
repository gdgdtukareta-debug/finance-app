/**
 * デモ用データストア
 * LocalStorage（ブラウザ内の保存領域）を使って
 * Supabase（データベース）なしでもアプリが動くようにします。
 */

import { Stock, PriceData, BudgetSettings, AppSettings } from './types';

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
  user_id: 'demo_user',
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
    user_id: 'demo_user',
    symbol: '7956',
    name: 'ピジョン',
    avg_price: 1800,
    shares: 100,
    is_target: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-2',
    user_id: 'demo_user',
    symbol: '7267',
    name: 'ホンダ',
    avg_price: 3500,
    shares: 50,
    is_target: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-3',
    user_id: 'demo_user',
    symbol: '9984',
    name: 'ソフトバンクグループ',
    avg_price: 6800,
    shares: 30,
    is_target: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-4',
    user_id: 'demo_user',
    symbol: '6758',
    name: 'ソニーグループ',
    avg_price: 12000,
    shares: 20,
    is_target: false,
    created_at: new Date().toISOString(),
  },
  {
    id: 'demo-5',
    user_id: 'demo_user',
    symbol: '4502',
    name: '武田薬品工業',
    avg_price: 4200,
    shares: 40,
    is_target: true,
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

// ==================== 銘柄（ポートフォリオ）管理 ====================

export function getStocks(): Stock[] {
  const stocks = load<Stock[]>(KEYS.STOCKS, []);
  if (stocks.length === 0) {
    // 初回はデモデータを自動投入
    save(KEYS.STOCKS, DEMO_STOCKS);
    return DEMO_STOCKS;
  }
  return stocks;
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
}

export function deleteStock(symbol: string): void {
  const stocks = getStocks().filter(s => s.symbol !== symbol);
  save(KEYS.STOCKS, stocks);
}

/**
 * CSV取り込み時の合算ロジック
 * 既存の株がある場合は保有数量を合算して平均取得単価を再計算する
 */
export function upsertStockFromCSV(
  symbol: string,
  name: string,
  newShares: number,
  newAvgPrice: number,
  accountType?: string,
  memo?: string
): void {
  const stocks = getStocks();
  // 同一銘柄で、かつ口座区分も同じもの（または両方未指定）を探す
  const existing = stocks.find(s => s.symbol === symbol && s.account_type === accountType);

  if (existing) {
    // 合算して平均取得単価を再計算
    const totalCost = existing.avg_price * existing.shares + newAvgPrice * newShares;
    const totalShares = existing.shares + newShares;
    existing.avg_price = Math.round(totalCost / totalShares);
    existing.shares = totalShares;
    existing.name = name; // 銘柄名も更新
    if (memo !== undefined) {
      existing.memo = memo; // 明示的に渡された場合のみ更新
    }
    save(KEYS.STOCKS, stocks);
  } else {
    const newStock: Stock = {
      id: `stock-${symbol}-${Date.now()}`,
      user_id: 'demo_user',
      symbol,
      name,
      avg_price: newAvgPrice,
      shares: newShares,
      account_type: accountType,
      is_target: false, // デフォルトオフ（対象外）にする
      memo: memo || '',
      created_at: new Date().toISOString(),
    };
    stocks.push(newStock);
    save(KEYS.STOCKS, stocks);
  }
}

/**
 * 買い増し後の平均取得単価の再計算
 */
export function recalcAvgPrice(symbol: string, buyPrice: number, buyShares: number): void {
  const stocks = getStocks();
  const stock = stocks.find(s => s.symbol === symbol);
  if (!stock) return;

  const totalCost = stock.avg_price * stock.shares + buyPrice * buyShares;
  const totalShares = stock.shares + buyShares;
  stock.avg_price = Math.round(totalCost / totalShares);
  stock.shares = totalShares;
  save(KEYS.STOCKS, stocks);
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
}

// ==================== アプリ設定管理 ====================

export function getSettings(): AppSettings {
  return load<AppSettings>(KEYS.SETTINGS, DEFAULT_SETTINGS);
}

export function saveSettings(settings: AppSettings): void {
  save(KEYS.SETTINGS, settings);
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
