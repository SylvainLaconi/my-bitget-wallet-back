// src/bitget.new.ts
import WebSocket from 'ws';
import { BitgetCoin, BitgetCoinSchema } from './schemas/bitget-coin';
import { BitgetOrder, BitgetOrderSchema } from './schemas/bitget-order';
import { BitgetTicker } from './schemas/bitget-ticker';
import { signWsAuth } from './utils/crypto';
import { getBitgetSignature } from './utils/bitget-signature';

const WS_URL_PRIVATE = 'wss://ws.bitget.com/v2/ws/private';
const WS_URL_PUBLIC = 'wss://ws.bitget.com/v2/ws/public';

const RECONNECT_DELAY = 1000;
const PING_INTERVAL = 30_000;

export type BitgetPayload =
  | { type: 'accountSnapshot'; data: BitgetCoin[] }
  | { type: 'accountUpdate'; data: BitgetCoin }
  | { type: 'ordersSnapshot'; data: BitgetOrder[] }
  | { type: 'ordersUpdate'; data: BitgetOrder }
  | { type: 'ticker'; data: BitgetTicker };

export type Channel = 'account' | 'orders' | 'ticker';

interface ChannelConfig {
  channel: Channel;
  instType: string;
  instId?: string; // required for ticker
  isPrivate?: boolean; // si true → route via WS privé
  coin?: string; // required for account
}

