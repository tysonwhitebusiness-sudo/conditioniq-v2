// B3 · The damage guide given to the model.
//
// Written in our own words from the sources cited; nothing is copied. It is
// built on the same standard the app's damage pins record (AIAG M-22 codes),
// so what the model suggests maps straight onto what an inspector confirms.
//
// Sources:
//   [M22]  AIAG-ECG M-22 damage code tables, version 5 (11/2021)
//   [FORD] Ford Credit Wear and Use Evaluator Card and Guidelines
//   [NAAA] NAAA Vehicle Condition Grading Scale
//   [LOT]  what Condition IQ inspectors photograph on storage lots

export const DAMAGE_GUIDE_VERSION = 'guide-v1'

export const DAMAGE_GUIDE = `
DAMAGE GUIDE — what counts, how it looks in a photo, and what it is not

General rules
- Report damage to the vehicle itself: body panels, bumpers, glass, lamps, trim, wheels, tires and the interior. Do not report damage to other vehicles, the ground, buildings or anything outside the vehicle.
- Report only what you can see. Photos taken on lots show dust, rain spots, reflections, shadows and gravel; none of these is damage. [LOT]
- Normal manufacturing lines are not damage: panel gaps, body creases, door handles, trim seams, sensor holes, badges and tow-hook covers. [LOT]
- Dealer stickers, window markings, protective film and plate frames are not damage.
- When unsure, give a lower confidence rather than leaving damage out; the inspector confirms every suggestion.

scratch — scratched, scuffed or chipped paint (AIAG types 05, 09, 12, 34) [M22]
- A scratch is a line through the paint or chrome; it catches light differently from the paint around it and often shows lighter primer or bare metal. A scuff is a rub mark that has not broken the surface, often a transfer of another colour. A chip is a small spot of missing paint from an impact, often on the hood front and bumper; along a door edge it is a chipped panel edge.
- Not a scratch: a reflection of a tree, wire or building (it follows the panel's curve and continues past the panel's edge), a crease line that runs the length of the car, water or dust streaks, or a crack in the sky's reflection.
- On a wide shot of a whole vehicle, a scratch is only visible when it is long or bright; do not guess at fine scratches.

dent — an inward depression (AIAG types 04 with paint broken, 14 with paint intact) [M22]
- Shows as a break in the reflection: straight reflected lines bend, pinch or ripple where the panel is pushed in. Dents are easiest to see on doors, fenders and quarter panels at an angle.
- Not a dent: the designed curves and body lines of the panel, the join between two panels, or a distorted reflection on curved glass.
- Up to about 4 inches with the paint intact is usually treated as normal wear on a lease return, so small dents still count here but at the confidence you see them. [FORD]

tear — torn, cracked or broken panel, bumper cover or trim (AIAG types 06 cracked, 13 torn, 01 bent) [M22]
- A crack is a narrow split where the pieces still hold together; a tear has ragged edges; a bent part is visibly out of shape. Common on plastic bumper covers, grilles, mirror housings, splash panels and interior trim or seats.
- Not a tear: the seam between a bumper cover and a fender, or a grille's designed openings.

glass — cracked, broken, chipped or scratched glass (AIAG types 20, 21, 22, 23) [M22]
- A crack is a thin bright or dark line through the glass, often spreading from a star-shaped chip; broken glass is shattered or missing. Chips are small star or bullseye marks, most often low on the windshield.
- All glass damage matters: even small chips need repair. [FORD]
- Not glass damage: reflections, wiper arcs of dirt, the dotted black band at the glass edge, defroster lines on rear glass, or stickers.

missing — a part that should be there is not (AIAG types 08, 38) [M22]
- Look for empty mounting points, exposed brackets, a bare area where a bumper, mirror, lamp, emblem, wheel cap or trim piece belongs, or visible wiring where a lamp was.
- Not missing: parts a trim level simply does not have, an empty license plate bracket, or parts out of frame.

puncture — a hole through a panel or glass (AIAG type 11) [M22]
- A clean or jagged hole showing the dark space behind the surface. Rare on lots; do not confuse with vents, sensors, tow-hook covers or drain holes, which are round and evenly placed.

lamp — a broken headlamp, tail lamp, fog lamp or marker lens (AIAG type 24, areas 24, 25, 45) [M22]
- A crack or hole in the lens, missing pieces, or a lamp that is visibly smashed. Scratches and scuffs on a lens are normal wear, not a broken lamp. [FORD]

Severity
- Severity is the size of the damage: up to 1 inch, 1–3, 3–6, 6–12, over 12 inches, or missing/major. [M22] A photo cannot measure inches reliably without something of known size in it, so the inspector always sets severity; you only report what and where.
- Several damages on one panel are reported once for that panel with the most serious type. [M22]
`.trim()
