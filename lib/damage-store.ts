import {
  getDamageMarkersForVehicle, createDamageMarker, deleteDamageMarker,
  type DamageMarkerSource, type DamageMarkerView, type VehicleTemplate,
} from '@/lib/damage-actions'
import {
  listInspectionMarkers, createInspectionMarker, deleteInspectionMarker,
  uploadDamageMarkerPhoto, removeDamageMarkerPhoto, getDamageMarkerPhotoUrls,
  type DamageMarkerWithPhoto, type NewMarkerInput,
} from '@/lib/damage-server-actions'

// Where damage pins are read from and written to. The 2D and 3D taggers are the
// same for intake, outtake and the full inspection; only the scope differs:
//
// - vehicle scope (intake/outtake): pins belong to the vehicle, written from the
//   browser under the existing row policies, exactly as before.
// - inspection scope (full inspection): pins belong to one inspection, written
//   through server actions so link inspectors can place them too.

export type { DamageMarkerWithPhoto, NewMarkerInput }

export interface DamageStore {
  // Stable identity for effect dependencies.
  key: string
  listMarkers(filter?: { modelAssetId?: string; view?: DamageMarkerView }): Promise<DamageMarkerWithPhoto[]>
  createMarker(input: NewMarkerInput): Promise<DamageMarkerWithPhoto | null>
  deleteMarker(id: string): Promise<void>
  uploadPhoto(markerId: string, dataUrl: string): Promise<string>
  removePhoto(markerId: string): Promise<void>
}

export function vehicleDamageStore(opts: {
  vehicleId: string
  companyId: string
  vehicleTemplate: VehicleTemplate
  source: DamageMarkerSource
  createdBy?: string
}): DamageStore {
  return {
    key: `vehicle:${opts.vehicleId}:${opts.source}`,
    async listMarkers(filter) {
      const markers = (await getDamageMarkersForVehicle(opts.vehicleId, filter)) as DamageMarkerWithPhoto[]
      const withPhotos = markers.filter(m => m.photo_path).map(m => m.id)
      if (withPhotos.length === 0) return markers
      const urls = await getDamageMarkerPhotoUrls(withPhotos).catch(() => ({} as Record<string, string>))
      return markers.map(m => ({ ...m, photo_url: urls[m.id] ?? null }))
    },
    async createMarker(input) {
      return createDamageMarker(opts.companyId, {
        vehicleId: opts.vehicleId,
        source: opts.source,
        vehicleTemplate: opts.vehicleTemplate,
        areaCodeId: input.areaCodeId,
        typeCodeId: input.typeCodeId,
        severityCodeId: input.severityCodeId,
        xPosition: input.xPosition,
        yPosition: input.yPosition,
        zPosition: input.zPosition ?? undefined,
        createdBy: opts.createdBy,
        modelAssetId: input.modelAssetId ?? undefined,
        assetType: input.assetType ?? undefined,
        view: input.view ?? undefined,
      })
    },
    deleteMarker: id => deleteDamageMarker(id),
    uploadPhoto: (markerId, dataUrl) => uploadDamageMarkerPhoto(markerId, dataUrl),
    removePhoto: markerId => removeDamageMarkerPhoto(markerId),
  }
}

export function inspectionDamageStore(inspectionId: string): DamageStore {
  return {
    key: `inspection:${inspectionId}`,
    listMarkers: filter => listInspectionMarkers(inspectionId, filter),
    createMarker: input => createInspectionMarker(inspectionId, input),
    deleteMarker: id => deleteInspectionMarker(inspectionId, id),
    uploadPhoto: (markerId, dataUrl) => uploadDamageMarkerPhoto(markerId, dataUrl),
    removePhoto: markerId => removeDamageMarkerPhoto(markerId),
  }
}
