import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
  }

  try {
    // 3ヶ月分の日足データを取得
    const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=3mo&interval=1d`;
    const res = await fetch(yfUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      next: { revalidate: 1800 } // チャートデータは30分間キャッシュ
    });

    if (!res.ok) {
      throw new Error(`Yahoo Finance API returned status ${res.status}`);
    }

    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) {
      throw new Error('No data found for this symbol');
    }

    const meta = result.meta;
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const highs = result.indicators?.quote?.[0]?.high || [];
    const currency = meta.currency || (symbol.endsWith('.T') ? 'JPY' : 'USD');

    // 時系列のデータを整形
    const chartPoints = timestamps.map((ts: number, idx: number) => {
      const date = new Date(ts * 1000).toISOString().slice(0, 10);
      return {
        date,
        price: closes[idx] ?? null,
        high: highs[idx] ?? null,
      };
    }).filter((p: any) => p.price !== null);

    // USDの場合は過去の為替レートの時系列を取得して各営業日ごとに掛け合わせる
    if (currency === 'USD' && chartPoints.length > 0) {
      try {
        const rateUrl = `https://query1.finance.yahoo.com/v8/finance/chart/USDJPY=X?range=3mo&interval=1d`;
        const rateRes = await fetch(rateUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          next: { revalidate: 3600 }
        });

        if (rateRes.ok) {
          const rateData = await rateRes.json();
          const rateResult = rateData?.chart?.result?.[0];
          const rateTimestamps = rateResult?.timestamp || [];
          const rateCloses = rateResult?.indicators?.quote?.[0]?.close || [];

          // 為替の日付マッピングを作成
          const ratesByDate: Record<string, number> = {};
          rateTimestamps.forEach((ts: number, idx: number) => {
            const date = new Date(ts * 1000).toISOString().slice(0, 10);
            if (rateCloses[idx] !== null && rateCloses[idx] !== undefined) {
              ratesByDate[date] = rateCloses[idx];
            }
          });

          // 各日付の価格を為替レートで乗算する
          // もしその日の為替データがない場合は、直近の有効な為替レートか、最新の為替レートを使う
          let lastValidRate = 150; // デフォルトフォールバック
          // 最新レートを探索してデフォルトを更新
          const validRates = Object.values(ratesByDate);
          if (validRates.length > 0) {
            lastValidRate = validRates[validRates.length - 1];
          }

          chartPoints.forEach((pt: any) => {
            const rate = ratesByDate[pt.date] ?? lastValidRate;
            pt.price = Math.round(pt.price * rate * 100) / 100;
            if (pt.high !== null) {
              pt.high = Math.round(pt.high * rate * 100) / 100;
            }
            lastValidRate = rate; // 次の欠損日のためのフォールバックを更新
          });
        }
      } catch (err) {
        console.warn('Failed to fetch historical exchange rate:', err);
      }
    }

    return NextResponse.json(chartPoints);
  } catch (error: any) {
    console.error(`[api/stock/chart] Error fetching ${symbol}:`, error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
