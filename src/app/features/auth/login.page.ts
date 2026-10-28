import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { SessionService, authErrorMessage } from '../../core/auth/session.service';
import { fieldError } from '../../shared/decimal-field';
import { AuthLayout } from './auth-layout';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule, MatProgressBarModule, AuthLayout],
  template: `
    <app-auth-layout heading="Ingresa a tu cuenta">
      <form [formGroup]="form" (ngSubmit)="submit()" class="stack" novalidate>
        @if (error()) { <div class="notice notice-error" role="alert"><mat-icon aria-hidden="true">error</mat-icon><div>{{ error() }}</div></div> }
        <mat-form-field>
          <mat-label>Correo electrónico</mat-label>
          <input matInput type="email" formControlName="email" autocomplete="email" required />
          @if (form.controls.email.invalid) { <mat-error>{{ err(form.controls.email) }}</mat-error> }
        </mat-form-field>
        <mat-form-field>
          <mat-label>Contraseña</mat-label>
          <input matInput [type]="show() ? 'text' : 'password'" formControlName="password" autocomplete="current-password" required />
          <button mat-icon-button matSuffix type="button" (click)="show.set(!show())" [attr.aria-label]="show() ? 'Ocultar contraseña' : 'Mostrar contraseña'" [attr.aria-pressed]="show()">
            <mat-icon>{{ show() ? 'visibility_off' : 'visibility' }}</mat-icon>
          </button>
          @if (form.controls.password.invalid) { <mat-error>{{ err(form.controls.password) }}</mat-error> }
        </mat-form-field>
        @if (loading()) { <mat-progress-bar mode="indeterminate" aria-label="Ingresando" /> }
        <button mat-flat-button type="submit" [disabled]="loading() || !session.accountsAvailable">Ingresar</button>
        <p class="small">¿No tienes cuenta? <a routerLink="/registro">Crea una gratis</a></p>
      </form>
    </app-auth-layout>
  `,
})
export class LoginPage {
  readonly session = inject(SessionService);
  private readonly router = inject(Router);
  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly show = signal(false);
  readonly err = fieldError;

  async submit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const { email, password } = this.form.getRawValue();
      await this.session.signIn(email.trim(), password);
      await this.router.navigateByUrl('/app');
    } catch (e) {
      this.error.set(authErrorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }
}
