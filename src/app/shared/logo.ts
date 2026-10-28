import { Component } from '@angular/core';

@Component({
  selector: 'app-logo',
  template: `
    <span class="logo">
      <svg viewBox="0 0 64 64" width="32" height="32" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="#2e7d32" />
        <path d="M42 22a14 14 0 1 0 0 20" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" />
        <circle cx="44" cy="32" r="4" fill="#c5e1a5" />
      </svg>
      <span class="logo-text">Costea</span>
    </span>
  `,
  styles: `
    .logo { display: inline-flex; align-items: center; gap: 8px; }
    .logo-text { font-weight: 800; font-size: 1.3rem; color: var(--c-ink); letter-spacing: -.01em; }
  `,
})
export class Logo {}
