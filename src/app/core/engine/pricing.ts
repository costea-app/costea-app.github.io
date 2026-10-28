import { DecimalString, PricingMode } from '../models/domain';
import {
  CosteaValidationError,
  Decimal,
  ONE,
  requireFraction,
  requireNonNegative,
  str,
} from './decimal';

/**
 * Precio para un margen objetivo sobre la venta:
 *   P = (C + f) / (1 − m − c)
 * C = costo unitario, f = cargo fijo de venta por unidad,
 * m = margen objetivo (fracción), c = comisión sobre la venta (fracción).
 */
export function priceForTargetMargin(
  unitCost: string | Decimal,
  targetMargin: string | Decimal,
  commissionRate: string | Decimal = '0',
  fixedSaleFee: string | Decimal = '0',
): Decimal {
  const C = requireNonNegative(unitCost, 'costo unitario');
  const m = requireFraction(targetMargin, 'margen objetivo');
  const c = requireFraction(commissionRate, 'comisión');
  const f = requireNonNegative(fixedSaleFee, 'cargo fijo de venta');
  const denominator = ONE.minus(m).minus(c);
  if (denominator.lte(0)) {
    throw new CosteaValidationError(
      'margin_plus_commission_too_high',
      'El margen objetivo más la comisión deben sumar menos de 100 %.',
      'targetMargin',
    );
  }
  return C.plus(f).div(denominator);
}

/**
 * Precio con recargo sobre el costo:
 *   P = (C + f) × (1 + recargo)
 * El recargo se aplica antes de descontar la comisión porcentual.
 */
export function priceForMarkup(
  unitCost: string | Decimal,
  markup: string | Decimal,
  fixedSaleFee: string | Decimal = '0',
): Decimal {
  const C = requireNonNegative(unitCost, 'costo unitario');
  const r = requireNonNegative(markup, 'recargo');
  const f = requireNonNegative(fixedSaleFee, 'cargo fijo de venta');
  return C.plus(f).mul(ONE.plus(r));
}

/** Redondea hacia arriba al múltiplo de `step` (p. ej. 100 o 500). */
export function roundUpToStep(price: string | Decimal, step: string | Decimal): Decimal {
  const p = requireNonNegative(price, 'precio');
  const s = requireNonNegative(step, 'redondeo', { positive: true });
  return p.div(s).ceil().mul(s);
}

export interface PriceOutcome {
  price: DecimalString;
  commissionAmount: DecimalString;
  fixedSaleFee: DecimalString;
  /** Ganancia estimada por unidad: G = P − C − f − P × c (antes de impuestos). */
  profit: DecimalString;
  /** Margen efectivo G / P; null si P = 0. */
  effectiveMargin: DecimalString | null;
}

export function evaluatePrice(
  price: string | Decimal,
  unitCost: string | Decimal,
  commissionRate: string | Decimal = '0',
  fixedSaleFee: string | Decimal = '0',
): PriceOutcome {
  const P = requireNonNegative(price, 'precio');
  const C = requireNonNegative(unitCost, 'costo unitario');
  const c = requireFraction(commissionRate, 'comisión');
  const f = requireNonNegative(fixedSaleFee, 'cargo fijo de venta');
  const commission = P.mul(c);
  const profit = P.minus(C).minus(f).minus(commission);
  return {
    price: str(P),
    commissionAmount: str(commission),
    fixedSaleFee: str(f),
    profit: str(profit),
    effectiveMargin: P.isZero() ? null : str(profit.div(P)),
  };
}

export interface PricingInput {
  mode: PricingMode;
  targetMargin: DecimalString;
  markup: DecimalString;
  commissionRate: DecimalString;
  fixedSaleFee: DecimalString;
  roundingStep: DecimalString | null;
  manualPrice: DecimalString | null;
}

export interface PricingResult {
  mode: PricingMode;
  commissionRate: DecimalString;
  fixedSaleFee: DecimalString;
  roundingStep: DecimalString | null;
  /** Precio calculado con toda la precisión. */
  calculated: PriceOutcome;
  /** Precio comercial redondeado hacia arriba, con ganancia y margen recalculados. */
  rounded: PriceOutcome | null;
  /** Resultado del simulador con un precio manual. */
  manual: PriceOutcome | null;
  manualError: string | null;
}

/** Calcula el precio sugerido y sus variantes. Lanza CosteaValidationError si los datos no son válidos. */
export function computePricing(unitCost: string | Decimal, input: PricingInput): PricingResult {
  const P =
    input.mode === 'margin'
      ? priceForTargetMargin(unitCost, input.targetMargin, input.commissionRate, input.fixedSaleFee)
      : priceForMarkup(unitCost, input.markup, input.fixedSaleFee);

  const outcome = (price: Decimal | string) =>
    evaluatePrice(price, unitCost, input.commissionRate, input.fixedSaleFee);

  let rounded: PriceOutcome | null = null;
  if (input.roundingStep !== null && input.roundingStep !== '') {
    rounded = outcome(roundUpToStep(P, input.roundingStep));
  }

  let manual: PriceOutcome | null = null;
  let manualError: string | null = null;
  if (input.manualPrice !== null && input.manualPrice !== '') {
    try {
      manual = outcome(requireNonNegative(input.manualPrice, 'precio manual', { positive: true }));
    } catch (e) {
      manualError = e instanceof CosteaValidationError ? e.message : 'Precio manual inválido.';
    }
  }

  return {
    mode: input.mode,
    commissionRate: str(requireFraction(input.commissionRate, 'comisión')),
    fixedSaleFee: str(requireNonNegative(input.fixedSaleFee, 'cargo fijo de venta')),
    roundingStep: input.roundingStep || null,
    calculated: outcome(P),
    rounded,
    manual,
    manualError,
  };
}
