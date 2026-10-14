import type { RequestHandler } from 'express';
import type { ReceiptRouteError, ReceiptTokenVerifier } from '../types/receiptAuth';

const invalidTokenCodes = new Set([
  'auth/argument-error', 'auth/invalid-argument', 'auth/invalid-id-token',
  'auth/id-token-expired', 'auth/id-token-revoked', 'auth/user-disabled', 'auth/user-not-found'
]);

export function createReceiptAuthentication(verifyToken: ReceiptTokenVerifier): RequestHandler {
  return async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    delete res.locals.receiptIdentity;
    const deny = () => {
      res.set('WWW-Authenticate', 'Bearer');
      res.status(401).json({
        error: true, code: 'AUTH_REQUIRED', message: 'Autenticação necessária. Envie um ID token Firebase válido.'
      } satisfies ReceiptRouteError);
    };
    // Não aceitar cabeçalhos duplicados, query string, corpo, cookies ou outros esquemas.
    const headerCount = req.rawHeaders.filter((_, index) => index % 2 === 0 && req.rawHeaders[index].toLowerCase() === 'authorization').length;
    const header = req.get('Authorization');
    const match = header?.match(/^Bearer ([A-Za-z0-9._~-]+)$/i);
    if (headerCount !== 1 || !match) {
      deny();
      return;
    }
    let identity;
    try {
      identity = await verifyToken(match[1]);
    } catch (error: unknown) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (typeof code === 'string' && invalidTokenCodes.has(code)) deny();
      else res.status(503).json({
        error: true, code: 'AUTH_UNAVAILABLE', message: 'Autenticação temporariamente indisponível.'
      } satisfies ReceiptRouteError);
      return;
    }
    if (!identity || typeof identity.uid !== 'string' || !identity.uid.trim() || identity.uid.length > 128) {
      deny();
      return;
    }
    res.locals.receiptIdentity = { uid: identity.uid };
    next();
  };
}

export function createReceiptAuthorization(pilotUIDs?: string): RequestHandler {
  // Snapshot da configuração do servidor. Ausência ou wildcard negam todos.
  const entries = pilotUIDs?.split(',').map(uid => uid.trim()).filter(Boolean) ?? [];
  const allowed = new Set(entries.some(uid => uid === '*' || uid.length > 128) ? [] : entries);
  return (_req, res, next) => {
    const uid: unknown = res.locals.receiptIdentity?.uid;
    if (typeof uid !== 'string' || !allowed.has(uid)) {
      res.status(403).json({
        error: true, code: 'RECEIPT_ACCESS_DENIED', message: 'Usuário sem autorização para utilizar esta funcionalidade.'
      } satisfies ReceiptRouteError);
      return;
    }
    next();
  };
}
