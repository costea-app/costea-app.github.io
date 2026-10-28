import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink, MatButtonModule, MatIconModule],
  template: `
    <main id="contenido" class="container page">
      <div class="state">
        <mat-icon aria-hidden="true">explore_off</mat-icon>
        <h1>No encontramos esta página</h1>
        <p>Puede que el enlace esté incompleto o que el elemento se haya eliminado.</p>
        <a mat-flat-button routerLink="/">Ir al inicio</a>
      </div>
    </main>
  `,
})
export class NotFoundPage {}
