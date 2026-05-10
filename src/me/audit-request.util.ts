import type { Request } from 'express';

export type AuditRequestContext = { ip?: string; userAgent?: string };

export function auditContextFromRequest(req: Request): AuditRequestContext {
  return {
    ip: getClientIp(req),
    userAgent:
      typeof req.headers['user-agent'] === 'string'
        ? req.headers['user-agent'].slice(0, 512)
        : undefined,
  };
}

function getClientIp(req: Request): string | undefined {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    return xf.split(',')[0].trim().slice(0, 64);
  }
  if (Array.isArray(xf) && xf[0]) {
    return String(xf[0]).split(',')[0].trim().slice(0, 64);
  }
  const ip = req.ip || req.socket?.remoteAddress;
  return ip ? ip.slice(0, 64) : undefined;
}
