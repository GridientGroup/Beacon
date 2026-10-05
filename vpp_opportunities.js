/* ============================================================================
 * vpp_opportunities.js
 *
 * Virtual Power Plant (VPP) and DER aggregation opportunity identification.
 *
 * BACKGROUND: FERC Order 2222 opened wholesale electricity markets to
 * aggregated distributed energy resources. Commercial buildings with any
 * flexibility (batteries, controllable HVAC, EV charging, thermal storage)
 * can now generate $50-200/kW/year in grid services revenue.
 *
 * Most brokers aren't touching this. Beacon flagging it as a distinct
 * revenue opportunity puts partners ahead of the pack.
 *
 * ELIGIBILITY HEURISTICS:
 *   - Must be in an ISO/RTO territory that has active DR/VPP programs
 *     (CAISO, ERCOT, ISO-NE, NYISO, MISO, PJM, SPP)
 *   - Building size and load characteristics suggest flexibility potential
 *   - Building type has known DR-suitable loads
 *
 * REVENUE ESTIMATES:
 *   Combine capacity payments ($/kW-month) with energy payments ($/MWh
 *   during events) and ancillary services where applicable.
 *
 * ========================================================================= */

(function () {
  'use strict';

  // ── ISO/RTO programs by state ─────────────────────────────────────────
  // Maps state to primary ISO and typical VPP/DR revenue potential
  const STATE_TO_ISO = {
    'CA': 'CAISO', 'TX': 'ERCOT',
    'CT': 'ISO-NE', 'ME': 'ISO-NE', 'MA': 'ISO-NE', 'NH': 'ISO-NE', 'RI': 'ISO-NE', 'VT': 'ISO-NE',
    'NY': 'NYISO',
    'AR': 'MISO', 'IL': 'MISO', 'IN': 'MISO', 'IA': 'MISO', 'KY': 'MISO', 'LA': 'MISO', 'MI': 'MISO',
    'MN': 'MISO', 'MS': 'MISO', 'MO': 'MISO', 'MT': 'MISO', 'ND': 'MISO', 'SD': 'MISO', 'TX-partial': 'MISO', 'WI': 'MISO',
    'DE': 'PJM', 'DC': 'PJM', 'IL-partial': 'PJM', 'KY-partial': 'PJM', 'MD': 'PJM', 'MI-partial': 'PJM',
    'NJ': 'PJM', 'NC-partial': 'PJM', 'OH': 'PJM', 'PA': 'PJM', 'TN-partial': 'PJM', 'VA': 'PJM', 'WV': 'PJM',
    'KS': 'SPP', 'NE': 'SPP', 'NM-partial': 'SPP', 'OK': 'SPP', 'AR-partial': 'SPP', 'LA-partial': 'SPP', 'MO-partial': 'SPP', 'MT-partial': 'SPP', 'ND-partial': 'SPP', 'SD-partial': 'SPP', 'TX-panhandle': 'SPP', 'WY-partial': 'SPP',
  };

  const ISO_PROGRAMS = {
    'CAISO': {
      name: 'California ISO',
      demand_response: true, vpp_active: true, capacity_market: false,
      typical_capacity_revenue_per_kw_year: 145,
      typical_energy_revenue_per_kw_year: 35,
      total_revenue_per_kw_year: 180,
      notes: 'Strong DR and VPP programs. FERC Order 2222 implementation active. Multiple aggregators.',
    },
    'ERCOT': {
      name: 'ERCOT',
      demand_response: true, vpp_active: true, capacity_market: false,
      typical_capacity_revenue_per_kw_year: 95,
      typical_energy_revenue_per_kw_year: 55,
      total_revenue_per_kw_year: 150,
      notes: 'Energy-only market. Scarcity pricing creates strong DR revenue. ERS program pays for reserves.',
    },
    'ISO-NE': {
      name: 'ISO New England',
      demand_response: true, vpp_active: true, capacity_market: true,
      typical_capacity_revenue_per_kw_year: 110,
      typical_energy_revenue_per_kw_year: 25,
      total_revenue_per_kw_year: 135,
      notes: 'Forward Capacity Market provides stable revenue. Real-time DR also available.',
    },
    'NYISO': {
      name: 'NYISO',
      demand_response: true, vpp_active: true, capacity_market: true,
      typical_capacity_revenue_per_kw_year: 125,
      typical_energy_revenue_per_kw_year: 30,
      total_revenue_per_kw_year: 155,
      notes: 'Installed Capacity market + Special Case Resources DR. NYC/LI premium zones pay more.',
    },
    'PJM': {
      name: 'PJM Interconnection',
      demand_response: true, vpp_active: true, capacity_market: true,
      typical_capacity_revenue_per_kw_year: 85,
      typical_energy_revenue_per_kw_year: 20,
      total_revenue_per_kw_year: 105,
      notes: 'Large capacity market. Emergency and economic DR programs. Broad participation.',
    },
    'MISO': {
      name: 'MISO',
      demand_response: true, vpp_active: false, capacity_market: true,
      typical_capacity_revenue_per_kw_year: 65,
      typical_energy_revenue_per_kw_year: 15,
      total_revenue_per_kw_year: 80,
      notes: 'Demand Response resources. Emerging VPP under FERC 2222.',
    },
    'SPP': {
      name: 'Southwest Power Pool',
      demand_response: true, vpp_active: false, capacity_market: false,
      typical_capacity_revenue_per_kw_year: 45,
      typical_energy_revenue_per_kw_year: 10,
      total_revenue_per_kw_year: 55,
      notes: 'Emerging DR programs. Less developed than eastern ISOs.',
    },
  };

  // ── Building type flexibility potential ────────────────────────────────
  // Fraction of connected load typically available for shed/shift
  const BUILDING_TYPE_FLEX = {
    'Office': { flex_fraction: 0.15, drivers: 'HVAC precooling, lighting dimming' },
    'Medical Office': { flex_fraction: 0.08, drivers: 'Limited HVAC flexibility due to comfort/air-quality needs' },
    'Hospital': { flex_fraction: 0.03, drivers: 'Very limited; critical loads dominate' },
    'Retail Store': { flex_fraction: 0.18, drivers: 'HVAC setpoints, refrigeration duty cycling' },
    'Supermarket': { flex_fraction: 0.12, drivers: 'Refrigeration precooling, HVAC. Batteries add significantly' },
    'Warehouse': { flex_fraction: 0.10, drivers: 'HVAC setpoints when occupied. EV chargers if present.' },
    'K-12 School': { flex_fraction: 0.20, drivers: 'HVAC during unoccupied hours. Lighting.' },
    'Hotel': { flex_fraction: 0.12, drivers: 'HVAC in common areas. Cooling towers. Pool pumps.' },
  };

  /**
   * Get ISO for a state.
   */
  function isoFor(stateCode) {
    if (!stateCode) return null;
    return STATE_TO_ISO[String(stateCode).toUpperCase()] || null;
  }

  /**
   * Estimate peak demand (kW) from annual kWh consumption.
   * Uses a rough load factor by building type.
   */
  function estimatePeakKW(annualKwh, buildingType) {
    if (!annualKwh || annualKwh <= 0) return 0;
    // Load factors (peak_kw × 8760 × load_factor = annual_kwh)
    const loadFactors = {
      'Office': 0.35, 'Medical Office': 0.55, 'Hospital': 0.75,
      'Retail Store': 0.30, 'Supermarket': 0.65, 'Warehouse': 0.25,
      'K-12 School': 0.28, 'Hotel': 0.50,
    };
    const lf = loadFactors[buildingType] || 0.40;
    const peakKW = annualKwh / (8760 * lf);
    return peakKW;
  }

  /**
   * Assess VPP opportunity for a single account.
   * @param {object} account - {state, account_type, annual_usage, property_type, sqft}
   * @returns {object|null}
   */
  function assessOpportunity(account) {
    if (!account) return null;
    if ((account.account_type || '').toLowerCase() !== 'electric') return null;

    const iso = isoFor(account.state);
    if (!iso) return { eligible: false, reason: 'Not in an ISO/RTO territory with active DR/VPP programs' };

    const program = ISO_PROGRAMS[iso];
    if (!program) return { eligible: false, reason: 'ISO program data not available' };

    const propType = account.property_type || 'Office';
    const flexInfo = BUILDING_TYPE_FLEX[propType] || BUILDING_TYPE_FLEX['Office'];

    const peakKW = estimatePeakKW(account.annual_usage, propType);
    const flexibleKW = peakKW * flexInfo.flex_fraction;

    if (flexibleKW < 25) {
      return {
        eligible: false,
        reason: 'Building flexibility below typical program minimums (25 kW)',
        peak_kw_estimate: peakKW,
        flexible_kw_estimate: flexibleKW,
      };
    }

    const annualRevenue = flexibleKW * program.total_revenue_per_kw_year;

    return {
      eligible: true,
      iso: iso,
      iso_name: program.name,
      program_notes: program.notes,
      peak_kw_estimate: peakKW,
      flexible_kw_estimate: flexibleKW,
      flexibility_drivers: flexInfo.drivers,
      capacity_revenue_annual: flexibleKW * program.typical_capacity_revenue_per_kw_year,
      energy_revenue_annual: flexibleKW * program.typical_energy_revenue_per_kw_year,
      total_revenue_annual: annualRevenue,
      revenue_per_kw_year: program.total_revenue_per_kw_year,
      confidence: 'estimate',
      notes: 'Estimate based on typical DR/VPP program pricing. Actual revenue depends on program enrollment, event frequency, and dispatch performance.',
    };
  }

  /**
   * Assess VPP opportunity across a portfolio.
   */
  function assessPortfolio(accounts) {
    let totalAnnualRevenue = 0;
    let totalFlexibleKW = 0;
    let eligibleCount = 0;
    const byAccount = [];
    const byISO = {};

    (accounts || []).forEach(function (acct) {
      const opp = assessOpportunity(acct);
      if (opp && opp.eligible) {
        eligibleCount++;
        totalAnnualRevenue += opp.total_revenue_annual;
        totalFlexibleKW += opp.flexible_kw_estimate;
        byAccount.push({
          store_code: acct.store_code,
          state: acct.state,
          opportunity: opp,
        });
        byISO[opp.iso] = (byISO[opp.iso] || 0) + opp.total_revenue_annual;
      }
    });

    return {
      total_annual_revenue: totalAnnualRevenue,
      total_flexible_kw: totalFlexibleKW,
      eligible_account_count: eligibleCount,
      by_account: byAccount,
      by_iso: byISO,
    };
  }

  window.BeaconVPP = {
    STATE_TO_ISO: STATE_TO_ISO,
    ISO_PROGRAMS: ISO_PROGRAMS,
    BUILDING_TYPE_FLEX: BUILDING_TYPE_FLEX,
    isoFor: isoFor,
    estimatePeakKW: estimatePeakKW,
    assessOpportunity: assessOpportunity,
    assessPortfolio: assessPortfolio,
  };
})();
