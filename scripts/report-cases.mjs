// R1 · The inspections the report is checked against.
//
// Twelve cases, each one a shape the report has to survive: nothing recorded, a
// full walk-around, thirty damage pins, only tall phone photos, only wide ones,
// notes long enough to reflow a page, a truck, a Pay Per Use inspection, an
// inspection recorded on the older form, and one with no photos at all.
//
// They are plain objects, so the test runs without the database.

const photo = name => `https://example.test/photos/${name}.jpg`

const EXTERIOR_SLOTS = ['exteriorFrontPhoto', 'exteriorRearPhoto', 'exteriorDriverPhoto', 'exteriorPassengerPhoto']
const INTERIOR_SLOTS = ['interiorDriverDoorPhoto', 'interiorRearDriverDoorPhoto', 'interiorTrunkPhoto', 'interiorRearPassengerDoorPhoto', 'interiorPassengerDoorPhoto', 'dashboardPhoto']
const DOC_SLOTS = ['licensePlatePhoto', 'registrationPhoto', 'insurancePhoto']

const ALL_TESTS = {
  engineStarts: 'pass', shiftsToD: 'pass', shiftsToR: 'pass', parkingBrake: 'pass',
  headlights: 'pass', taillights: 'pass', turnSignals: 'pass', brakeLights: 'pass', hazardLights: 'pass',
  horn: 'pass', wipers: 'pass', washerFluid: 'pass', ac: 'pass', heater: 'pass', radio: 'pass',
  powerWindows: 'pass', powerLocks: 'pass', mirrors: 'pass',
}

function shapes(keys, shape) {
  return Object.fromEntries(keys.map(k => [photo(k), shape]))
}

function baseInspection(overrides = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    created_at: '2026-09-01T15:04:00.000Z',
    vin: '1N4BL4BVXRN354582',
    year: 2024,
    make: 'NISSAN',
    model: 'Altima',
    odometer: 69279,
    location: 'Big Rig Parking',
    inspector_name: 'J. Smith',
    vehicleInfo: { advancedInfo: { trim: 'S', bodyClass: 'Sedan', driveType: '4x2', displacementL: '2.5', fuelTypePrimary: 'Gasoline' } },
    bol_data: { bolPresent: true, bolNotes: 'BOL matches vehicle' },
    keys_data: { mechanicalKeys: 1, keyFobs: 2 },
    vehicle_function_data: { tests: ALL_TESTS },
    documentation_data: { registrationCurrent: true, insurancePresent: true, licensePlate: 'RNJ-351', licensePlateState: 'OK' },
    exterior_data: {
      overallCondition: 'good', paintCondition: 'good', glassCondition: 'good',
      tireFrontLeft: { treadDepth: '13' }, tireFrontRight: { treadDepth: '13' },
      tireRearLeft: { treadDepth: '12' }, tireRearRight: { treadDepth: '12' },
    },
    interior_data: { overallCondition: 'good', frontSeats: 'stained', rearSeats: 'burned', dashboard: 'good', headliner: 'stained', carpetFloor: 'stained', steeringWheel: 'good', interiorOdor: true, odorType: 'other' },
    engine_data: { oilLevel: 'good', coolantLevel: 'good', brakeFluid: 'low', transmissionFluid: 'not_checked', batteryCondition: 'good', beltCondition: 'good', hoseCondition: 'good' },
    ...overrides,
  }
}

function withPhotos(inspection, slots, shape) {
  const next = JSON.parse(JSON.stringify(inspection))
  for (const key of slots) {
    const section = EXTERIOR_SLOTS.includes(key) ? 'exterior_data'
      : INTERIOR_SLOTS.includes(key) ? 'interior_data'
      : DOC_SLOTS.includes(key) ? 'documentation_data'
      : key === 'keysPhoto' ? 'keys_data'
      : key === 'bolPhoto' ? 'bol_data'
      : 'engine_data'
    next[section] = { ...next[section], [key]: photo(key) }
  }
  return { inspection: next, photoShapes: shapes(slots, shape) }
}

const FULL_SLOTS = [...EXTERIOR_SLOTS, ...INTERIOR_SLOTS, 'engineBayPhoto', ...DOC_SLOTS, 'bolPhoto', 'keysPhoto']

function pins(count) {
  const areas = ['Bumper Rear', 'Door Front Left', 'Hood', 'Fender Rear Right', 'Roof', 'Door Rear Right']
  const types = ['Scratched - Except Glass', 'Dented - Paint/Chrome Broken', 'Chipped - Except Glass and Panel Edge', 'Gouged']
  const severities = [['Up to 1 inch', 1], ['1-3 inches', 2], ['3-6 inches', 3], ['6-12 inches', 4], ['Over 12 inches', 5]]
  return Array.from({ length: count }, (_, i) => {
    const [severity, severityCode] = severities[i % severities.length]
    return {
      number: i + 1,
      area: areas[i % areas.length],
      type: types[i % types.length],
      severity,
      severityCode,
      assetType: '2d',
      view: 'rear',
      x: 20 + (i * 7) % 60,
      y: 30 + (i * 11) % 40,
      photoUrl: photo(`damage-${i + 1}`),
      modelAssetId: 'diagram-1',
    }
  })
}

const longNote = 'Dirty throughout with heavy pet hair in the rear footwells and boot. '.repeat(12)

