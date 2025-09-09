import crypto from 'crypto';

export function getBitgetSignature(
  apiSecret: string,
  timestamp: string,
  method: string,
  requestPath: string,
  body = '',
) {
  const preSign = timestamp + method + requestPath + body;
  return crypto.createHmac('sha256', apiSecret).update(preSign).digest('base64');
}
