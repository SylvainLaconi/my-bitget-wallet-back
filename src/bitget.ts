import WebSocket from 'ws';
import crypto from 'crypto';
import { BitgetCoin, BitgetCoinSchema } from './schemas/bitget-coin';

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
      const preSign = timestamp + 'GET' + '/user/verify';
      const sign = crypto.createHmac('sha256', apiSecret).update(preSign).digest('base64');

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
