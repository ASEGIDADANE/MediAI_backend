import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { centsToMajorString } from './payment-format.util';

type ChapaInitializeInput = {
  amountCents: number;
  currency: string;
  email: string;
  txRef: string;
  callbackUrl: string;
  returnUrl: string;
  title: string;
  description: string;
  meta?: Record<string, unknown>;
};

export type ChapaVerifyResult = {
  txRef: string;
  chapaReference: string | null;
  status: string;
  amountCents: number;
  currency: string;
  raw: unknown;
};

/** Chapa initialize expects a positive amount in major units (e.g. ETB). */
const MIN_AMOUNT_CENTS = 100;
/** Chapa `customization[title]` max length (API validation). */
const CHAPA_CUSTOM_TITLE_MAX = 16;
/** Chapa `customization[description]` max length (conservative). */
const CHAPA_CUSTOM_DESCRIPTION_MAX = 500;
/**
 * Chapa's validation rule on `customization[title]` and
 * `customization[description]`: "may only contain letters, numbers,
 * hyphens, underscores, spaces, and dots". Anything else is rejected
 * with a 400. We strip non-conforming characters at the client edge so
 * every caller can pass a free-form display string (plan names, doctor
 * names with accents, "interval=monthly" colons, etc) without each one
 * having to remember the same regex.
 *
 * Replacement strategy: replace any disallowed run with a single space,
 * collapse repeated spaces, then trim. This keeps the original word
 * boundaries readable in the Chapa receipt.
 */
const CHAPA_CUSTOM_ALLOWED = /[^A-Za-z0-9 _.\-]+/g;

function sanitizeChapaCustomString(value: string): string {
  return value.replace(CHAPA_CUSTOM_ALLOWED, ' ').replace(/\s+/g, ' ').trim();
}

@Injectable()
export class ChapaClient {
  private readonly logger = new Logger(ChapaClient.name);
  private readonly baseUrl: string;
  private readonly secretKey: string;
  private readonly timeoutMs: number;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (
      this.config.get<string>('CHAPA_BASE_URL') ?? 'https://api.chapa.co/v1'
    ).replace(/\/$/, '');
    this.secretKey = this.config.getOrThrow<string>('CHAPA_SECRET_KEY');
    this.timeoutMs = Number(
      this.config.get<string>('CHAPA_TIMEOUT_MS') ?? '30000',
    );
  }

  async initializePayment(input: ChapaInitializeInput): Promise<{
    checkoutUrl: string;
  }> {
    if (input.amountCents < MIN_AMOUNT_CENTS) {
      throw new BadRequestException(
        `Payment amount must be at least ${centsToMajorString(MIN_AMOUNT_CENTS)} ${input.currency}.`,
      );
    }
    const data = await this.request('/transaction/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: this.buildInitializeFormBody(input),
    });

    const checkoutUrl =
      readString(data, 'data', 'checkout_url') ??
      readString(data, 'checkout_url');
    if (!checkoutUrl) {
      throw new ServiceUnavailableException(
        'Chapa did not return a checkout URL',
      );
    }
    return { checkoutUrl };
  }

  async verifyTransaction(txRef: string): Promise<ChapaVerifyResult> {
    const data = await this.request(
      `/transaction/verify/${encodeURIComponent(txRef)}`,
      {
        method: 'GET',
      },
    );

    const status =
      readString(data, 'data', 'status') ?? readString(data, 'status') ?? '';
    const amount =
      readString(data, 'data', 'amount') ?? readString(data, 'amount') ?? '0';
    const currency =
      readString(data, 'data', 'currency') ??
      readString(data, 'currency') ??
      this.config.get<string>('CHAPA_CURRENCY') ??
      'ETB';
    const resolvedTxRef =
      readString(data, 'data', 'tx_ref') ??
      readString(data, 'data', 'trx_ref') ??
      txRef;
    const chapaReference =
      readString(data, 'data', 'reference') ??
      readString(data, 'data', 'ref_id') ??
      readString(data, 'reference') ??
      readString(data, 'ref_id') ??
      null;

    return {
      txRef: resolvedTxRef,
      chapaReference,
      status: status.toLowerCase(),
      amountCents: majorStringToCents(amount),
      currency,
      raw: data,
    };
  }

  private buildInitializeFormBody(input: ChapaInitializeInput): string {
    const params = new URLSearchParams();
    params.set('amount', centsToMajorString(input.amountCents));
    params.set('currency', input.currency);
    params.set('email', input.email);
    params.set('tx_ref', input.txRef);
    params.set('callback_url', input.callbackUrl);
    params.set('return_url', input.returnUrl);
    // Sanitize first, *then* truncate. If we truncated first and a
    // disallowed character ended up inside the kept prefix, the sanitizer
    // could leave us with an empty string when Chapa actually requires a
    // non-empty value.
    params.set(
      'customization[title]',
      sanitizeChapaCustomString(input.title).slice(0, CHAPA_CUSTOM_TITLE_MAX),
    );
    params.set(
      'customization[description]',
      sanitizeChapaCustomString(input.description).slice(
        0,
        CHAPA_CUSTOM_DESCRIPTION_MAX,
      ),
    );
    // Server-side initialize uses Authorization: Bearer only. Do not send
    // CHAPA_PUBLIC_KEY as `key` here — it often causes Chapa HTTP 400 when
    // paired with the secret key.
    return params.toString();
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          ...(init.headers ?? {}),
        },
      });
      const text = await response.text();
      const data = tryParseJson(text);
      if (!response.ok) {
        const detail = chapaMessageFromResponse(data);
        this.logger.warn(
          `Chapa ${init.method ?? 'GET'} ${path} failed (${response.status}): ${detail ?? JSON.stringify(data)}`,
        );
        throw chapaHttpError(response.status, data);
      }
      assertChapaBodySuccess(data);
      return data;
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        throw new GatewayTimeoutException('Timed out while contacting Chapa');
      }
      if (
        error instanceof BadGatewayException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException('Could not reach Chapa');
    } finally {
      clearTimeout(timeout);
    }
  }
}

