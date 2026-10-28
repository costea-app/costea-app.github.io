import { Component, computed, input } from '@angular/core';
import { CostingResult } from '../../core/engine/costing';
import { Material, Product } from '../../core/models/domain';
import { MoneyPipe, PercentFractionPipe, QuantityPipe } from '../../shared/format.pipes';

const CATEGORY_LABEL = { packaging: 'Empaque', services: 'Servicio de producción', transport: 'Transporte', other: 'Otro' } as const;

/** Detalle de entradas del costeo para el reporte imprimible. */
@Component({
  selector: 'app-report-details',
  imports: [MoneyPipe, PercentFractionPipe, QuantityPipe],
  template: `
    @let p = product();
    @let cur = currency();
    <section class="card-section">
      <h3>Datos del costeo</h3>
      <div class="table-scroll">
        <table class="data-table">
          <caption class="visually-hidden">Materiales usados</caption>
          <thead><tr><th scope="col">Material</th><th scope="col" class="num">Cantidad usada</th><th scope="col" class="num">Costo</th></tr></thead>
          <tbody>
            @for (l of result().materialLines; track l.lineId) {
              <tr>
                <th scope="row">{{ l.materialName }}@if (l.isEstimated) { <span class="tag-est">estimado</span> }</th>
                <td class="num">{{ l.quantity | qty: l.unit }}</td>
                <td class="num">{{ l.cost | money: cur : 2 }}</td>
              </tr>
            } @empty { <tr><td colspan="3" class="muted">Sin materiales.</td></tr> }
          </tbody>
        </table>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <caption class="visually-hidden">Trabajo y otros costos</caption>
          <thead><tr><th scope="col">Concepto</th><th scope="col">Detalle</th><th scope="col" class="num">Monto</th></tr></thead>
          <tbody>
            <tr>
              <th scope="row">Tu trabajo@if (p.laborIsEstimated) { <span class="tag-est">estimado</span> }</th>
              <td>{{ p.laborMinutes | qty }} min a {{ p.laborHourlyRate | money: cur }}/hora</td>
              <td class="num">{{ labor() | money: cur }} por tanda</td>
            </tr>
            @if (p.includeSharedCosts) {
              <tr>
                <th scope="row">Gastos compartidos</th>
                <td>{{ p.productionMinutes | qty }} min de producción (estimación)</td>
                <td class="num">{{ shared() | money: cur }} por tanda</td>
              </tr>
            }
            @for (c of p.costs; track c.id) {
              <tr>
                <th scope="row">{{ c.name }}@if (c.isEstimated) { <span class="tag-est">estimado</span> }</th>
                <td>{{ label(c.category) }}</td>
                <td class="num">{{ c.amount | money: cur }} {{ c.scope === 'unit' ? 'por unidad' : 'por tanda' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="small muted">
        {{ p.costingMode === 'batch' ? 'Costeo por tanda: ' + (p.unitsMade ? p.unitsMade + ' unidades producidas, ' : '') + p.sellableUnits + ' vendibles.' : 'Costeo por unidad.' }}
        Precio: {{ p.pricing.mode === 'margin' ? 'margen objetivo de ' : 'recargo de ' }}{{ (p.pricing.mode === 'margin' ? p.pricing.targetMargin : p.pricing.markup) | pct }}
        @if (p.pricing.commissionRate !== '0') { · comisión de {{ p.pricing.commissionRate | pct }} }
        @if (p.pricing.fixedSaleFee !== '0') { · cargo fijo de venta de {{ p.pricing.fixedSaleFee | money: cur }} por unidad }.
      </p>
    </section>
  `,
})
export class ReportDetails {
  readonly product = input.required<Product>();
  readonly result = input.required<CostingResult>();
  readonly materials = input<Material[]>([]);
  readonly currency = input('COP');

  readonly labor = computed(() => this.result().breakdown.find((b) => b.key === 'labor')?.batchAmount ?? '0');
  readonly shared = computed(() => this.result().breakdown.find((b) => b.key === 'shared')?.batchAmount ?? '0');

  label(c: keyof typeof CATEGORY_LABEL): string {
    return CATEGORY_LABEL[c];
  }
}
