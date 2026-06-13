// ========================
// 型定義（データの設計図）
// ========================

/** ポートフォリオの銘柄1件 */
export interface Stock {
  id: string;
  user_id: string;
  symbol: string;       // 銘柄コード（例: 7956）
  name: string;         // 銘柄名（例: ピジョン）
  avg_price: number;    // 平均取得単価（円）
  shares: number;       // 保有株数
  account_type?: string;// 口座区分（例: 特定口座, NISA成長投資枠など）
  is_target: boolean;   // 買い増し対象か
  memo?: string;        // メモ（例: 優待目的、高値注意など）
  created_at: string;
}

/** 株価キャッシュ（APIから取得したデータ） */
export interface PriceData {
  symbol: string;
  price: number;        // 現在株価
  high_3m: number;      // 3か月高値
  dividend: number;     // 予定配当金（年額）
  updated_at: string;
}

/** 買い判定の結果 */
export type JudgeResult = '○' | '△' | '×';

/** 銘柄ごとの判定詳細 */
export interface StockJudgement {
  stock: Stock;
  price: PriceData;
  drop_from_high: number;       // 3か月高値からの下落率（%）
  drop_from_avg: number;        // 平均取得単価からの下落率（%）
  dividend_yield: number;       // 配当利回り（%）
  priority_score: number;       // 優先度スコア（高いほど優先）
  judge: JudgeResult;
  is_surplus_candidate: boolean; // 余剰資金投入候補か
  judge_reason: string;         // 判定理由の説明文
}

/** 月予算設定 */
export interface BudgetSettings {
  user_id: string;
  monthly_budget: number;       // 月予算（円）
  rollover_enabled: boolean;    // 繰越ON/OFF
  rollover_limit: number;       // 繰越上限（円）
  current_budget: number;       // 今月の残り予算（円）
  updated_at: string;
}

/** アプリ全体の設定 */
export interface AppSettings {
  demo_mode: boolean;           // デモモードか
  judge_time_start: number;     // 判定開始時刻（時）例: 11
  judge_time_end: number;       // 判定終了時刻（時）例: 14
  drop_high_threshold: number;  // 3か月高値からの下落率閾値（例: -5）
  drop_avg_threshold: number;   // 平均取得単価からの下落率閾値（例: -7）
  surplus_threshold: number;    // 余剰資金投入閾値（例: -15）
  supabase_url: string;
  supabase_anon_key: string;
  stock_api_key: string;
  line_token: string;
  updated_at: string;
}

/** チャート表示用の買いポイント */
export interface BuyPoint {
  date: string;
  price: number;
  type: 'normal' | 'surplus'; // 通常買い or 余剰資金候補
  drop_from_high: number;
  drop_from_avg: number;
  reason: string;
}

/** チャート表示用の株価履歴 */
export interface ChartDataPoint {
  date: string;
  price: number;
  buyPoint?: BuyPoint;
}
