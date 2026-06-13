/**
 * 買い増し判定ロジック
 * 仕様書のロジックをそのまま実装しています
 */

import { Stock, PriceData, StockJudgement, JudgeResult, AppSettings } from './types';

/**
 * 1銘柄の買い増し判定を行う
 */
export function judgeStock(
  stock: Stock,
  price: PriceData,
  settings: AppSettings,
  hasBudget: boolean
): StockJudgement {
  // 3か月高値からの下落率（%）
  const drop_from_high = price.high_3m > 0
    ? ((price.price - price.high_3m) / price.high_3m) * 100
    : 0;

  // 平均取得単価からの下落率（%）
  const drop_from_avg = stock.avg_price > 0
    ? ((price.price - stock.avg_price) / stock.avg_price) * 100
    : 0;

  // 配当利回り（%）
  const dividend_yield = price.price > 0 && price.dividend > 0
    ? (price.dividend / price.price) * 100
    : 0;

  // 優先度スコア：下落率が大きいほど高い（±補正で利回りも加味）
  // ※利回りは補助指標として0.2倍で加算
  const priority_score =
    Math.abs(drop_from_high) * 0.4 +
    Math.abs(drop_from_avg) * 0.4 +
    dividend_yield * 0.2;

  // 余剰資金投入候補判定（平均取得単価から surplus_threshold% 以上の下落）
  let is_surplus_candidate = drop_from_avg <= settings.surplus_threshold;

  // 買い条件チェック
  const meets_high_condition = drop_from_high <= settings.drop_high_threshold;
  let meets_avg_condition = drop_from_avg <= settings.drop_avg_threshold;

  if (stock.is_watchlist) {
    meets_avg_condition = drop_from_avg <= 0; // 検討中銘柄は、現在値が目標単価以下なら買いOK
    is_surplus_candidate = false; // 余剰資金投入候補からは外す
  }

  const can_buy = meets_high_condition || meets_avg_condition;

  let judge: JudgeResult;
  let judge_reason: string;

  if (!hasBudget) {
    judge = '×';
    judge_reason = '月予算が残っていません。設定から予算を追加してください。';
  } else if (is_surplus_candidate) {
    judge = '○';
    judge_reason = `💰 余剰資金投入候補！平均取得単価から${drop_from_avg.toFixed(1)}%下落中。`;
  } else if (can_buy) {
    judge = '○';
    if (meets_avg_condition && meets_high_condition) {
      judge_reason = stock.is_watchlist 
        ? `✅ 目標達成！3か月高値から${drop_from_high.toFixed(1)}%、目標単価を下回っています。`
        : `✅ 買いOK！3か月高値から${drop_from_high.toFixed(1)}%、平均単価から${drop_from_avg.toFixed(1)}%下落。`;
    } else if (meets_avg_condition) {
      judge_reason = stock.is_watchlist
        ? `✅ 目標達成！目標単価を下回っています。`
        : `✅ 買いOK！平均取得単価から${drop_from_avg.toFixed(1)}%下落中。`;
    } else {
      judge_reason = `✅ 買いOK！3か月高値から${drop_from_high.toFixed(1)}%下落中。`;
    }
  } else if (
    drop_from_high <= settings.drop_high_threshold + 2 ||
    drop_from_avg <= settings.drop_avg_threshold + 2
  ) {
    // 条件まであと少し
    judge = '△';
    judge_reason = `⚠️ もう少し。高値から${drop_from_high.toFixed(1)}%、平均単価から${drop_from_avg.toFixed(1)}%下落。`;
  } else {
    judge = '×';
    judge_reason = `📈 買い条件未達。高値から${drop_from_high.toFixed(1)}%、平均単価から${drop_from_avg.toFixed(1)}%下落。`;
  }

  return {
    stock,
    price,
    drop_from_high,
    drop_from_avg,
    dividend_yield,
    priority_score,
    judge,
    is_surplus_candidate,
    judge_reason,
  };
}

/**
 * 複数銘柄を一括判定し、優先度順（priority_score降順）に並べる
 */
export function judgeAllStocks(
  stocks: Stock[],
  prices: Record<string, PriceData>,
  settings: AppSettings,
  currentBudget: number
): StockJudgement[] {
  const hasBudget = currentBudget > 0;

  const judgements = stocks
    .filter(s => s.is_target)
    .map(stock => {
      const price = prices[stock.symbol];
      if (!price) return null;
      return judgeStock(stock, price, settings, hasBudget);
    })
    .filter((j): j is StockJudgement => j !== null);

  // 判定結果でソート: ○ → △ → × の順、同じ判定内は priority_score 降順
  return judgements.sort((a, b) => {
    const order: Record<JudgeResult, number> = { '○': 0, '△': 1, '×': 2 };
    if (order[a.judge] !== order[b.judge]) {
      return order[a.judge] - order[b.judge];
    }
    return b.priority_score - a.priority_score;
  });
}

/**
 * 現在の時刻が判定時間帯（例: 11〜14時）かどうか確認する
 */
export function isJudgeTimeNow(startHour: number, endHour: number): boolean {
  const now = new Date();
  const hour = now.getHours();
  return hour >= startHour && hour < endHour;
}
