import { FormBuilder } from '@angular/forms';
import { buildDemoSeed } from '../../core/data/demo-seed';
import { buildProductForm, formToProduct, patchForm } from './product-form';

describe('Formulario del asistente', () => {
  const fb = new FormBuilder().nonNullable;

  it('carga y reconstruye cada producto demo sin perder datos', () => {
    for (const product of buildDemoSeed().products) {
      const form = buildProductForm(fb);
      patchForm(fb, form, product);
      const back = formToProduct(form, product);
      expect(back).toEqual(product);
    }
  });

  it('muestra porcentajes como 30 y los guarda como fracción 0,3', () => {
    const product = buildDemoSeed().products[0];
    const form = buildProductForm(fb);
    patchForm(fb, form, product);
    expect(form.controls.pricing.controls.targetMargin.value).toBe('35');
    form.controls.pricing.controls.targetMargin.setValue('27,5');
    form.controls.pricing.controls.commission.setValue('5');
    const p = formToProduct(form, product);
    expect(p.pricing.targetMargin).toBe('0.275');
    expect(p.pricing.commissionRate).toBe('0.05');
  });

  it('interpreta números es-CO, redondeo personalizado y modo unidad', () => {
    const product = buildDemoSeed().products[0];
    const form = buildProductForm(fb);
    patchForm(fb, form, product);
    form.controls.labor.controls.hourlyRate.setValue('12.500');
    form.controls.pricing.controls.rounding.setValue('custom');
    form.controls.pricing.controls.customRounding.setValue('250');
    form.controls.info.controls.costingMode.setValue('unit');
    const p = formToProduct(form, product);
    expect(p.laborHourlyRate).toBe('12500');
    expect(p.pricing.roundingStep).toBe('250');
    expect(p.sellableUnits).toBe('1');
    expect(p.unitsMade).toBeNull();
  });

  it('marca inválidos los valores fuera de rango', () => {
    const form = buildProductForm(fb);
    form.controls.pricing.controls.targetMargin.setValue('100');
    form.controls.pricing.controls.commission.setValue('-1');
    form.controls.info.controls.sellableUnits.setValue('0');
    expect(form.controls.pricing.controls.targetMargin.errors).toEqual({ maxExclusive: 100 });
    expect(form.controls.pricing.controls.commission.errors).toEqual({ min: 0 });
    expect(form.controls.info.controls.sellableUnits.errors).toEqual({ positive: true });
  });
});
