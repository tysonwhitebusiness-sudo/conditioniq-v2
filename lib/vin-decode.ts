export interface VINDecodeResult {
  make: string
  model: string
  year: string
  trim?: string
  bodyClass?: string
  doors?: string
  driveType?: string
  transmissionStyle?: string
  cylinders?: string
  displacement?: string
  horsepower?: string
  fuelType?: string
  gvwr?: string
  manufacturer?: string
  plantCity?: string
}

interface NHTSAVariable {
  Variable: string
  Value: string | null
}

export async function decodeVIN(vin: string): Promise<VINDecodeResult | null> {
  if (vin.length !== 17) return null
  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`,
      { cache: 'force-cache' }
    )
    if (!res.ok) return null
    const json = await res.json()
    const vars: NHTSAVariable[] = json.Results ?? []
    const get = (name: string) => vars.find(v => v.Variable === name)?.Value ?? ''

    const make = get('Make')
    const model = get('Model')
    const year = get('Model Year')

    if (!make || !model || !year) return null

    return {
      make,
      model,
      year,
      trim: get('Trim') || undefined,
      bodyClass: get('Body Class') || undefined,
      doors: get('Doors') || undefined,
      driveType: get('Drive Type') || undefined,
      transmissionStyle: get('Transmission Style') || undefined,
      cylinders: get('Engine Number of Cylinders') || undefined,
      displacement: get('Displacement (L)') || undefined,
      horsepower: get('Engine Brake (hp) From') || undefined,
      fuelType: get('Fuel Type - Primary') || undefined,
      gvwr: get('Gross Vehicle Weight Rating From') || undefined,
      manufacturer: get('Manufacturer Name') || undefined,
      plantCity: get('Plant City') || undefined,
    }
  } catch {
    return null
  }
}
