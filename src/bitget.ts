import WebSocket from 'ws';
import { BitgetCoin, BitgetCoinSchema } from './schemas/bitget-coin';
import { getBitgetSignature } from './utils/bitget-signature';

const WS_URL = 'wss://ws.bitget.com/v2/ws/private';
const RECONNECT_DELAY = 1000; // 1 seconde
const PING_INTERVAL = 30_000; // 30 sec

type SnapshotPayload = { snapshot: BitgetCoin[] };
type UpdatePayload = { update: BitgetCoin };

export type BitgetWalletPayload = SnapshotPayload | UpdatePayload;

export function connectBitgetWallet(
  userId: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  onMessage: (payload: BitgetWalletPayload) => void,
  onClose: () => void,
) {
  let ws: WebSocket;
  let isFirstSnapshot = true;

  const connect = () => {
    ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      console.info('✅ Connected to Bitget Private WebSocket');

      const timestamp = Date.now().toString();
      const sign = getBitgetSignature(apiSecret, timestamp, 'GET', '/user/verify');

      // 🔐 Login
      ws.send(
        JSON.stringify({
          op: 'login',
          args: [
            {
              apiKey,
              passphrase,
              timestamp,
              sign,
            },
          ],
        }),
      );
    });

    ws.on('message', (raw) => {
      const msg = raw.toString();

      if (msg === 'pong' || msg === 'ping') return; // ignore keepalive

      try {
        const data = JSON.parse(msg);

        // 🔑 Login OK → subscribe au compte SPOT
        if (data.event === 'login' && data.code === 0) {
          ws.send(
            JSON.stringify({
              op: 'subscribe',
              args: [{ channel: 'account', instType: 'SPOT', coin: 'default' }],
            }),
          );
          return;
        }

        // 📡 Confirmation subscription
        if (data.event === 'subscribe') {
          console.info('📩 Subscribed to:', data.arg || data.args);
          return;
        }

        // 💰 Données du channel account
        if (data.arg?.channel === 'account' && Array.isArray(data.data)) {
          if (isFirstSnapshot) {
            isFirstSnapshot = false;

            // --- snapshot complet ---
            const coins: BitgetCoin[] = data.data
              .map((coinRaw: any) => {
                const parsed = BitgetCoinSchema.safeParse({ ...coinRaw, userId });
                return parsed.success ? parsed.data : null;
              })
              .filter(Boolean) as BitgetCoin[];

            onMessage({ snapshot: coins });
          } else {
            // --- updates unitaires ---
            data.data.forEach((coinRaw: any) => {
              const parsed = BitgetCoinSchema.safeParse({ ...coinRaw, userId });
              if (parsed.success) {
                onMessage({ update: parsed.data });
              } else {
                console.warn('❌ Invalid coin data', parsed.error);
              }
            });
          }
        }
      } catch (error) {
        console.error('Error parsing Bitget WS message:', error);
      }
    });

    ws.on('close', () => {
      console.info('⚠️ Bitget WebSocket closed, reconnecting...');
      setTimeout(() => connect(), RECONNECT_DELAY);
      onClose();
    });

    ws.on('error', (err) => {
      console.error('❌ Bitget WebSocket error:', err);
      ws.close();
    });

    // Keep-alive ping
    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping');
    }, PING_INTERVAL);
  };

  connect();
}

// connectPublicTickers.ts
export function connectPublicTickers(symbols: string[], onPrice: (ticker: any) => void) {
  const ws = new WebSocket('wss://ws.bitget.com/v2/ws/public');

  ws.on('open', () => {
    console.info('✅ Connected to Bitget Public WebSocket');
    ws.send(
      JSON.stringify({
        op: 'subscribe',
        args: symbols.map((s) => ({
          instType: 'SPOT',
          channel: 'ticker',
          instId: s, // ex: "BTCUSDT"
        })),
      }),
    );
  });

  ws.on('message', (raw) => {
    const msg = raw.toString();

    if (msg === 'pong' || msg === 'ping') return; // ignore keepalive

    const data = JSON.parse(msg);

    if (data.event === 'subscribe') {
      console.info('📩 Subscribed to:', data.arg || data.args);
      return;
    }

    if (data.arg?.channel === 'ticker' && data.data?.length) {
      onPrice(data.data[0]);
    }
  });

  ws.on('close', () => console.info('Public WS closed'));
}

export async function getEarnQuantity(
  coin: string,
  apiKey: string,
  apiSecret: string,
  passphrase: string,
) {
  const timestamp = Date.now().toString();
  const method = 'GET';
  const requestPath = `/api/v2/earn/account/assets?coin=${coin}`;
  const sign = getBitgetSignature(apiSecret, timestamp, method, requestPath);

  const res = await fetch(`https://api.bitget.com${requestPath}`, {
    method,
    headers: {
      'ACCESS-KEY': apiKey,
      'ACCESS-SIGN': sign,
      'ACCESS-PASSPHRASE': passphrase,
      'ACCESS-TIMESTAMP': timestamp,
      // locale: 'en-US',
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();
  // data.data est un tableau d'objets { coin, availableAmount, ... }
  return data.data || [];
}
