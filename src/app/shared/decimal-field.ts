import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { parseLocaleDecimal } from '../core/engine/number-format';
import { Decimal } from '../core/engine/decimal';

export interface DecimalRule {
  required?: boolean;
  min?: number;
  /** El mínimo es exclusivo (> min). */
  minExclusive?: boolean;
  /** Máximo exclusivo (< max). */
  maxExclusive?: number;
  /** Máximo inclusivo (<= max). */
  max?: number;
  integer?: boolean;
}

/** Valida un campo de texto que contiene un número escrito en formato es-CO. */
export function decimalValidator(rule: DecimalRule = {}): ValidatorFn {
  return (control: AbstractControl<string | null>): ValidationErrors | null => {
    const parsed = parseLocaleDecimal(control.value);
    if (parsed === null) return rule.required ? { required: true } : null;
    if (parsed === undefined) return { number: true };
    const d = new Decimal(parsed);
    if (rule.min !== undefined) {
      if (rule.minExclusive ? d.lte(rule.min) : d.lt(rule.min)) {
        return rule.minExclusive && rule.min === 0 ? { positive: true } : { min: rule.min };
      }
    }
    if (rule.maxExclusive !== undefined && d.gte(rule.maxExclusive)) return { maxExclusive: rule.maxExclusive };
    if (rule.max !== undefined && d.gt(rule.max)) return { max: rule.max };
    if (rule.integer && !d.isInteger()) return { integer: true };
    return null;
  };
}

/** Mensaje de error en español para un control numérico o de texto. */
export function fieldError(control: AbstractControl | null): string | null {
  const e = control?.errors;
  if (!e) return null;
  if (e['required']) return 'Este dato es obligatorio.';
  if (e['number']) return 'Escribe un número válido, por ejemplo 5.000 o 0,5.';
  if (e['positive']) return 'Debe ser mayor que cero.';
  if (e['min'] !== undefined) return `No puede ser menor que ${e['min']}.`;
  if (e['maxExclusive'] !== undefined) return `Debe ser menor que ${e['maxExclusive']}.`;
  if (e['max'] !== undefined) return `No puede ser mayor que ${e['max']}.`;
  if (e['integer']) return 'Usa un número entero.';
  if (e['maxlength']) return `Máximo ${e['maxlength'].requiredLength} caracteres.`;
  if (e['email']) return 'Escribe un correo válido.';
  if (e['minlength']) return `Usa al menos ${e['minlength'].requiredLength} caracteres.`;
  if (e['mismatch']) return 'Las contraseñas no coinciden.';
  return 'Revisa este dato.';
}

/** Valor canónico de un campo, o `fallback` si está vacío o es inválido. */
export function canonical(value: string | null | undefined, fallback: string): string;
export function canonical(value: string | null | undefined, fallback: null): string | null;
export function canonical(value: string | null | undefined, fallback: string | null): string | null {
  const parsed = parseLocaleDecimal(value);
  return parsed === null || parsed === undefined ? fallback : parsed;
}
