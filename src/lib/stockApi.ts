/**
 * 株価データ取得モジュール
 * デモモード：リアルな値動きをシミュレーションして返す
 * 本番モード：Yahoo Finance / Finnhub APIから取得
 */

import { PriceData, ChartDataPoint } from './types';
import { getPriceCache, savePriceCache, getSettings } from './db';

// ==================== 株価シミュレーション ====================

/**
 * 日本株の主要銘柄の参考値（デモ用）
 * - price: 参考株価
 * - high_3m_ratio: 3か月高値÷現在値の比率
 * - dividend: 1株あたり年間予定配当金（円）
 *
 * 配当金について：
 * デモモードでは、この一覧に載っている銘柄はここの値を使います。
 * 載っていない銘柄（CSVで新しく追加したものなど）は、
 * 銘柄コードから自動で推定値を生成します（利回り約2〜4%）。
 * 本番モードでは、APIから実際の配当情報を取得します。
 */
const STOCK_DATA: Record<string, { price: number; high_3m_ratio: number; dividend: number }> = {
  // 日用品・消費財
  '7956': { price: 1850, high_3m_ratio: 1.08, dividend: 76 },    // ピジョン
  '4911': { price: 4800, high_3m_ratio: 1.06, dividend: 60 },    // 資生堂
  '4452': { price: 4200, high_3m_ratio: 1.07, dividend: 150 },   // 花王

  // 自動車
  '7267': { price: 1400, high_3m_ratio: 1.07, dividend: 50 },    // ホンダ
  '7203': { price: 2900, high_3m_ratio: 1.08, dividend: 75 },    // トヨタ
  '7974': { price: 7500, high_3m_ratio: 1.10, dividend: 200 },   // 任天堂

  // IT・通信・その他主要銘柄
  '9984': { price: 6320, high_3m_ratio: 1.12, dividend: 22 },    // ソフトバンクグループ
  '9434': { price: 216, high_3m_ratio: 1.06, dividend: 8.6 },    // ソフトバンク
  '9432': { price: 148, high_3m_ratio: 1.05, dividend: 5.2 },    // NTT
  '6758': { price: 11160, high_3m_ratio: 1.09, dividend: 95 },   // ソニーグループ
  '6861': { price: 55000, high_3m_ratio: 1.07, dividend: 250 },  // キーエンス
  '4689': { price: 380, high_3m_ratio: 1.06, dividend: 6 },      // Zホールディングス

  // CSVデモ用追加銘柄
  '2337': { price: 445, high_3m_ratio: 1.05, dividend: 17 },     // いちご
  '3635': { price: 1515, high_3m_ratio: 1.08, dividend: 50 },    // コーエーテクモ
  '4113': { price: 742, high_3m_ratio: 1.06, dividend: 35 },     // 田辺工業
  '4595': { price: 1693, high_3m_ratio: 1.07, dividend: 80 },    // ミズホメディー
  '7841': { price: 1065, high_3m_ratio: 1.06, dividend: 40 },    // 遠藤製作所
  '8729': { price: 139, high_3m_ratio: 1.08, dividend: 5 },      // ソニーフィナンシャル
  '8918': { price: 10, high_3m_ratio: 1.10, dividend: 0 },       // ランド

  // 製薬
  '4502': { price: 3906, high_3m_ratio: 1.05, dividend: 188 },   // 武田薬品工業
  '4503': { price: 1800, high_3m_ratio: 1.06, dividend: 60 },    // アステラス製薬
  '4568': { price: 5200, high_3m_ratio: 1.07, dividend: 75 },    // 第一三共

  // 金融
  '8306': { price: 800, high_3m_ratio: 1.08, dividend: 32 },     // 三菱UFJフィナンシャル
  '8316': { price: 3200, high_3m_ratio: 1.07, dividend: 120 },   // 三井住友フィナンシャル
  '8411': { price: 2800, high_3m_ratio: 1.06, dividend: 100 },   // みずほフィナンシャル

  // 商社
  '8058': { price: 5500, high_3m_ratio: 1.09, dividend: 180 },   // 三菱商事
  '8031': { price: 6000, high_3m_ratio: 1.08, dividend: 160 },   // 三井物産
  '8001': { price: 5800, high_3m_ratio: 1.07, dividend: 170 },   // 伊藤忠商事

  // 食品・飲料
  '2914': { price: 3800, high_3m_ratio: 1.05, dividend: 156 },   // JT
  '2502': { price: 5000, high_3m_ratio: 1.06, dividend: 106 },   // アサヒグループ
  '2503': { price: 4500, high_3m_ratio: 1.05, dividend: 86 },    // キリンホールディングス

  // その他
  '6501': { price: 3200, high_3m_ratio: 1.08, dividend: 80 },    // 日立製作所
  '6902': { price: 2800, high_3m_ratio: 1.07, dividend: 45 },    // デンソー
  '8766': { price: 3500, high_3m_ratio: 1.06, dividend: 110 },   // 東京海上ホールディングス
  '9433': { price: 4600, high_3m_ratio: 1.05, dividend: 135 },   // KDDI
};

