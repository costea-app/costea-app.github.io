import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom } from 'rxjs';

export interface ConfirmData {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
}

@Component({
  selector: 'app-confirm-dialog',
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content><p>{{ data.message }}</p></mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button [mat-dialog-close]="false" cdkFocusInitial>Cancelar</button>
      <button mat-flat-button [class.danger-button]="data.danger" [mat-dialog-close]="true">
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialog {
  readonly data = inject<ConfirmData>(MAT_DIALOG_DATA);
}

export async function confirmAction(dialog: MatDialog, data: ConfirmData): Promise<boolean> {
  const ref = dialog.open(ConfirmDialog, { data, width: '440px', maxWidth: '92vw' });
  return (await firstValueFrom(ref.afterClosed())) === true;
}