function assertChapaBodySuccess(data: unknown): void {
  if (!data || typeof data !== 'object') {
    return;
  }
  const status = (data as Record<string, unknown>).status;
  if (typeof status !== 'string') {
    return;
  }
  const normalized = status.toLowerCase();
  if (normalized === 'success') {
    return;
  }
  if (
    normalized === 'fail' ||
    normalized === 'failed' ||
    normalized === 'error'
  ) {
    throw new BadRequestException(
      chapaMessageFromResponse(data) ?? 'Chapa returned an error',
    );
  }
}

function chapaHttpError(status: number, data: unknown): Error {
  const msg =
    chapaMessageFromResponse(data) ?? `Chapa request failed with status ${status}`;
  if (status >= 500) {
    return new BadGatewayException(msg);
  }
  return new BadRequestException(msg);
}

function chapaMessageFromResponse(data: unknown): string | null {
  if (data == null) {
    return null;
  }
  if (typeof data === 'string') {
    const t = data.trim();
    return t || null;
  }
  if (typeof data !== 'object') {
    return null;
  }
  const root = data as Record<string, unknown>;
  const fromMessage = formatChapaFieldMessage(root['message']);
  if (fromMessage) {
    return fromMessage;
  }
  const fromErrors = formatChapaFieldMessage(root['errors']);
  if (fromErrors) {
    return fromErrors;
  }
  const inner = root['data'];
  if (inner && typeof inner === 'object') {
    const nested = inner as Record<string, unknown>;
    return (
      formatChapaFieldMessage(nested['message']) ??
      formatChapaFieldMessage(nested['errors'])
    );
  }
  return null;
}

/** Chapa often returns validation errors as an object, not a plain string. */
function formatChapaFieldMessage(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => formatChapaFieldMessage(item))
      .filter((item): item is string => Boolean(item));
    return parts.length ? parts.join('; ') : null;
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const parts: string[] = [];
    for (const [key, item] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const text = formatChapaFieldMessage(item);
      if (text) {
        parts.push(`${key}: ${text}`);
      }
    }
    return parts.length ? parts.join('; ') : null;
  }
  return null;
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function readString(
  value: unknown,
  ...path: string[]
): string | null {
  let current = value as unknown;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' && current.trim() !== ''
    ? current
    : null;
}

function majorStringToCents(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
