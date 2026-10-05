/* ============================================================================
 * reference_buildings.js
 *
 * DOE Commercial Reference Building end-use energy intensity dataset.
 *
 * Source: US DOE / NREL Commercial Reference Building models
 *   https://www.energy.gov/eere/buildings/commercial-reference-buildings
 *
 * Values here are annual site energy use intensity (EUI), in kBtu/sqft/year,
 * broken out by end use, per building type per ASHRAE climate zone.
 *
 * These are physics-based reference values computed via EnergyPlus simulation
 * of DOE's standard prototype buildings under standard operating conditions
 * (post-1980 vintage, code-compliant construction). They are the accepted
 * industry baseline for benchmarking commercial buildings.
 *
 * Beacon Pro uses these values to answer:
 *   "How does this client's building compare to a physics-based DOE reference
 *    model of its type in its climate zone, at the end-use level?"
 *
 * When a client has real consumption data (Beacon Pro), the comparison is
 * apples-to-apples. When only spend/estimated consumption is available
 * (Beacon Free), we fall back to a coarser estimate.
 *
 * BUILDING TYPES (16 DOE prototypes):
 *   small_office, medium_office, large_office,
 *   small_hotel, large_hotel,
 *   quick_service_restaurant, full_service_restaurant,
 *   hospital, outpatient_healthcare,
 *   primary_school, secondary_school,
 *   stand_alone_retail, strip_mall, supermarket,
 *   warehouse, mid_rise_apartment
 *
 * CLIMATE ZONES (ASHRAE 169-2013):
 *   1A (very hot humid), 2A (hot humid), 2B (hot dry),
 *   3A (warm humid), 3B (warm dry), 3C (warm marine),
 *   4A (mixed humid), 4B (mixed dry), 4C (mixed marine),
 *   5A (cool humid), 5B (cool dry),
 *   6A (cold humid), 6B (cold dry),
 *   7 (very cold), 8 (subarctic)
 *
 * END USES (kBtu/sqft/year):
 *   heating, cooling, interior_lighting, exterior_lighting,
 *   interior_equipment (plug loads), water_heating,
 *   fans, pumps, refrigeration
 *   total = sum of above
 *
 * ========================================================================= */

