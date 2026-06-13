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

    let rawPrice = priceData?.regularMarketPrice?.raw ?? 0;
    let rawHigh = summaryDetail?.fiftyTwoWeekHigh?.raw ?? rawPrice;
    let rawDividend = summaryDetail?.dividendRate?.raw ?? 0;
    
    // 米国株（USD）の場合は最新の為替レート（USD/JPY）で円換算する
    let exchangeRate = 1;
    if (priceData?.currency === 'USD') {
      try {
        const rateUrl = `https://query1.finance.yahoo.com/v11/finance/quoteSummary/USDJPY=X?modules=price`;
        const rateRes = await fetch(rateUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          next: { revalidate: 3600 } // 為替は1時間キャッシュ
        });
        if (rateRes.ok) {
          const rateData = await rateRes.json();
          const fetchedRate = rateData?.quoteSummary?.result?.[0]?.price?.regularMarketPrice?.raw;
          if (fetchedRate) {
            exchangeRate = fetchedRate;
          }
        }
      } catch (err) {
        console.warn('Failed to fetch exchange rate:', err);
      }
    }

    const price = rawPrice * exchangeRate;
    const high_3m = rawHigh * exchangeRate;
    const dividend = rawDividend * exchangeRate;

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
