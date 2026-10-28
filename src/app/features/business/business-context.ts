import { Injectable, inject, signal } from '@angular/core';
import { DataService } from '../../core/data/data.service';
import { errorMessage } from '../../core/data/repository';
import { Business, Material } from '../../core/models/domain';

/** Estado compartido por las pestañas de un negocio (se provee en BusinessPage). */
@Injectable()
export class BusinessContext {
  private readonly data = inject(DataService);
  readonly business = signal<Business | null>(null);
  readonly materials = signal<Material[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly notFound = signal(false);

  async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.notFound.set(false);
    try {
      const [business, materials] = await Promise.all([
        this.data.repo.getBusiness(id),
        this.data.repo.listMaterials(id),
      ]);
      this.business.set(business);
      this.materials.set(materials);
      this.notFound.set(!business);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.loading.set(false);
    }
  }

  async reloadMaterials(): Promise<void> {
    const b = this.business();
    if (b) this.materials.set(await this.data.repo.listMaterials(b.id));
  }
}
