import { Component, inject, signal } from '@angular/core';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SessionService, authErrorMessage } from '../../core/auth/session.service';
import { fieldError } from '../../shared/decimal-field';
import { AuthLayout } from './auth-layout';

function matchPassword(group: AbstractControl): ValidationErrors | null {
  const confirm = group.get('confirm');
  const mismatch = group.get('password')?.value !== confirm?.value;
  if (confirm) {
    const { mismatch: _ignored, ...rest } = confirm.errors ?? {};
    confirm.setErrors(mismatch && confirm.value ? { ...rest, mismatch: true } : Object.keys(rest).length ? rest : null);
  }
  return null;
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule, MatProgressBarModule, AuthLayout],
  template: `
    <app-auth-layout heading="Crea tu cuenta">
        <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
          @if (error()) { <div class="notice notice-error" role="alert"><mat-icon aria-hidden="true">error</mat-icon><div>{{ error() }}</div></div> }
          <mat-form-field>
            <mat-label>Correo electrónico</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="email" required />
            @if (form.controls.email.invalid) { <mat-error>{{ err(form.controls.email) }}</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>Contraseña</mat-label>
            <input matInput [type]="showPassword() ? 'text' : 'password'" formControlName="password" autocomplete="new-password" required />
            <button mat-icon-button matSuffix type="button" (click)="showPassword.set(!showPassword())" [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'" [attr.aria-pressed]="showPassword()">
              <mat-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
            <mat-hint>Al menos 8 caracteres. Guárdala bien: esta versión no tiene recuperación por correo.</mat-hint>
            @if (form.controls.password.invalid) { <mat-error>{{ err(form.controls.password) }}</mat-error> }
          </mat-form-field>
          <mat-form-field>
            <mat-label>Repite la contraseña</mat-label>
            <input matInput [type]="showConfirm() ? 'text' : 'password'" formControlName="confirm" autocomplete="new-password" required />
            <button mat-icon-button matSuffix type="button" (click)="showConfirm.set(!showConfirm())" [attr.aria-label]="showConfirm() ? 'Ocultar confirmación de contraseña' : 'Mostrar confirmación de contraseña'" [attr.aria-pressed]="showConfirm()">
              <mat-icon>{{ showConfirm() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
            @if (form.controls.confirm.invalid) { <mat-error>{{ err(form.controls.confirm) }}</mat-error> }
          </mat-form-field>
          @if (loading()) { <mat-progress-bar mode="indeterminate" aria-label="Creando cuenta" /> }
          <button mat-flat-button type="submit" [disabled]="loading() || !session.accountsAvailable">Crear cuenta</button>
          <p class="small">¿Ya tienes cuenta? <a routerLink="/ingresar">Ingresa</a></p>
        </form>
    </app-auth-layout>
  `,
})
export class RegisterPage {
  readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly form = inject(NonNullableFormBuilder).group(
    {
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirm: ['', [Validators.required]],
    },
    { validators: matchPassword },
  );
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);
  readonly showConfirm = signal(false);
  readonly err = fieldError;

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const email = this.form.controls.email.value.trim();
      await this.session.signUp(email, this.form.controls.password.value);
      await this.router.navigateByUrl('/app');
    } catch (e) {
      this.error.set(authErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
