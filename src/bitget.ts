import WebSocket from 'ws';
import crypto from 'crypto';
import { BitgetCoin, BitgetCoinSchema } from './schemas/bitget-coin';

const WS_URL = 'wss://ws.bitget.com/v2/ws/private';
const RECONNECT_DELAY = 1000; // 1 seconde
const PING_INTERVAL = 30_000; // 30 sec

export function connectBitgetWallet(onMessage: (data: BitgetCoin & { userId: string }) => void) {
  let ws: WebSocket;

  const connect = () => {
    ws = new WebSocket(WS_URL);

    ws.on('open', () => {
      console.log('Connected to Bitget Private WebSocket');

      const timestamp = Date.now().toString();
      const preSign = timestamp + 'GET' + '/user/verify';

      const sign = crypto
        .createHmac('sha256', process.env.BITGET_API_SECRET!)
        .update(preSign)
        .digest('base64');

      // Login
      ws.send(
        JSON.stringify({
          op: 'login',
          args: [
            {
              apiKey: process.env.BITGET_API_KEY!,
              passphrase: process.env.BITGET_API_PASSPHRASE!,
              timestamp,
              sign,
            },
          ],
        }),
      );
    });

    ws.on('message', (raw) => {
      const msg = raw.toString();

      // Ignorer pong/ping qu'on recoit car ce ne sont pas du JSON
      if (msg === 'pong' || msg === 'ping') return;

      try {
        const data = JSON.parse(msg);

        // 1. Login réussi → s'abonner au channel account SPOT
        if (data.event === 'login' && data.code === 0) {
          ws.send(
            JSON.stringify({
              op: 'subscribe',
              args: [
                {
                  channel: 'account',
                  instType: 'SPOT',
                  coin: 'default',
                },
              ],
            }),
          );
          return;
        }

        // 2. Confirmation de subscribe
        if (data.event === 'subscribe') {
          console.log('Subscribed to:', data.arg || data.args);
          return;
        }

        // 3. Données du channel "account"
        if (data.arg?.channel === 'account' && Array.isArray(data.data)) {
          data.data.forEach((coinRaw: any) => {
            const parseResult = BitgetCoinSchema.safeParse({
              ...coinRaw,
              userId: data.arg?.userId,
            });
            if (parseResult.success) {
              onMessage({ ...parseResult.data, userId: data.arg?.userId });
            } else {
              console.warn('Invalid coin data ❌', parseResult.error);
            }
          });
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });

    ws.on('close', () => {
      console.log('Bitget WebSocket closed, reconnecting...');
      setTimeout(() => connect, RECONNECT_DELAY);
    });

    ws.on('error', (err) => {
      console.error('Bitget WebSocket error:', err);
      ws.close();
    });

    setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping');
    }, PING_INTERVAL);
  };

  connect();
}
