import { DecimalString } from '../models/domain';
import { Decimal } from './decimal';

/**
 * Interpreta lo que una persona escribe en Colombia (es-CO) y lo convierte en texto canónico.
 *
 *  - "5.000"     → "5000"     (punto como separador de miles)
 *  - "1.250,5"   → "1250.5"   (coma decimal)
 *  - "0,3"       → "0.3"
 *  - "1.5"       → "1.5"      (un punto que no agrupa miles se toma como decimal)
 *  - "$ 12.000"  → "12000"
 *
 * Devuelve null si el texto está vacío y `undefined` si no es un número válido.
 */
export function parseLocaleDecimal(input: string | null | undefined): DecimalString | null | undefined {
  if (input === null || input === undefined) return null;
  let s = String(input).replace(/[\s$ ]/g, '');
  if (s === '') return null;
  let negative = false;
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  let canonical: string;
  if (s.includes(',')) {
    if (s.split(',').length > 2) return undefined;
    const [intPart, frac] = s.split(',');
    if (intPart.includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(intPart)) return undefined;
    canonical = `${intPart.replace(/\./g, '') || '0'}.${frac}`;
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    canonical = s.replace(/\./g, '');
  } else {
    canonical = s.startsWith('.') ? `0${s}` : s;
  }
  if (!/^\d+(\.\d+)?$/.test(canonical)) return undefined;
  const d = new Decimal(canonical);
  return (negative && !d.isZero() ? d.neg() : d).toFixed();
}

/** Escribe un valor canónico en formato es-CO para un campo editable (sin símbolo de moneda). */
export function toLocaleInput(value: DecimalString | null | undefined, maxDecimals = 6): string {
  if (value === null || value === undefined || value === '') return '';
  const d = new Decimal(value).toDecimalPlaces(maxDecimals);
  const [i, f] = d.abs().toFixed().split('.');
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${d.isNeg() ? '-' : ''}${grouped}${f ? ',' + f : ''}`;
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();

/**
 * Formatea dinero para mostrar (solo la vista; los cálculos conservan toda la precisión).
 * Sin `decimals`: valores enteros sin decimales ("$ 2.000") y, si hay centavos, siempre dos ("$ 1.730,80").
 */
export function formatMoney(value: DecimalString | null | undefined, currency = 'COP', decimals?: number): string {
  if (value === null || value === undefined || value === '') return '—';
  const rounded = new Decimal(value).toDecimalPlaces(decimals ?? 2);
  const digits = decimals ?? (rounded.isInteger() ? 0 : 2);
  const key = `${currency}|${digits}`;
  let fmt = moneyFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    moneyFormatters.set(key, fmt);
  }
  return fmt.format(rounded.toNumber());
}

/** Formatea un número (cantidad) en es-CO. */
export function formatNumber(value: DecimalString | null | undefined, maxDecimals = 3): string {
  if (value === null || value === undefined || value === '') return '—';
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: maxDecimals }).format(
    new Decimal(value).toDecimalPlaces(maxDecimals).toNumber(),
  );
}

/** Formatea una fracción (0.3) como porcentaje ("30 %"). */
export function formatPercent(fraction: DecimalString | null | undefined, maxDecimals = 1): string {
  if (fraction === null || fraction === undefined || fraction === '') return '—';
  const pct = new Decimal(fraction).mul(100).toDecimalPlaces(maxDecimals);
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: maxDecimals }).format(pct.toNumber())} %`;
}

/** "30" (porcentaje escrito por la persona) → "0.3" (fracción). */
export function percentToFraction(percent: DecimalString | null): DecimalString | null {
  if (percent === null || percent === '') return null;
  return new Decimal(percent).div(100).toFixed();
}

/** "0.3" → "30". */
export function fractionToPercent(fraction: DecimalString | null): DecimalString | null {
  if (fraction === null || fraction === '') return null;
  return new Decimal(fraction).mul(100).toFixed();
}