export const REPORT_CASES = [
  {
    name: 'nothing recorded',
    inspection: {
      id: '00000000-0000-4000-8000-000000000002',
      created_at: '2026-09-02T09:00:00.000Z',
      vin: '1FTFW1ET5DFA00001',
      vehicle_function_data: {},
      exterior_data: {}, interior_data: {}, engine_data: {}, documentation_data: {}, keys_data: {}, bol_data: {},
    },
    photoShapes: {},
  },
  {
    name: 'full walk-around',
    ...withPhotos(baseInspection(), FULL_SLOTS, 'tall'),
    companyName: 'Big Rig Parking',
    inspectorName: 'J. Smith',
  },
  {
    name: 'thirty damage pins',
    ...withPhotos(baseInspection(), FULL_SLOTS, 'tall'),
    pins: pins(30),
    diagram: 'diagram-1',
  },
  {
    name: 'one damage pin',
    ...withPhotos(baseInspection(), FULL_SLOTS, 'tall'),
    pins: pins(1),
    diagram: 'diagram-1',
  },
  {
    name: 'only wide photos',
    ...withPhotos(baseInspection(), FULL_SLOTS, 'wide'),
  },
  {
    name: 'only square photos',
    ...withPhotos(baseInspection(), FULL_SLOTS, 'square'),
  },
  {
    name: 'no photos',
    inspection: baseInspection(),
    photoShapes: {},
  },
  {
    name: 'long notes',
    ...withPhotos(
      baseInspection({
        exterior_data: { ...baseInspection().exterior_data, exteriorNotes: longNote },
        interior_data: { ...baseInspection().interior_data, interiorNotes: longNote },
        engine_data: { ...baseInspection().engine_data, engineNotes: longNote },
        vehicle_function_data: { tests: ALL_TESTS, functionNotes: longNote },
      }),
      FULL_SLOTS,
      'tall',
    ),
  },
  {
    name: 'older form',
    // Recorded before the field names changed: flat tests, tireTreadFL, carpet,
    // overallExterior, plateState, and the engine photo under enginePhoto.
    ...withPhotos(
      {
        id: '00000000-0000-4000-8000-000000000003',
        created_at: '2026-05-28T21:05:00.000Z',
        vin: '4A4MM21S25E074248',
        year: 2005, make: 'MITSUBISHI', model: 'Endeavor',
        vehicle_function_data: ALL_TESTS,
        exterior_data: { overallExterior: 'good', paintCondition: 'faded', glassCondition: 'chipped', tireTreadFL: '5', tireTreadFR: '5', tireTreadRL: '5', tireTreadRR: '5' },
        interior_data: { overallInterior: 'good', carpet: 'stained', frontSeats: 'stained' },
        engine_data: { oilLevel: 'good', coolantLevel: 'good' },
        documentation_data: { licensePlate: 'QQQ-111', plateState: 'CA', registrationCurrent: true },
        keys_data: { keyFobs: 1 },
        bol_data: { bolProvided: true },
      },
      ['exteriorFrontPhoto', 'enginePhoto', 'licensePlatePhoto'],
      'tall',
    ),
  },
  {
    name: 'failed tests',
    ...withPhotos(
      baseInspection({
        vehicle_function_data: { tests: { ...ALL_TESTS, horn: 'fail', brakeLights: 'fail', ac: 'nt' } },
        engine_data: { ...baseInspection().engine_data, visibleLeaks: true, checkEngineLight: true, unusualNoise: true },
      }),
      FULL_SLOTS,
      'tall',
    ),
  },
  {
    name: 'four damage pins',
    // The most damage that still prints as cards; one more and it is a table.
    ...withPhotos(baseInspection(), FULL_SLOTS, 'tall'),
    pins: pins(4),
    diagram: 'diagram-1',
  },
  {
    name: 'assist filled',
    // Every AI slot the layout reserves, filled, so the phase C output has a
    // place to land that is already known to fit.
    ...withPhotos(baseInspection(), FULL_SLOTS, 'tall'),
    pins: pins(1),
    diagram: 'diagram-1',
    assist: {
      verdict: ['Clean exterior and all 18 function tests passed.', 'Brake fluid is low and the interior needs reconditioning.'],
      summary: 'Recorded at 69,279 miles. Paint and glass are good, with one small scratch on the rear bumper, and tread depth is 12–13/32" on all four tires. Under the hood, brake fluid is low and oil residue was noted around the fill cap; transmission fluid was not checked.',
      recommendations: [
        { urgency: 'Before road use', action: 'Top up brake fluid and check for a leak', why: 'Brake fluid recorded low', source: 'Maintenance guidance' },
        { urgency: 'Before road use', action: 'Confirm steering recall 23V882000 was repaired', why: 'Open recall', source: 'NHTSA recall 23V882000' },
        { urgency: 'Soon', action: 'Check transmission fluid', why: 'Not checked', source: 'Maintenance guidance' },
        { urgency: 'Reconditioning', action: 'Interior detail and odor treatment', why: 'Stains and odor recorded', source: 'NAAA grading scale, interior' },
      ],
      recalls: [{ id: '23V882000', component: 'Steering: rack and pinion', summary: 'Bolts connecting the electric power steering unit to the steering rack may loosen, which can cause loss of steering control.', reportedOn: 'Dec 21, 2023' }],
      complaints: { count: 41, topAreas: ['service brakes', 'steering', 'engine'] },
      photoCheck: '2 photos may be in the wrong slot: "Rear" shows the driver side.',
    },
  },
]