/**
 * 銘柄コードからデモ用の参考値を取得する
 * 一覧に無い銘柄（CSVで追加されたもの等）は、
 * 銘柄コードの数字から自動で推定値を生成する
 */
function getStockBaseData(symbol: string): { price: number; high_3m_ratio: number; dividend: number } {
  if (STOCK_DATA[symbol]) return STOCK_DATA[symbol];

  // 未知の銘柄 → 銘柄コードの数字から「それっぽい」値を自動生成
  const code = parseInt(symbol, 10) || 1000;
  const seed = code % 100;
  const price = 1000 + (code % 9000);                  // 1,000〜10,000円くらいの株価
  const high_3m_ratio = 1.04 + (seed % 10) / 100;      // 高値比率 1.04〜1.13
  const dividend = Math.round(price * (0.02 + (seed % 3) / 100)); // 利回り約2〜4%

  return { price, high_3m_ratio, dividend };
}

/** ランダムな値動きを加えたデモ株価を生成 */
function generateDemoPrice(symbol: string): PriceData {
  const base = getStockBaseData(symbol);
  // ±8%のランダムな変動を加える（毎回同じに見えるよう日付シードを使う）
  const today = new Date().toDateString();
  const seed = [...(symbol + today)].reduce((a, c) => a + c.charCodeAt(0), 0);
  const fluctuation = ((seed % 160) - 80) / 1000; // -0.08 〜 +0.08
  const price = Math.round(base.price * (1 + fluctuation));
  const high_3m = Math.round(price * base.high_3m_ratio);

  return {
    symbol,
    price,
    high_3m,
    dividend: base.dividend,
    updated_at: new Date().toISOString(),
  };
}

/** 過去90日分のチャートデータをシミュレーション生成 */
export function generateDemoChart(symbol: string, avgPrice: number): ChartDataPoint[] {
  const base = getStockBaseData(symbol);
  const points: ChartDataPoint[] = [];
  let price = base.price * 1.1; // 90日前は少し高め

  for (let i = 89; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().slice(0, 10);

    // 日ごとにランダムな小さな変動
    const seed = [...(symbol + dateStr)].reduce((a, c) => a + c.charCodeAt(0), 0);
    const change = ((seed % 40) - 20) / 1000;
    price = Math.round(price * (1 + change));

    const drop_from_high = ((price - base.price * base.high_3m_ratio) / (base.price * base.high_3m_ratio)) * 100;
    const drop_from_avg = ((price - avgPrice) / avgPrice) * 100;

    let buyPoint = undefined;
    if (drop_from_high <= -5 || drop_from_avg <= -7) {
      const type = drop_from_avg <= -15 ? 'surplus' : 'normal';
      buyPoint = {
        date: dateStr,
        price,
        type: type as 'normal' | 'surplus',
        drop_from_high,
        drop_from_avg,
        reason: drop_from_avg <= -15
          ? `余剰資金候補: 平均取得単価から${drop_from_avg.toFixed(1)}%下落`
          : drop_from_avg <= -7
          ? `買いOK: 平均取得単価から${drop_from_avg.toFixed(1)}%下落`
          : `買いOK: 3か月高値から${drop_from_high.toFixed(1)}%下落`,
      };
    }

    points.push({ date: dateStr, price, buyPoint });
  }
  return points;
}

// ==================== 株価取得のメイン関数 ====================

/**
 * 指定した銘柄コードの株価データを取得する
 * デモモードではシミュレーション値を返す
 */
export async function fetchPrice(symbol: string): Promise<PriceData> {
  const settings = getSettings();

  if (settings.demo_mode) {
    return generateDemoPrice(symbol);
  }

  // 本番モード: キャッシュを確認（5分以内なら再利用）
  const cache = getPriceCache();
  const cached = cache[symbol];
  if (cached) {
    const updatedAt = new Date(cached.updated_at).getTime();
    const now = Date.now();
    if (now - updatedAt < 5 * 60 * 1000) {
      return cached;
    }
  }

  // Yahoo Finance非公式APIを試みる
  try {
    const suffix = symbol.length === 4 && /^\d+$/.test(symbol) ? '.T' : ''; // 日本株は.Tを付ける
    const ticker = `${symbol}${suffix}`;
    const res = await fetch(`/api/stock?symbol=${ticker}`);
    if (!res.ok) throw new Error('API error');
    const data = await res.json() as PriceData;
    cache[symbol] = data;
    savePriceCache(cache);
    return data;
  } catch {
    // APIエラー時はデモデータにフォールバック
    console.warn(`[stockApi] ${symbol}の株価取得に失敗。デモデータを使用します。`);
    return generateDemoPrice(symbol);
  }
}

/**
 * 複数銘柄の株価を一括取得する
 */
export async function fetchAllPrices(symbols: string[]): Promise<Record<string, PriceData>> {
  const results: Record<string, PriceData> = {};
  await Promise.all(
    symbols.map(async (symbol) => {
      results[symbol] = await fetchPrice(symbol);
    })
  );
  return results;
}