(function () {
  'use strict';

  // ── Climate zone lookup by state ──────────────────────────────────────
  // Coarse assignment: uses each state's most populous climate zone.
  // For precision, cross-reference against ZIP-level ASHRAE 169-2013 maps.
  const STATE_TO_CLIMATE_ZONE = {
    'AL': '3A', 'AK': '7',  'AZ': '2B', 'AR': '3A', 'CA': '3B',
    'CO': '5B', 'CT': '5A', 'DE': '4A', 'DC': '4A', 'FL': '2A',
    'GA': '3A', 'HI': '1A', 'ID': '5B', 'IL': '5A', 'IN': '5A',
    'IA': '5A', 'KS': '4A', 'KY': '4A', 'LA': '2A', 'ME': '6A',
    'MD': '4A', 'MA': '5A', 'MI': '5A', 'MN': '6A', 'MS': '3A',
    'MO': '4A', 'MT': '6B', 'NE': '5A', 'NV': '3B', 'NH': '6A',
    'NJ': '4A', 'NM': '4B', 'NY': '4A', 'NC': '3A', 'ND': '6A',
    'OH': '5A', 'OK': '3A', 'OR': '4C', 'PA': '5A', 'RI': '5A',
    'SC': '3A', 'SD': '6A', 'TN': '4A', 'TX': '2A', 'UT': '5B',
    'VT': '6A', 'VA': '4A', 'WA': '4C', 'WV': '4A', 'WI': '6A',
    'WY': '6B', 'PR': '1A',
  };

  // ── Reference building EUI data ────────────────────────────────────────
  // Structure: DATA[building_type][climate_zone] = { end_use: kBtu/sqft/yr, ... }
  //
  // Values derived from public DOE prototype building simulation results
  // (post-1980 vintage, current energy code). Rounded to 1 decimal.
  //
  // For zones not shown explicitly, use nearest zone with same letter suffix.
  // Every prototype's `total` was checked against the sum of its own end-use
  // components on 2026-09-17. All 16 prototypes across every climate zone
  // agree to within 0.05 except one: primary_school 5A carried total 78.5
  // against components summing to 80.5. Corrected to 80.5 — compareToReference
  // uses `total`, so every K-12 school in a 5A state (CT, IL, IN, IA, MA, MI,
  // NE, OH, PA, RI) was being scored against a benchmark 2.0 kBtu/sqft too
  // low, making its verdict about 2.5 points worse than the truth.
  const DATA = {

    small_office: {
      '1A': { heating: 1.2,  cooling: 21.5, interior_lighting: 14.8, exterior_lighting: 3.2, interior_equipment: 21.3, water_heating: 1.8, fans: 4.5, pumps: 0.8, refrigeration: 0.0, total: 69.1 },
      '2A': { heating: 3.8,  cooling: 18.2, interior_lighting: 14.8, exterior_lighting: 3.2, interior_equipment: 21.3, water_heating: 2.1, fans: 4.2, pumps: 0.9, refrigeration: 0.0, total: 68.5 },
      '2B': { heating: 4.2,  cooling: 16.8, interior_lighting: 14.8, exterior_lighting: 3.2, interior_equipment: 21.3, water_heating: 2.0, fans: 3.9, pumps: 0.7, refrigeration: 0.0, total: 66.9 },
      '3A': { heating: 7.5,  cooling: 14.5, interior_lighting: 14.8, exterior_lighting: 3.2, interior_equipment: 21.3, water_heating: 2.5, fans: 3.8, pumps: 1.0, refrigeration: 0.0, total: 68.6 },
      '3B': { heating: 6.8,  cooling: 12.9, interior_lighting: 14.8, exterior_lighting: 3.2, interior_equipment: 21.3, water_heating: 2.3, fans: 3.5, pumps: 0.9, refrigeration: 0.0, total: 65.7 },
      '3C': { heating: 5.2,  cooling: 8.5,  interior_lighting: 14.8, exterior_lighting: 3.2, interior_equipment: 21.3, water_heating: 2.2, fans: 3.1, pumps: 0.7, refrigeration: 0.0, total: 59.0 },
      '4A': { heating: 12.4, cooling: 11.2, interior_lighting: 14.8, exterior_lighting: 3.2, interior_equipment: 21.3, water_heating: 2.8, fans: 3.6, pumps: 1.1, refrigeration: 0.0, total: 70.4 },
      '4B': { heating: 11.8, cooling: 10.5, interior_lighting: 14.8, exterior_lighting: 3.2, interior_equipment: 21.3, water_heating: 2.6, fans: 3.4, pumps: 1.0, refrigeration: 0.0, total: 68.6 },
      '4C': { heating: 10.5, cooling: 7.8,  interior_lighting: 14.8, exterior_lighting: 3.2, interior_equipment: 21.3, water_heating: 2.5, fans: 3.2, pumps: 0.9, refrigeration: 0.0, total: 64.2 },
      '5A': { heating: 17.8, cooling: 9.5,  interior_lighting: 14.8, exterior_lighting: 3.2, interior_equipment: 21.3, water_heating: 3.1, fans: 3.5, pumps: 1.2, refrigeration: 0.0, total: 74.4 },
      '5B': { heating: 15.2, cooling: 8.8,  interior_lighting: 14.8, exterior_lighting: 3.2, interior_equipment: 21.3, water_heating: 2.9, fans: 3.3, pumps: 1.1, refrigeration: 0.0, total: 70.6 },
      '6A': { heating: 22.5, cooling: 8.2,  interior_lighting: 14.8, exterior_lighting: 3.2, interior_equipment: 21.3, water_heating: 3.4, fans: 3.4, pumps: 1.3, refrigeration: 0.0, total: 78.1 },
      '6B': { heating: 20.1, cooling: 7.5,  interior_lighting: 14.8, exterior_lighting: 3.2, interior_equipment: 21.3, water_heating: 3.2, fans: 3.2, pumps: 1.2, refrigeration: 0.0, total: 74.5 },
      '7':  { heating: 28.5, cooling: 6.8,  interior_lighting: 14.8, exterior_lighting: 3.2, interior_equipment: 21.3, water_heating: 3.8, fans: 3.4, pumps: 1.4, refrigeration: 0.0, total: 83.2 },
      '8':  { heating: 38.2, cooling: 5.5,  interior_lighting: 14.8, exterior_lighting: 3.2, interior_equipment: 21.3, water_heating: 4.2, fans: 3.5, pumps: 1.5, refrigeration: 0.0, total: 92.2 },
    },

    medium_office: {
      '1A': { heating: 0.8,  cooling: 18.9, interior_lighting: 12.5, exterior_lighting: 2.1, interior_equipment: 19.8, water_heating: 1.2, fans: 6.5, pumps: 1.4, refrigeration: 0.0, total: 63.2 },
      '2A': { heating: 2.5,  cooling: 15.8, interior_lighting: 12.5, exterior_lighting: 2.1, interior_equipment: 19.8, water_heating: 1.4, fans: 6.1, pumps: 1.5, refrigeration: 0.0, total: 61.7 },
      '2B': { heating: 2.9,  cooling: 14.5, interior_lighting: 12.5, exterior_lighting: 2.1, interior_equipment: 19.8, water_heating: 1.3, fans: 5.7, pumps: 1.3, refrigeration: 0.0, total: 60.1 },
      '3A': { heating: 5.2,  cooling: 12.8, interior_lighting: 12.5, exterior_lighting: 2.1, interior_equipment: 19.8, water_heating: 1.7, fans: 5.5, pumps: 1.6, refrigeration: 0.0, total: 61.2 },
      '3B': { heating: 4.8,  cooling: 11.5, interior_lighting: 12.5, exterior_lighting: 2.1, interior_equipment: 19.8, water_heating: 1.6, fans: 5.2, pumps: 1.5, refrigeration: 0.0, total: 59.0 },
      '3C': { heating: 3.5,  cooling: 7.8,  interior_lighting: 12.5, exterior_lighting: 2.1, interior_equipment: 19.8, water_heating: 1.5, fans: 4.7, pumps: 1.2, refrigeration: 0.0, total: 53.1 },
      '4A': { heating: 8.9,  cooling: 9.8,  interior_lighting: 12.5, exterior_lighting: 2.1, interior_equipment: 19.8, water_heating: 1.9, fans: 5.3, pumps: 1.7, refrigeration: 0.0, total: 62.0 },
      '4B': { heating: 8.2,  cooling: 9.2,  interior_lighting: 12.5, exterior_lighting: 2.1, interior_equipment: 19.8, water_heating: 1.8, fans: 5.0, pumps: 1.6, refrigeration: 0.0, total: 60.2 },
      '4C': { heating: 7.5,  cooling: 6.8,  interior_lighting: 12.5, exterior_lighting: 2.1, interior_equipment: 19.8, water_heating: 1.7, fans: 4.7, pumps: 1.4, refrigeration: 0.0, total: 56.5 },
      '5A': { heating: 12.8, cooling: 8.2,  interior_lighting: 12.5, exterior_lighting: 2.1, interior_equipment: 19.8, water_heating: 2.1, fans: 5.1, pumps: 1.8, refrigeration: 0.0, total: 64.4 },
      '5B': { heating: 10.5, cooling: 7.5,  interior_lighting: 12.5, exterior_lighting: 2.1, interior_equipment: 19.8, water_heating: 2.0, fans: 4.9, pumps: 1.7, refrigeration: 0.0, total: 61.0 },
      '6A': { heating: 16.2, cooling: 7.1,  interior_lighting: 12.5, exterior_lighting: 2.1, interior_equipment: 19.8, water_heating: 2.3, fans: 5.0, pumps: 2.0, refrigeration: 0.0, total: 67.0 },
      '6B': { heating: 14.5, cooling: 6.5,  interior_lighting: 12.5, exterior_lighting: 2.1, interior_equipment: 19.8, water_heating: 2.2, fans: 4.8, pumps: 1.9, refrigeration: 0.0, total: 64.3 },
      '7':  { heating: 20.5, cooling: 5.8,  interior_lighting: 12.5, exterior_lighting: 2.1, interior_equipment: 19.8, water_heating: 2.6, fans: 5.0, pumps: 2.1, refrigeration: 0.0, total: 70.4 },
      '8':  { heating: 27.5, cooling: 4.8,  interior_lighting: 12.5, exterior_lighting: 2.1, interior_equipment: 19.8, water_heating: 2.9, fans: 5.1, pumps: 2.2, refrigeration: 0.0, total: 76.9 },
    },

    large_office: {
      '1A': { heating: 0.5,  cooling: 22.5, interior_lighting: 11.8, exterior_lighting: 1.5, interior_equipment: 22.1, water_heating: 0.8, fans: 9.2, pumps: 2.5, refrigeration: 0.0, total: 70.9 },
      '2A': { heating: 1.8,  cooling: 19.2, interior_lighting: 11.8, exterior_lighting: 1.5, interior_equipment: 22.1, water_heating: 1.0, fans: 8.7, pumps: 2.7, refrigeration: 0.0, total: 68.8 },
      '3A': { heating: 3.8,  cooling: 15.5, interior_lighting: 11.8, exterior_lighting: 1.5, interior_equipment: 22.1, water_heating: 1.2, fans: 7.9, pumps: 2.8, refrigeration: 0.0, total: 66.6 },
      '3B': { heating: 3.5,  cooling: 14.2, interior_lighting: 11.8, exterior_lighting: 1.5, interior_equipment: 22.1, water_heating: 1.1, fans: 7.5, pumps: 2.6, refrigeration: 0.0, total: 64.3 },
      '3C': { heating: 2.5,  cooling: 9.8,  interior_lighting: 11.8, exterior_lighting: 1.5, interior_equipment: 22.1, water_heating: 1.0, fans: 6.8, pumps: 2.2, refrigeration: 0.0, total: 57.7 },
      '4A': { heating: 6.5,  cooling: 12.2, interior_lighting: 11.8, exterior_lighting: 1.5, interior_equipment: 22.1, water_heating: 1.4, fans: 7.6, pumps: 3.0, refrigeration: 0.0, total: 66.1 },
      '4B': { heating: 6.1,  cooling: 11.5, interior_lighting: 11.8, exterior_lighting: 1.5, interior_equipment: 22.1, water_heating: 1.3, fans: 7.3, pumps: 2.9, refrigeration: 0.0, total: 64.5 },
      '4C': { heating: 5.5,  cooling: 8.5,  interior_lighting: 11.8, exterior_lighting: 1.5, interior_equipment: 22.1, water_heating: 1.2, fans: 6.9, pumps: 2.5, refrigeration: 0.0, total: 60.0 },
      '5A': { heating: 9.5,  cooling: 10.2, interior_lighting: 11.8, exterior_lighting: 1.5, interior_equipment: 22.1, water_heating: 1.6, fans: 7.4, pumps: 3.2, refrigeration: 0.0, total: 67.3 },
      '5B': { heating: 8.2,  cooling: 9.5,  interior_lighting: 11.8, exterior_lighting: 1.5, interior_equipment: 22.1, water_heating: 1.5, fans: 7.1, pumps: 3.0, refrigeration: 0.0, total: 64.7 },
      '6A': { heating: 12.5, cooling: 8.8,  interior_lighting: 11.8, exterior_lighting: 1.5, interior_equipment: 22.1, water_heating: 1.7, fans: 7.3, pumps: 3.4, refrigeration: 0.0, total: 69.1 },
      '6B': { heating: 11.2, cooling: 8.1,  interior_lighting: 11.8, exterior_lighting: 1.5, interior_equipment: 22.1, water_heating: 1.6, fans: 7.0, pumps: 3.3, refrigeration: 0.0, total: 66.6 },
      '7':  { heating: 16.5, cooling: 7.2,  interior_lighting: 11.8, exterior_lighting: 1.5, interior_equipment: 22.1, water_heating: 1.9, fans: 7.3, pumps: 3.5, refrigeration: 0.0, total: 71.8 },
      '8':  { heating: 22.5, cooling: 6.2,  interior_lighting: 11.8, exterior_lighting: 1.5, interior_equipment: 22.1, water_heating: 2.1, fans: 7.4, pumps: 3.6, refrigeration: 0.0, total: 77.2 },
    },

    // Compressed representation for remaining types — same climate zones,
    // characteristic EUIs. Full detail available in DOE reference docs.
    small_hotel: {
      '2A': { total: 74.5, heating: 8.5, cooling: 14.2, interior_lighting: 12.8, exterior_lighting: 4.5, interior_equipment: 15.6, water_heating: 12.5, fans: 4.8, pumps: 1.6, refrigeration: 0.0 },
      '4A': { total: 82.1, heating: 18.5, cooling: 9.2, interior_lighting: 12.8, exterior_lighting: 4.5, interior_equipment: 15.6, water_heating: 13.2, fans: 5.5, pumps: 2.8, refrigeration: 0.0 },
      '5A': { total: 89.5, heating: 24.8, cooling: 8.2, interior_lighting: 12.8, exterior_lighting: 4.5, interior_equipment: 15.6, water_heating: 14.1, fans: 5.7, pumps: 3.8, refrigeration: 0.0 },
      '6A': { total: 96.2, heating: 30.5, cooling: 7.5, interior_lighting: 12.8, exterior_lighting: 4.5, interior_equipment: 15.6, water_heating: 14.8, fans: 5.9, pumps: 4.6, refrigeration: 0.0 },
    },
    large_hotel: {
      '2A': { total: 118.5, heating: 12.5, cooling: 22.8, interior_lighting: 14.2, exterior_lighting: 3.8, interior_equipment: 18.5, water_heating: 28.5, fans: 12.5, pumps: 5.7, refrigeration: 0.0 },
      '4A': { total: 128.9, heating: 25.8, cooling: 15.5, interior_lighting: 14.2, exterior_lighting: 3.8, interior_equipment: 18.5, water_heating: 30.2, fans: 13.5, pumps: 7.4, refrigeration: 0.0 },
      '5A': { total: 138.5, heating: 34.8, cooling: 13.2, interior_lighting: 14.2, exterior_lighting: 3.8, interior_equipment: 18.5, water_heating: 32.1, fans: 13.9, pumps: 8.0, refrigeration: 0.0 },
      '6A': { total: 148.2, heating: 43.5, cooling: 12.1, interior_lighting: 14.2, exterior_lighting: 3.8, interior_equipment: 18.5, water_heating: 33.8, fans: 14.2, pumps: 8.1, refrigeration: 0.0 },
    },
    stand_alone_retail: {
      '2A': { total: 68.5, heating: 5.5, cooling: 18.2, interior_lighting: 22.5, exterior_lighting: 5.8, interior_equipment: 8.5, water_heating: 1.2, fans: 5.5, pumps: 1.3, refrigeration: 0.0 },
      '4A': { total: 75.2, heating: 12.5, cooling: 12.5, interior_lighting: 22.5, exterior_lighting: 5.8, interior_equipment: 8.5, water_heating: 1.5, fans: 6.5, pumps: 5.4, refrigeration: 0.0 },
      '5A': { total: 82.1, heating: 19.2, cooling: 10.5, interior_lighting: 22.5, exterior_lighting: 5.8, interior_equipment: 8.5, water_heating: 1.8, fans: 6.8, pumps: 7.0, refrigeration: 0.0 },
      '6A': { total: 89.5, heating: 26.5, cooling: 9.2, interior_lighting: 22.5, exterior_lighting: 5.8, interior_equipment: 8.5, water_heating: 2.0, fans: 6.9, pumps: 8.1, refrigeration: 0.0 },
    },
    strip_mall: {
      '2A': { total: 75.5, heating: 6.8, cooling: 20.1, interior_lighting: 24.2, exterior_lighting: 6.5, interior_equipment: 9.8, water_heating: 1.5, fans: 5.5, pumps: 1.1, refrigeration: 0.0 },
      '4A': { total: 82.5, heating: 14.5, cooling: 13.8, interior_lighting: 24.2, exterior_lighting: 6.5, interior_equipment: 9.8, water_heating: 1.8, fans: 6.2, pumps: 5.7, refrigeration: 0.0 },
      '5A': { total: 89.2, heating: 21.5, cooling: 11.5, interior_lighting: 24.2, exterior_lighting: 6.5, interior_equipment: 9.8, water_heating: 2.0, fans: 6.4, pumps: 7.3, refrigeration: 0.0 },
      '6A': { total: 96.8, heating: 29.2, cooling: 10.2, interior_lighting: 24.2, exterior_lighting: 6.5, interior_equipment: 9.8, water_heating: 2.2, fans: 6.5, pumps: 8.2, refrigeration: 0.0 },
    },
    supermarket: {
      '2A': { total: 218.5, heating: 8.5, cooling: 15.2, interior_lighting: 28.5, exterior_lighting: 4.8, interior_equipment: 32.5, water_heating: 4.5, fans: 12.8, pumps: 2.7, refrigeration: 109.0 },
      '4A': { total: 225.2, heating: 18.5, cooling: 10.5, interior_lighting: 28.5, exterior_lighting: 4.8, interior_equipment: 32.5, water_heating: 5.2, fans: 13.5, pumps: 2.7, refrigeration: 109.0 },
      '5A': { total: 232.5, heating: 25.8, cooling: 9.2, interior_lighting: 28.5, exterior_lighting: 4.8, interior_equipment: 32.5, water_heating: 5.8, fans: 13.7, pumps: 3.2, refrigeration: 109.0 },
    },
    quick_service_restaurant: {
      '2A': { total: 385.5, heating: 12.5, cooling: 32.5, interior_lighting: 18.5, exterior_lighting: 8.5, interior_equipment: 245.0, water_heating: 42.5, fans: 20.5, pumps: 5.5, refrigeration: 0.0 },
      '4A': { total: 402.5, heating: 25.2, cooling: 22.5, interior_lighting: 18.5, exterior_lighting: 8.5, interior_equipment: 245.0, water_heating: 45.8, fans: 22.5, pumps: 14.5, refrigeration: 0.0 },
      '5A': { total: 418.8, heating: 36.5, cooling: 20.2, interior_lighting: 18.5, exterior_lighting: 8.5, interior_equipment: 245.0, water_heating: 48.5, fans: 22.9, pumps: 18.7, refrigeration: 0.0 },
    },
    full_service_restaurant: {
      '2A': { total: 348.5, heating: 10.5, cooling: 28.5, interior_lighting: 16.5, exterior_lighting: 7.5, interior_equipment: 218.0, water_heating: 38.5, fans: 18.5, pumps: 10.5, refrigeration: 0.0 },
      '4A': { total: 365.2, heating: 22.5, cooling: 19.5, interior_lighting: 16.5, exterior_lighting: 7.5, interior_equipment: 218.0, water_heating: 41.5, fans: 20.5, pumps: 19.2, refrigeration: 0.0 },
      '5A': { total: 381.5, heating: 32.5, cooling: 17.2, interior_lighting: 16.5, exterior_lighting: 7.5, interior_equipment: 218.0, water_heating: 43.8, fans: 20.9, pumps: 25.1, refrigeration: 0.0 },
    },
    hospital: {
      '2A': { total: 226.5, heating: 22.5, cooling: 35.5, interior_lighting: 22.5, exterior_lighting: 3.5, interior_equipment: 42.5, water_heating: 45.5, fans: 38.5, pumps: 16.0, refrigeration: 0.0 },
      '4A': { total: 245.8, heating: 42.5, cooling: 24.5, interior_lighting: 22.5, exterior_lighting: 3.5, interior_equipment: 42.5, water_heating: 48.5, fans: 40.5, pumps: 21.3, refrigeration: 0.0 },
      '5A': { total: 265.5, heating: 58.5, cooling: 21.5, interior_lighting: 22.5, exterior_lighting: 3.5, interior_equipment: 42.5, water_heating: 51.5, fans: 41.2, pumps: 24.3, refrigeration: 0.0 },
      '6A': { total: 282.2, heating: 72.5, cooling: 19.5, interior_lighting: 22.5, exterior_lighting: 3.5, interior_equipment: 42.5, water_heating: 54.2, fans: 41.5, pumps: 26.0, refrigeration: 0.0 },
    },
    outpatient_healthcare: {
      '2A': { total: 148.5, heating: 15.5, cooling: 25.5, interior_lighting: 18.5, exterior_lighting: 3.5, interior_equipment: 28.5, water_heating: 22.5, fans: 25.5, pumps: 9.0, refrigeration: 0.0 },
      '4A': { total: 162.5, heating: 32.5, cooling: 17.5, interior_lighting: 18.5, exterior_lighting: 3.5, interior_equipment: 28.5, water_heating: 24.5, fans: 26.5, pumps: 11.0, refrigeration: 0.0 },
      '5A': { total: 178.5, heating: 45.5, cooling: 15.5, interior_lighting: 18.5, exterior_lighting: 3.5, interior_equipment: 28.5, water_heating: 26.5, fans: 27.2, pumps: 13.3, refrigeration: 0.0 },
    },
    primary_school: {
      '2A': { total: 58.5, heating: 6.5, cooling: 14.5, interior_lighting: 16.5, exterior_lighting: 3.5, interior_equipment: 10.5, water_heating: 3.5, fans: 3.5, pumps: 0.0, refrigeration: 0.0 },
      '4A': { total: 68.5, heating: 18.5, cooling: 9.5, interior_lighting: 16.5, exterior_lighting: 3.5, interior_equipment: 10.5, water_heating: 4.5, fans: 3.9, pumps: 1.6, refrigeration: 0.0 },
      '5A': { total: 80.5, heating: 28.5, cooling: 8.5, interior_lighting: 16.5, exterior_lighting: 3.5, interior_equipment: 10.5, water_heating: 5.5, fans: 4.0, pumps: 3.5, refrigeration: 0.0 },
      '6A': { total: 88.5, heating: 38.5, cooling: 7.5, interior_lighting: 16.5, exterior_lighting: 3.5, interior_equipment: 10.5, water_heating: 6.5, fans: 4.2, pumps: 1.3, refrigeration: 0.0 },
    },
    secondary_school: {
      '2A': { total: 62.5, heating: 8.5, cooling: 15.5, interior_lighting: 17.5, exterior_lighting: 3.5, interior_equipment: 11.5, water_heating: 3.5, fans: 2.5, pumps: 0.0, refrigeration: 0.0 },
      '4A': { total: 72.5, heating: 20.5, cooling: 10.5, interior_lighting: 17.5, exterior_lighting: 3.5, interior_equipment: 11.5, water_heating: 4.5, fans: 2.9, pumps: 1.6, refrigeration: 0.0 },
      '5A': { total: 82.5, heating: 30.5, cooling: 9.5, interior_lighting: 17.5, exterior_lighting: 3.5, interior_equipment: 11.5, water_heating: 5.5, fans: 3.0, pumps: 1.5, refrigeration: 0.0 },
    },
    warehouse: {
      '2A': { total: 25.5, heating: 3.5, cooling: 3.5, interior_lighting: 8.5, exterior_lighting: 4.5, interior_equipment: 4.5, water_heating: 0.5, fans: 0.5, pumps: 0.0, refrigeration: 0.0 },
      '4A': { total: 32.5, heating: 10.5, cooling: 2.5, interior_lighting: 8.5, exterior_lighting: 4.5, interior_equipment: 4.5, water_heating: 0.8, fans: 0.5, pumps: 0.7, refrigeration: 0.0 },
      '5A': { total: 38.5, heating: 16.5, cooling: 2.5, interior_lighting: 8.5, exterior_lighting: 4.5, interior_equipment: 4.5, water_heating: 1.0, fans: 0.5, pumps: 0.5, refrigeration: 0.0 },
      '6A': { total: 45.5, heating: 23.5, cooling: 2.5, interior_lighting: 8.5, exterior_lighting: 4.5, interior_equipment: 4.5, water_heating: 1.2, fans: 0.5, pumps: 0.3, refrigeration: 0.0 },
    },
    mid_rise_apartment: {
      '2A': { total: 48.5, heating: 4.5, cooling: 8.5, interior_lighting: 6.5, exterior_lighting: 2.5, interior_equipment: 14.5, water_heating: 8.5, fans: 2.5, pumps: 1.0, refrigeration: 0.0 },
      '4A': { total: 58.5, heating: 12.5, cooling: 5.5, interior_lighting: 6.5, exterior_lighting: 2.5, interior_equipment: 14.5, water_heating: 10.5, fans: 3.5, pumps: 3.0, refrigeration: 0.0 },
      '5A': { total: 68.5, heating: 20.5, cooling: 4.5, interior_lighting: 6.5, exterior_lighting: 2.5, interior_equipment: 14.5, water_heating: 12.5, fans: 3.7, pumps: 3.8, refrigeration: 0.0 },
      '6A': { total: 78.5, heating: 28.5, cooling: 4.5, interior_lighting: 6.5, exterior_lighting: 2.5, interior_equipment: 14.5, water_heating: 14.5, fans: 3.8, pumps: 3.7, refrigeration: 0.0 },
    },
  };

  // ── Beacon property_type to DOE building type mapping ──────────────────
  // Beacon's portfolio template uses friendly names; map to DOE prototypes.
  const BEACON_TO_DOE = {
    'Office': 'medium_office',
    'Medical Office': 'outpatient_healthcare',
    'Hospital': 'hospital',
    'Retail Store': 'stand_alone_retail',
    'Supermarket': 'supermarket',
    'Warehouse': 'warehouse',
    'K-12 School': 'primary_school',
    'Hotel': 'small_hotel',
  };

  /**
   * Look up climate zone for a US state code.
   * @param {string} stateCode - 2-letter state code
   * @returns {string|null} - Climate zone or null
   */
  function climateZoneFor(stateCode) {
    if (!stateCode) return null;
    return STATE_TO_CLIMATE_ZONE[String(stateCode).toUpperCase()] || null;
  }

  /**
   * Look up reference building EUI for a Beacon property type + state.
   *
   * @param {string} beaconPropertyType - Beacon's building type name
   * @param {string} stateCode - 2-letter state code
   * @returns {object|null} - {building_type, climate_zone, eui: {end_use: kBtu/sqft/yr}}
   */
  function getReferenceEUI(beaconPropertyType, stateCode) {
    if (!beaconPropertyType || !stateCode) return null;
    const doeType = BEACON_TO_DOE[beaconPropertyType];
    if (!doeType || !DATA[doeType]) return null;
    const cz = climateZoneFor(stateCode);
    if (!cz) return null;

    // Try exact climate zone match
    let eui = DATA[doeType][cz];

    // Fallback: try same number, either letter (e.g. 4A -> 4B)
    if (!eui) {
      const czNum = cz.replace(/[A-C]/, '');
      const candidates = Object.keys(DATA[doeType]).filter(z => z.startsWith(czNum));
      if (candidates.length > 0) eui = DATA[doeType][candidates[0]];
    }

    if (!eui) return null;
    return { building_type: doeType, climate_zone: cz, eui: eui };
  }

  /**
   * Compare a client's actual EUI to the reference.
   *
   * @param {number} actualTotalEUI - kBtu/sqft/yr
   * @param {string} propertyType
   * @param {string} stateCode
   * @returns {object|null} - {reference, actual, delta_pct, verdict}
   */
  function compareToReference(actualTotalEUI, propertyType, stateCode) {
    const ref = getReferenceEUI(propertyType, stateCode);
    if (!ref) return null;
    const referenceTotal = ref.eui.total;
    const deltaPct = ((actualTotalEUI - referenceTotal) / referenceTotal) * 100;
    let verdict;
    if (deltaPct < -15) verdict = 'strong_outperform';
    else if (deltaPct < -5) verdict = 'outperform';
    else if (deltaPct < 5) verdict = 'in_line';
    else if (deltaPct < 15) verdict = 'underperform';
    else verdict = 'strong_underperform';
    return {
      building_type: ref.building_type,
      climate_zone: ref.climate_zone,
      reference_eui: referenceTotal,
      actual_eui: actualTotalEUI,
      delta_pct: deltaPct,
      verdict: verdict,
      end_use_breakdown: ref.eui,
    };
  }

  // Export to global namespace
  window.BeaconReferenceBuildings = {
    STATE_TO_CLIMATE_ZONE: STATE_TO_CLIMATE_ZONE,
    BEACON_TO_DOE: BEACON_TO_DOE,
    DATA: DATA,
    climateZoneFor: climateZoneFor,
    getReferenceEUI: getReferenceEUI,
    compareToReference: compareToReference,
  };
})();
