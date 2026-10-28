import DecimalLib from 'decimal.js';

/**
 * Instancia aislada de decimal.js para el motor: precisión amplia en los pasos
 * intermedios; el redondeo solo ocurre al mostrar o al aplicar el precio comercial.
 */
export const Decimal = DecimalLib.clone({ precision: 40, rounding: DecimalLib.ROUND_HALF_UP });
export type Decimal = InstanceType<typeof Decimal>;

export const ZERO = new Decimal(0);
export const ONE = new Decimal(1);

/** Error de validación con un mensaje en español, apto para mostrarse a la persona. */
export class CosteaValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'CosteaValidationError';
  }
}

const CANONICAL = /^-?\d+(\.\d+)?$/;

/** Convierte un valor canónico ("1234.5") o un número finito en Decimal; lanza si no es válido. */
export function toDecimal(value: string | number | Decimal, field = 'valor'): Decimal {
  if (value instanceof Decimal) return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw invalid(field);
    return new Decimal(value);
  }
  const trimmed = (value ?? '').trim();
  if (!CANONICAL.test(trimmed)) throw invalid(field);
  return new Decimal(trimmed);
}

function invalid(field: string): CosteaValidationError {
  return new CosteaValidationError('invalid_number', `“${field}” no es un número válido.`, field);
}

/** Exige un número >= 0 (o > 0 si `positive`). */
export function requireNonNegative(
  value: string | number | Decimal,
  field: string,
  opts: { positive?: boolean } = {},
): Decimal {
  const d = toDecimal(value, field);
  if (opts.positive ? d.lte(0) : d.lt(0)) {
    throw new CosteaValidationError(
      opts.positive ? 'must_be_positive' : 'must_be_non_negative',
      opts.positive ? `“${field}” debe ser mayor que cero.` : `“${field}” no puede ser negativo.`,
      field,
    );
  }
  return d;
}

/** Exige una fracción en [0, 1). */
export function requireFraction(value: string | number | Decimal, field: string): Decimal {
  const d = toDecimal(value, field);
  if (d.lt(0) || d.gte(1)) {
    throw new CosteaValidationError(
      'fraction_out_of_range',
      `“${field}” debe estar entre 0 % y menos de 100 %.`,
      field,
    );
  }
  return d;
}

/** Texto canónico con toda la precisión interna (sin notación científica). */
export function str(d: Decimal): string {
  return d.toFixed();
}
