import { Pipe, PipeTransform } from '@angular/core';
import { formatMoney, formatNumber, formatPercent } from '../core/engine/number-format';
import { UNITS } from '../core/engine/units';
import { Unit } from '../core/models/domain';

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: string | null | undefined, currency = 'COP', decimals?: number): string {
    return formatMoney(value, currency, decimals);
  }
}

@Pipe({ name: 'pct' })
export class PercentFractionPipe implements PipeTransform {
  transform(value: string | null | undefined, decimals = 1): string {
    return formatPercent(value, decimals);
  }
}

@Pipe({ name: 'qty' })
export class QuantityPipe implements PipeTransform {
  transform(value: string | null | undefined, unit?: Unit): string {
    const n = formatNumber(value);
    return unit ? `${n} ${UNITS[unit].short}` : n;
  }
}
