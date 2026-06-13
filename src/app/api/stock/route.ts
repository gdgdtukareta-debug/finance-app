import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
  }

  try {
    // Yahoo Finance の quoteSummary API を利用して株価、52週高値、配当情報を一括で取得する
    // 例: https://query1.finance.yahoo.com/v11/finance/quoteSummary/7956.T?modules=price,summaryDetail
    const yfUrl = `https://query1.finance.yahoo.com/v11/finance/quoteSummary/${symbol}?modules=price,summaryDetail`;
    
    const res = await fetch(yfUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      next: { revalidate: 300 } // 5分間キャッシュ
    });

    if (!res.ok) {
      throw new Error(`Yahoo Finance API returned status ${res.status}`);
    }

    const data = await res.json();
    const result = data?.quoteSummary?.result?.[0];
    if (!result) {
      throw new Error('No data found for this symbol');
    }

    // 各項目をパース
    const priceData = result.price;
    const summaryDetail = result.summaryDetail;

    const price = priceData?.regularMarketPrice?.raw ?? 0;
    
    // 3か月高値の代わりに52週高値を活用（通常、買い増しの目安として安全側に働く指標となります）
    const high_3m = summaryDetail?.fiftyTwoWeekHigh?.raw ?? price;
    
    // 年間予定配当金（1株当たり）
    const dividend = summaryDetail?.dividendRate?.raw ?? 0;

    if (price === 0) {
      throw new Error('Fetched stock price is 0 or invalid');
    }

    return NextResponse.json({
      symbol: symbol.replace('.T', ''),
      price,
      high_3m,
      dividend,
      updated_at: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error(`[api/stock] Error fetching ${symbol}:`, error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
