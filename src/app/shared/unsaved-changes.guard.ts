import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { confirmAction } from './confirm-dialog';

export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component.hasUnsavedChanges()) return true;
  return confirmAction(inject(MatDialog), {
    title: '¿Salir sin guardar?',
    message: 'Tienes cambios sin guardar en este costeo. Si sales ahora, se perderán.',
    confirmLabel: 'Salir sin guardar',
    danger: true,
  });
};
