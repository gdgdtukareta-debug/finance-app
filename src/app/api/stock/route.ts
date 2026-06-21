import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol is required' }, { status: 400 });
  }

  try {
    const apiKey = searchParams.get('apiKey');

    // Yahoo Finance v8 chart API を利用する (1年分のデータを取得して配当と3ヶ月高値を算出)
    // 例: https://query1.finance.yahoo.com/v8/finance/chart/7956.T?range=1y&interval=1d&events=div
    const yfUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=1y&interval=1d&events=div`;
    
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
    const result = data?.chart?.result?.[0];
    if (!result) {
      throw new Error('No data found for this symbol');
    }

    const meta = result.meta;
    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const highs = quote.high || [];
    const closes = quote.close || [];

    // 1. 現在値の算出 (最後の有効な終値、または meta.regularMarketPrice)
    let rawPrice = meta.regularMarketPrice ?? 0;
    if (rawPrice === 0 && closes.length > 0) {
      // 配列の末尾から有効な終値を探す
      for (let i = closes.length - 1; i >= 0; i--) {
        if (closes[i] !== null && closes[i] !== undefined) {
          rawPrice = closes[i];
          break;
        }
      }
    }

    // 2. 3ヶ月高値の算出 (直近90日間のデータから算出)
    const threeMonthsAgoSec = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
    let rawHigh3m = 0;
    let foundHigh = false;

    for (let i = 0; i < timestamps.length; i++) {
      if (timestamps[i] >= threeMonthsAgoSec) {
        const h = highs[i];
        if (h !== null && h !== undefined) {
          if (h > rawHigh3m) {
            rawHigh3m = h;
            foundHigh = true;
          }
        }
      }
    }

    // 万が一、3ヶ月以内の高値が取得できなかった場合のフォールバック (過去全期間の最高値、または現在値)
    if (!foundHigh) {
      const validHighs = highs.filter((h: any) => h !== null && h !== undefined);
      rawHigh3m = validHighs.length > 0 ? Math.max(...validHighs) : rawPrice;
    }

    // 3. 過去1年の予定配当金の算出
    let rawDividend = 0;
    const dividends = result.events?.dividends;
    if (dividends) {
      // 1年分のデータ（range=1y）を取得しているため、取得できた配当額をすべて合計する
      rawDividend = Object.values(dividends).reduce((sum: number, div: any) => {
        return sum + (div.amount || 0);
      }, 0);
    }

    // 4. APIキーがあり、かつ米国株（.Tがない）の場合は Finnhub API から現在値を取得して上書き
    const currency = meta.currency || (symbol.endsWith('.T') ? 'JPY' : 'USD');
    if (apiKey && currency === 'USD' && !symbol.endsWith('.T')) {
      try {
        const finnhubUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${apiKey}`;
        const finnhubRes = await fetch(finnhubUrl, { next: { revalidate: 300 } });
        if (finnhubRes.ok) {
          const finnhubData = await finnhubRes.json();
          // c: Current Price
          if (finnhubData.c && finnhubData.c > 0) {
            rawPrice = finnhubData.c;
          }
        }
      } catch (err) {
        console.warn('Failed to fetch from Finnhub, using Yahoo data:', err);
      }
    }

    // 米国株（USD）の場合は最新の為替レート（USD/JPY）で円換算する
    let exchangeRate = 1;
    
    if (currency === 'USD') {
      try {
        const rateUrl = `https://query1.finance.yahoo.com/v8/finance/chart/USDJPY=X?range=1d&interval=1d`;
        const rateRes = await fetch(rateUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
          next: { revalidate: 3600 } // 為替は1時間キャッシュ
        });
        if (rateRes.ok) {
          const rateData = await rateRes.json();
          const fetchedRate = rateData?.chart?.result?.[0]?.meta?.regularMarketPrice;
          if (fetchedRate) {
            exchangeRate = fetchedRate;
          }
        }
      } catch (err) {
        console.warn('Failed to fetch exchange rate:', err);
      }
    }

    // 日本円に換算
    const price = Math.round(rawPrice * exchangeRate * 100) / 100;
    const high_3m = Math.round(rawHigh3m * exchangeRate * 100) / 100;
    const dividend = Math.round(rawDividend * exchangeRate * 100) / 100;

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
