import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<a class="skip-link" href="#contenido" (click)="skip($event)">Saltar al contenido</a><router-outlet />`,
})
export class App {
  skip(event: Event): void {
    event.preventDefault();
    const main = document.getElementById('contenido');
    main?.setAttribute('tabindex', '-1');
    main?.focus();
  }
}
