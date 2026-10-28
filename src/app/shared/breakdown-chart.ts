import { Component, computed, input } from '@angular/core';
import { BreakdownItem } from '../core/engine/costing';
import { Decimal } from '../core/engine/decimal';
import { formatMoney } from '../core/engine/number-format';

interface Bar {
  key: string;
  label: string;
  amount: string;
  share: number;
  shareLabel: string;
  width: string;
  estimated: boolean;
}

/**
 * Desglose del costo unitario por categoría: barras horizontales de una sola serie,
 * etiquetadas directamente (la tabla del resultado ofrece la vista accesible completa).
 */
@Component({
  selector: 'app-breakdown-chart',
  template: `
    @if (bars().length) {
      <figure class="breakdown-chart" [attr.aria-label]="'Desglose del costo por unidad'">
        <ul role="list">
          @for (bar of bars(); track bar.key) {
            <li class="bar-row" [attr.title]="bar.label + ': ' + bar.amount + ' por unidad (' + bar.shareLabel + ')'">
              <span class="bar-label">{{ bar.label }}@if (bar.estimated) {<span class="est-mark" aria-label="estimado">*</span>}</span>
              <span class="bar-track" aria-hidden="true">
                <span class="bar-fill" [style.width]="bar.width"></span>
              </span>
              <span class="bar-value">{{ bar.amount }} <small>{{ bar.shareLabel }}</small></span>
            </li>
          }
        </ul>
        @if (hasEstimated()) {
          <figcaption class="muted small">* Incluye importes estimados.</figcaption>
        }
      </figure>
    } @else {
      <p class="muted">Aún no hay costos para graficar.</p>
    }
  `,
})
export class BreakdownChart {
  readonly items = input.required<BreakdownItem[]>();
  readonly currency = input('COP');

  readonly bars = computed<Bar[]>(() => {
    const items = this.items();
    const total = items.reduce((a, b) => a.plus(b.unitAmount), new Decimal(0));
    if (total.isZero()) return [];
    const max = Decimal.max(...items.map((i) => new Decimal(i.unitAmount)));
    return [...items]
      .sort((a, b) => new Decimal(b.unitAmount).cmp(a.unitAmount))
      .map((i) => {
        const share = new Decimal(i.unitAmount).div(total).toNumber();
        return {
          key: i.key,
          label: i.label,
          amount: formatMoney(i.unitAmount, this.currency()),
          share,
          shareLabel: `${Math.round(share * 100)} %`,
          width: `${Math.max(1.5, new Decimal(i.unitAmount).div(max).mul(100).toNumber())}%`,
          estimated: i.isEstimated,
        };
      });
  });

  readonly hasEstimated = computed(() => this.items().some((i) => i.isEstimated));
}
