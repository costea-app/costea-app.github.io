import { Routes } from '@angular/router';
import { appAreaGuard, guestGuard } from './core/auth/guards';
import { unsavedChangesGuard } from './shared/unsaved-changes.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Costea — Que ningún costo se quede por fuera',
    loadComponent: () => import('./features/landing/landing.page').then((m) => m.LandingPage),
  },
  {
    path: 'ingresar',
    title: 'Ingresar · Costea',
    canMatch: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'registro',
    title: 'Crear cuenta · Costea',
    canMatch: [guestGuard],
    loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage),
  },
  {
    path: 'app',
    canMatch: [appAreaGuard],
    loadComponent: () => import('./features/shell/app-shell').then((m) => m.AppShell),
    children: [
      {
        path: '',
        title: 'Mis negocios · Costea',
        loadComponent: () => import('./features/businesses/businesses.page').then((m) => m.BusinessesPage),
      },
      {
        path: 'negocios/:businessId/productos/nuevo',
        title: 'Nuevo costeo · Costea',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/wizard/product-wizard.page').then((m) => m.ProductWizardPage),
      },
      {
        path: 'negocios/:businessId/productos/:productId/editar',
        title: 'Editar costeo · Costea',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./features/wizard/product-wizard.page').then((m) => m.ProductWizardPage),
      },
      {
        path: 'negocios/:businessId/productos/:productId/reporte',
        title: 'Reporte · Costea',
        loadComponent: () => import('./features/reports/product-report.page').then((m) => m.ProductReportPage),
      },
      {
        path: 'negocios/:businessId/reportes/:snapshotId',
        title: 'Reporte guardado · Costea',
        loadComponent: () => import('./features/reports/snapshot.page').then((m) => m.SnapshotPage),
      },
      {
        path: 'negocios/:businessId',
        loadComponent: () => import('./features/business/business.page').then((m) => m.BusinessPage),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'productos' },
          {
            path: 'productos',
            title: 'Productos · Costea',
            loadComponent: () => import('./features/business/products.page').then((m) => m.ProductsPage),
          },
          {
            path: 'materiales',
            title: 'Materiales · Costea',
            loadComponent: () => import('./features/business/materials.page').then((m) => m.MaterialsPage),
          },
          {
            path: 'reportes',
            title: 'Reportes guardados · Costea',
            loadComponent: () => import('./features/business/reports.page').then((m) => m.ReportsPage),
          },
        ],
      },
    ],
  },
  {
    path: '**',
    title: 'Página no encontrada · Costea',
    loadComponent: () => import('./features/not-found.page').then((m) => m.NotFoundPage),
  },
];
