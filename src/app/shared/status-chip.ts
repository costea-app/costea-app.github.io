import { Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { CostingStatus } from '../core/models/domain';

const META: Record<CostingStatus, { label: string; icon: string; hint: string }> = {
  pending: { label: 'Pendiente', icon: 'pending', hint: 'Faltan categorías por revisar: el precio es provisional.' },
  estimated: { label: 'Estimado', icon: 'edit_note', hint: 'Completo, pero con importes estimados.' },
  reviewed: { label: 'Revisado', icon: 'verified', hint: 'Todas las categorías revisadas con datos reales.' },
};

@Component({
  selector: 'app-status-chip',
  imports: [MatIconModule],
  template: `
    <span class="status-chip" [class]="'status-chip status-' + status()" [attr.title]="meta().hint">
      <mat-icon aria-hidden="true">{{ meta().icon }}</mat-icon>
      <span>{{ meta().label }}</span>
      <span class="visually-hidden">: {{ meta().hint }}</span>
    </span>
  `,
})
export class StatusChip {
  readonly status = input.required<CostingStatus>();
  readonly meta = computed(() => META[this.status()]);
}
