import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { judgeAllStocks } from '@/lib/judge';
import { AppSettings, Stock, BudgetSettings } from '@/lib/types';

// Webhook内ではサーバーサイドで直接Supabaseを操作するため、環境変数から新たにクライアントを作成します。
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServer = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const events = body.events || [];

    // LINEの「検証」リクエスト用
    if (events.length === 0) {
      return NextResponse.json({ status: 'ok' });
    }

    const event = events[0];
    const replyToken = event.replyToken;
    const userId = event.source?.userId;
    const text = event.message?.text?.trim();

    if (!replyToken || !userId) {
      return NextResponse.json({ status: 'ok' });
    }

    // 1. 「ID」や「ユーザーID」と送られた場合、LINEユーザーIDを教える
    if (text && (text.toLowerCase() === 'id' || text.includes('ユーザーID') || text.includes('ユーザーid'))) {
      const messageText = `あなたのLINEユーザーIDは以下です：\n\n${userId}\n\nこのIDをコピーして、アプリの設定画面にある「LINEユーザーID」欄に入力して保存してください。`;
      await replyToLine(replyToken, messageText, userId);
      return NextResponse.json({ status: 'ok' });
    }

    // 2. 「判定」などのメッセージが送られた場合、そのユーザーの判定結果を返信する
    // 2.1 まず、Supabaseの app_settings テーブルから line_user_id が一致するユーザーを検索
    const { data: settingsData, error: settingsError } = await supabaseServer
      .from('app_settings')
      .select('*')
      .eq('line_user_id', userId)
      .maybeSingle();

    if (settingsError || !settingsData) {
      const messageText = `LINEユーザーIDが登録されていません。\n\nアプリの設定画面から、あなたのLINEユーザーID：\n${userId}\nを登録してください。`;
      await replyToLine(replyToken, messageText, userId);
      return NextResponse.json({ status: 'ok' });
    }

    const appUserUuid = settingsData.user_id;
    const userSettings = settingsData as AppSettings;
    const lineToken = userSettings.line_token;

    if (!lineToken) {
      const messageText = `アプリの設定画面で「LINE チャンネルアクセストークン」が登録されていません。設定をご確認ください。`;
      await replyToLine(replyToken, messageText, userId, lineToken);
      return NextResponse.json({ status: 'ok' });
    }

    // 2.2 対象ユーザーの銘柄データと予算データを取得
    const [{ data: stocksData }, { data: budgetData }] = await Promise.all([
      supabaseServer.from('stocks').select('*').eq('user_id', appUserUuid),
      supabaseServer.from('budget_settings').select('*').eq('user_id', appUserUuid).maybeSingle()
    ]);

    const targetStocks = (stocksData || []).filter((s: Stock) => s.is_target);

    if (targetStocks.length === 0) {
      const messageText = `買い増し対象の銘柄が登録されていません。アプリの「銘柄」画面からポートフォリオを登録してください。`;
      await replyToLine(replyToken, messageText, userId, lineToken);
      return NextResponse.json({ status: 'ok' });
    }

    // 2.3 各銘柄の現在株価データをアプリ内APIを呼び出して取得する
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https';
    
    const priceDataResults: Record<string, any> = {};
    const apiKeyParam = userSettings.stock_api_key ? `&apiKey=${userSettings.stock_api_key}` : '';

    await Promise.all(
      targetStocks.map(async (stock: Stock) => {
        try {
          const suffix = stock.symbol.length === 4 && /^\d+$/.test(stock.symbol) ? '.T' : '';
          const ticker = `${stock.symbol}${suffix}`;
          const res = await fetch(`${protocol}://${host}/api/stock?symbol=${ticker}${apiKeyParam}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          if (res.ok) {
            priceDataResults[stock.symbol] = await res.json();
          }
        } catch (err) {
          console.error(`Failed to fetch price for ${stock.symbol} in webhook:`, err);
        }
      })
    );

    // 2.4 買い判定処理の実行
    const currentBudget = budgetData?.current_budget ?? 0;
    const judgements = judgeAllStocks(
      targetStocks,
      priceDataResults,
      userSettings,
      currentBudget
    );

    // 2.5 LINE送信用テキストメッセージの組み立て
    const buyOk = judgements.filter(j => j.judge === '○');
    const watchList = judgements.filter(j => j.judge === '△');

    let replyText = `📊 【買い増し判定結果】\n残り予算: ¥${currentBudget.toLocaleString()}\n\n`;

    if (buyOk.length > 0) {
      replyText += `🟢 買いOK (${buyOk.length}銘柄):\n`;
      buyOk.forEach(j => {
        replyText += `・${j.stock.name} (${j.stock.symbol})\n`;
        replyText += `  現在値: ¥${j.price.price.toLocaleString()}\n`;
        replyText += `  取得単価比: ${j.drop_from_avg.toFixed(1)}%\n`;
        if (j.is_surplus_candidate) {
          replyText += `  ⚠️ 余剰資金候補！\n`;
        }
      });
      replyText += `\n`;
    } else {
      replyText += `🟢 買いOK: なし\n\n`;
    }

    if (watchList.length > 0) {
      replyText += `🟡 様子見 (${watchList.length}銘柄):\n`;
      watchList.forEach(j => {
        replyText += `・${j.stock.name} (${j.stock.symbol}) [¥${j.price.price.toLocaleString()}]\n`;
      });
    } else {
      replyText += `🟡 様子見: なし`;
    }

    await replyToLine(replyToken, replyText, userId, lineToken);
    return NextResponse.json({ status: 'ok' });
  } catch (error: any) {
    console.error('[webhook/line] Error processing webhook:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * LINE Messaging APIで返信する共通関数
 */
async function replyToLine(
  replyToken: string,
  text: string,
  userId: string,
  providedLineToken?: string
) {
  // アクセストークンが提供されていない場合は、一旦オーナー通知用にSupabaseの「最初の設定」からトークンを探すフォールバックを実施
  let channelAccessToken = providedLineToken;
  if (!channelAccessToken) {
    const { data } = await supabaseServer.from('app_settings').select('line_token').neq('line_token', '').limit(1).maybeSingle();
    channelAccessToken = data?.line_token;
  }

  if (!channelAccessToken) {
    console.error('No Line access token found for replying.');
    return;
  }

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${channelAccessToken}`,
      },
      body: JSON.stringify({
        replyToken,
        messages: [
          {
            type: 'text',
            text: text,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('Failed to send reply message to LINE:', errBody);
    }
  } catch (err) {
    console.error('Error calling LINE reply API:', err);
  }
}