export function connectBitget(
  apiKey: string,
  apiSecret: string,
  passphrase: string,
  channels: ChannelConfig[],
  onMessage: (payload: BitgetPayload) => void,
) {
  // WS séparés
  let privateWs: WebSocket | null = null;
  let publicWs: WebSocket | null = null;
  let privatePing: NodeJS.Timeout | null = null;
  let publicPing: NodeJS.Timeout | null = null;

  // State des subscriptions
  const privateChannels: ChannelConfig[] = channels.filter((c) => c.isPrivate);
  const publicTickers = new Set<string>(
    channels
      .filter((c) => c.channel === 'ticker' && !c.isPrivate)
      .map((c) => c.instId!)
      .filter(Boolean),
  );

  // Helpers pour ignore ping/pong text frames
  const isPingPong = (s: string) => s === 'ping' || s === 'pong';

  // ---------- PRIVATE WS (account/orders) ----------
  const startPrivate = () => {
    if (privateWs) return;
    if (privateChannels.length === 0) return; // aucun channel privé demandé

    privateWs = new WebSocket(WS_URL_PRIVATE);

    privateWs.on('open', () => {
      console.info('[Bitget private WS] open');
      authPrivate();
      subscribePrivateAll();
      startPrivatePing();
    });

    privateWs.on('message', (raw) => {
      try {
        const msgStr = raw.toString();

        if (isPingPong(msgStr)) return;
        const msg = JSON.parse(msgStr);

        // login success (note: code peut être number ou string selon payload)
        if (msg.event === 'login' && (msg.code === 0 || msg.code === '0')) {
          console.info('[Bitget private WS] authenticated');
          return;
        }

        // subscribe confirmation
        if (msg.event === 'subscribe') {
          console.info('[Bitget private WS] subscribed', msg.arg || msg.args);
          return;
        }

        // account channel
        if (msg.arg?.channel === 'account') {
          // certains messages utilisent `action: 'snapshot'/'update'`
          if (msg.action === 'snapshot' || msg.action === 'snapshot') {
            const data = (msg.data || []).map((c: any) => BitgetCoinSchema.parse(c));
            onMessage({ type: 'accountSnapshot', data });
          } else if (msg.action === 'update') {
            const data = BitgetCoinSchema.parse(msg.data[0]);
            onMessage({ type: 'accountUpdate', data });
          }
        }

        // orders channel
        if (msg.arg?.channel === 'orders') {
          if (msg.action === 'snapshot') {
            const data = (msg.data || []).map((o: any) => BitgetOrderSchema.parse(o));
            onMessage({ type: 'ordersSnapshot', data });
          } else if (msg.action === 'update') {
            const data = BitgetOrderSchema.parse(msg.data[0]);
            onMessage({ type: 'ordersUpdate', data });
          }
        }
      } catch (err) {
        console.error('[Bitget private WS] parse error', err);
      }
    });

    privateWs.on('close', () => {
      console.warn('[Bitget private WS] closed — retry in 1s');
      stopPrivatePing();
      privateWs = null;
      setTimeout(startPrivate, RECONNECT_DELAY);
    });

    privateWs.on('error', (err) => {
      console.error('[Bitget private WS] error', err);
      privateWs?.close();
    });
  };

  const authPrivate = () => {
    if (!privateWs) return;
    const { sign, timestamp } = signWsAuth(apiSecret);
    privateWs.send(
      JSON.stringify({
        op: 'login',
        args: [{ apiKey, passphrase, timestamp, sign }],
      }),
    );
  };

  const subscribePrivateAll = () => {
    if (!privateWs || privateWs.readyState !== WebSocket.OPEN) return;

    if (privateChannels.length > 0) {
      const args = privateChannels.map(({ isPrivate, ...ch }) => ch);

      privateWs.send(JSON.stringify({ op: 'subscribe', args }));
      console.info('[Bitget private WS] subscribe', args);
    }
  };

  const startPrivatePing = () => {
    if (privatePing) clearInterval(privatePing);
    privatePing = setInterval(() => {
      if (privateWs?.readyState === WebSocket.OPEN) privateWs.send('ping');
    }, PING_INTERVAL);
  };

  const stopPrivatePing = () => {
    if (privatePing) clearInterval(privatePing);
    privatePing = null;
  };

  // ---------- PUBLIC WS (tickers) ----------
  const startPublic = () => {
    if (publicWs) return;
    // if no ticker requested, still create if we want live subscribe later — optional
    publicWs = new WebSocket(WS_URL_PUBLIC);

    publicWs.on('open', () => {
      console.info('[Bitget public WS] open');
      subscribePublicAll();
      startPublicPing();
    });

    publicWs.on('message', (raw) => {
      try {
        const msgStr = raw.toString();
        if (isPingPong(msgStr)) return;
        const msg = JSON.parse(msgStr);

        if (msg.event === 'subscribe') {
          console.info('[Bitget public WS] subscribed', msg.arg || msg.args);
          return;
        }

        // ticker messages
        if (msg.arg?.channel === 'ticker' && msg.data?.length) {
          onMessage({ type: 'ticker', data: msg.data[0] as BitgetTicker });
        }
      } catch (err) {
        console.error('[Bitget public WS] parse error', err);
      }
    });

    publicWs.on('close', () => {
      console.warn('[Bitget public WS] closed — retry in 1s');
      stopPublicPing();
      publicWs = null;
      setTimeout(startPublic, RECONNECT_DELAY);
    });

    publicWs.on('error', (err) => {
      console.error('[Bitget public WS] error', err);
      publicWs?.close();
    });
  };

  const subscribePublicAll = () => {
    if (!publicWs || publicWs.readyState !== WebSocket.OPEN) return;
    const args = Array.from(publicTickers).map((instId) => ({
      channel: 'ticker',
      instType: 'SPOT',
      instId,
    }));

    if (args.length > 0) {
      publicWs.send(JSON.stringify({ op: 'subscribe', args }));
      console.info('[Bitget public WS] subscribe tickers', args.length);
    }
  };

  const startPublicPing = () => {
    if (publicPing) clearInterval(publicPing);
    publicPing = setInterval(() => {
      if (publicWs?.readyState === WebSocket.OPEN) publicWs.send('ping');
    }, PING_INTERVAL);
  };

  const stopPublicPing = () => {
    if (publicPing) clearInterval(publicPing);
    publicPing = null;
  };

  // ---------- dynamiques (exposées) ----------
  const subscribeTicker = (instId: string) => {
    const id = instId.toUpperCase();
    if (publicTickers.has(id)) return;
    publicTickers.add(id);
    if (!publicWs) startPublic();
    if (publicWs && publicWs.readyState === WebSocket.OPEN) {
      publicWs.send(
        JSON.stringify({
          op: 'subscribe',
          args: [{ channel: 'ticker', instType: 'SPOT', instId: id }],
        }),
      );
      console.info('[Bitget public WS] dynamically subscribed to', id);
    }
  };

  const unsubscribeTicker = (instId: string) => {
    const id = instId.toUpperCase();
    if (!publicTickers.has(id)) return;
    publicTickers.delete(id);
    if (publicWs && publicWs.readyState === WebSocket.OPEN) {
      publicWs.send(
        JSON.stringify({
          op: 'unsubscribe',
          args: [{ channel: 'ticker', instType: 'SPOT', instId: id }],
        }),
      );
      console.info('[Bitget public WS] unsubscribed from', id);
    }
  };

  const close = () => {
    stopPrivatePing();
    stopPublicPing();
    try {
      privateWs?.close();
    } catch {}
    try {
      publicWs?.close();
    } catch {}
    privateWs = null;
    publicWs = null;
  };

  // ---------- démarrage initial ----------
  // start private/public depending on initial channels content
  if (privateChannels.length > 0) startPrivate();
  if (publicTickers.size > 0) startPublic();

  // retourne l'API pour pouvoir s'abonner dynamiquement plus tard
  return { subscribeTicker, unsubscribeTicker, close };
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
