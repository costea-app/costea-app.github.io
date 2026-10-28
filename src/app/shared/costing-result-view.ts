import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CHECKLIST_LABELS, CostingResult } from '../core/engine/costing';
import { CostingMode } from '../core/models/domain';
import { BreakdownChart } from './breakdown-chart';
import { MoneyPipe, PercentFractionPipe, QuantityPipe } from './format.pipes';
import { StatusChip } from './status-chip';

/** Presenta un resultado de costeo. Lo usan el asistente, el reporte en vivo y los reportes guardados. */
@Component({
  selector: 'app-costing-result-view',
  imports: [MatIconModule, MoneyPipe, PercentFractionPipe, QuantityPipe, BreakdownChart, StatusChip],
  template: `
    @let r = result();
    @let cur = currency();

    @if (r.errors.length) {
      <div class="notice notice-error" role="alert">
        <mat-icon aria-hidden="true">error</mat-icon>
        <div>
          <strong>Hay datos por corregir antes de calcular el costo:</strong>
          <ul>
            @for (e of r.errors; track $index) { <li>{{ e.message }}</li> }
          </ul>
        </div>
      </div>
    }

    @if (r.pendingCategories.length) {
      <div class="notice notice-warning" role="status">
        <mat-icon aria-hidden="true">pending_actions</mat-icon>
        <div>
          <strong>Precio provisional.</strong> Aún faltan por revisar:
          {{ pendingLabels() }}. El costeo no está completo hasta que cada categoría esté incluida o marcada como “no aplica”.
        </div>
      </div>
    }

    @if (r.warnings.length) {
      <div class="notice notice-info">
        <mat-icon aria-hidden="true">info</mat-icon>
        <ul>
          @for (w of r.warnings; track $index) { <li>{{ w.message }}</li> }
        </ul>
      </div>
    }

    <div class="result-headline">
      <div class="kpi">
        <span class="kpi-label">Costo por unidad</span>
        <span class="kpi-value">{{ r.unitCost | money: cur }}</span>
        @if (mode() === 'batch') {
          <span class="kpi-sub">Costo de la tanda: {{ r.batchTotal | money: cur }} · {{ r.sellableUnits | qty }} unidades vendibles</span>
        }
      </div>
      <div class="kpi kpi-primary">
        <span class="kpi-label">Precio sugerido <small>(antes de impuestos)</small></span>
        <span class="kpi-value">{{ (r.pricing?.rounded?.price ?? r.pricing?.calculated?.price) | money: cur }}</span>
        @if (r.pricing?.rounded; as rounded) {
          <span class="kpi-sub">Calculado: {{ r.pricing!.calculated.price | money: cur : 2 }} · redondeado hacia arriba a múltiplos de {{ r.pricing!.roundingStep | money: cur }}</span>
        }
      </div>
      <div class="kpi">
        <span class="kpi-label">Estado</span>
        <app-status-chip [status]="r.status" />
        @if (r.hasEstimates) { <span class="kpi-sub">Incluye importes estimados</span> }
      </div>
    </div>

    @if (r.pricingError) {
      <div class="notice notice-error" role="alert">
        <mat-icon aria-hidden="true">error</mat-icon>
        <div>{{ r.pricingError.message }}</div>
      </div>
    }

    <div class="result-grid">
      <section aria-labelledby="desglose-titulo" class="card-section">
        <h3 id="desglose-titulo">¿En qué se va el costo?</h3>
        <app-breakdown-chart [items]="r.breakdown" [currency]="cur" />
        <div class="table-scroll">
          <table class="data-table">
            <caption class="visually-hidden">Desglose de costos por categoría</caption>
            <thead>
              <tr>
                <th scope="col">Categoría</th>
                @if (mode() === 'batch') { <th scope="col" class="num">Tanda</th> }
                <th scope="col" class="num">Por unidad</th>
              </tr>
            </thead>
            <tbody>
              @for (b of r.breakdown; track b.key) {
                <tr>
                  <th scope="row">{{ b.label }}@if (b.isEstimated) { <span class="tag-est">estimado</span> }</th>
                  @if (mode() === 'batch') { <td class="num">{{ b.batchAmount | money: cur }}</td> }
                  <td class="num">{{ b.unitAmount | money: cur }}</td>
                </tr>
              } @empty {
                <tr><td [attr.colspan]="mode() === 'batch' ? 3 : 2" class="muted">Sin costos registrados.</td></tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                @if (mode() === 'batch') { <td class="num">{{ r.batchTotal | money: cur }}</td> }
                <td class="num">{{ r.unitCost | money: cur }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section aria-labelledby="precio-titulo" class="card-section">
        <h3 id="precio-titulo">Precio y ganancia por unidad</h3>
        @if (r.pricing; as p) {
          <p class="muted small">
            {{ p.mode === 'margin'
              ? 'Calculado con margen objetivo sobre la venta.'
              : 'Calculado con recargo sobre el costo (el recargo se aplica antes de descontar la comisión).' }}
          </p>
          <div class="table-scroll">
            <table class="data-table">
              <caption class="visually-hidden">Precio, comisión, cargo fijo, ganancia y margen</caption>
              <thead>
                <tr>
                  <th scope="col"></th>
                  <th scope="col" class="num">Precio calculado</th>
                  @if (p.rounded) { <th scope="col" class="num">Precio redondeado</th> }
                  @if (p.manual) { <th scope="col" class="num">Tu precio</th> }
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Precio de venta</th>
                  <td class="num">{{ p.calculated.price | money: cur : 2 }}</td>
                  @if (p.rounded) { <td class="num">{{ p.rounded.price | money: cur }}</td> }
                  @if (p.manual) { <td class="num">{{ p.manual.price | money: cur }}</td> }
                </tr>
                <tr>
                  <th scope="row">Costo por unidad</th>
                  <td class="num">−{{ r.unitCost | money: cur }}</td>
                  @if (p.rounded) { <td class="num">−{{ r.unitCost | money: cur }}</td> }
                  @if (p.manual) { <td class="num">−{{ r.unitCost | money: cur }}</td> }
                </tr>
                <tr>
                  <th scope="row">Comisión ({{ p.commissionRate | pct }})</th>
                  <td class="num">−{{ p.calculated.commissionAmount | money: cur }}</td>
                  @if (p.rounded) { <td class="num">−{{ p.rounded.commissionAmount | money: cur }}</td> }
                  @if (p.manual) { <td class="num">−{{ p.manual.commissionAmount | money: cur }}</td> }
                </tr>
                <tr>
                  <th scope="row">Cargo fijo de venta por unidad</th>
                  <td class="num">−{{ p.fixedSaleFee | money: cur }}</td>
                  @if (p.rounded) { <td class="num">−{{ p.fixedSaleFee | money: cur }}</td> }
                  @if (p.manual) { <td class="num">−{{ p.fixedSaleFee | money: cur }}</td> }
                </tr>
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Ganancia estimada</th>
                  <td class="num" [class.negative]="p.calculated.profit.startsWith('-')">{{ p.calculated.profit | money: cur }}</td>
                  @if (p.rounded) { <td class="num" [class.negative]="p.rounded.profit.startsWith('-')">{{ p.rounded.profit | money: cur }}</td> }
                  @if (p.manual) { <td class="num" [class.negative]="p.manual.profit.startsWith('-')">{{ p.manual.profit | money: cur }}</td> }
                </tr>
                <tr>
                  <th scope="row">Margen efectivo</th>
                  <td class="num">{{ p.calculated.effectiveMargin | pct }}</td>
                  @if (p.rounded) { <td class="num">{{ p.rounded.effectiveMargin | pct }}</td> }
                  @if (p.manual) { <td class="num" [class.negative]="p.manual.profit.startsWith('-')">{{ p.manual.effectiveMargin | pct }}</td> }
                </tr>
              </tfoot>
            </table>
          </div>
          @if (p.manualError) { <p class="error-text" role="alert">{{ p.manualError }}</p> }
          <p class="muted small">
            La ganancia es una estimación por unidad, después de los costos registrados y <strong>antes de impuestos</strong>.
            Costea no calcula IVA ni otros impuestos en esta versión.
          </p>
        } @else if (!r.pricingError) {
          <p class="muted">Completa los datos del costeo para ver el precio sugerido.</p>
        }
      </section>
    </div>

    @if (showChecklist()) {
      <section class="card-section" aria-labelledby="checklist-res-titulo">
        <h3 id="checklist-res-titulo">Checklist de costos</h3>
        <ul class="checklist-summary" role="list">
          @for (c of r.checklist; track c.category) {
            <li [class]="'cl-' + c.status">
              <mat-icon aria-hidden="true">{{ c.status === 'included' ? 'check_circle' : c.status === 'not_applicable' ? 'remove_circle_outline' : 'radio_button_unchecked' }}</mat-icon>
              <span class="cl-label">{{ c.label }}</span>
              <span class="cl-state">{{ c.status === 'included' ? 'Incluida' : c.status === 'not_applicable' ? 'No aplica' : 'Pendiente' }}@if (c.isEstimated) { · estimada }</span>
            </li>
          }
        </ul>
      </section>
    }
  `,
})
export class CostingResultView {
  readonly result = input.required<CostingResult>();
  readonly currency = input('COP');
  readonly mode = input<CostingMode>('batch');
  readonly showChecklist = input(true);

  readonly pendingLabels = computed(() =>
    this.result()
      .pendingCategories.map((c) => CHECKLIST_LABELS[c].toLowerCase())
      .join(', '),
  );
}
