// STS Portal Build: 2026-05-04T17:34:03Z-v100000
// ═══════════════════════════════════════════════════════════════════════════════
// STS Utility Services — Market Intelligence Data
// All 50 US states + DC
//
// Refresh cadence: monthly. Source data is synthesized from EIA commercial
// rate filings, state public utility commission orders, and major investor-
// owned utility tariff books. Replace this file in your Netlify deploy to
// update — no other dashboard files need to change.
//
// Generated: 2026-05-03 17:51 UTC
// ═══════════════════════════════════════════════════════════════════════════════

// ── Building-type narrative templates ───────────────────────────────────────
// Most states share the same structural narratives by building type.
// We define templates once and synthesize each state's strings at runtime via
// a helper that substitutes the state name and utility shortlist. This keeps
// the source file readable AND ensures consistency across states.
// ────────────────────────────────────────────────────────────────────────────

(function(){
  // Helpers
  function _bt(stateName, utilities, hasChoice, hasBPS, bpsList) {
    var u = utilities.slice(0, 2).join(', ');
    var marketLine = hasChoice
      ? 'Competitive supplier procurement is available and routinely yields meaningful savings vs. utility default.'
      : 'This is a regulated market — optimization comes from rate-schedule review, demand-charge management, and behind-the-meter solar.';
    var bpsLine = hasBPS ? ' Buildings in ' + bpsList + ' face benchmarking or BPS compliance.' : '';
    return {
      office:      'Class A and B office buildings in ' + stateName + ' face rising operating costs from utility rate increases.' + bpsLine + ' ' + marketLine + ' Energy benchmarking and lighting/HVAC efficiency upgrades typically deliver 8–18% reductions on annual electric spend.',
      hospitality: 'Hotels and hospitality properties in ' + stateName + ' have summer-peak demand profiles that drive total bill cost. Demand response enrollment, kitchen and HVAC efficiency upgrades, and behind-the-meter solar deliver the strongest ROI.' + bpsLine,
      retail:      'Multi-location retail and restaurant chains in ' + stateName + ' can aggregate load across sites for portfolio procurement or solar/efficiency planning. Rate-schedule review across ' + u + ' territories often surfaces 5–10% in immediate savings.',
      industrial:  'Manufacturing and distribution facilities in ' + stateName + ' typically have significant demand-charge optimization potential under ' + u + ' large-customer rate schedules. Compressed-air audits, motor efficiency upgrades, and load shifting are highest-impact.',
      healthcare:  'Hospitals and large medical campuses in ' + stateName + ' run 24/7 and pay heavy demand charges. Demand response, high-efficiency chillers, and combined heat and power (CHP) deliver strongest results.' + bpsLine,
      multifamily: 'Multifamily properties in ' + stateName + ' benefit from common-area lighting and HVAC upgrades, controls retrofits, and (where available) community solar subscriptions. Master-metered buildings face the largest absolute savings opportunity.',
    };
  }

  function _marketPulse(stateName, primaryUtility, hasChoice) {
    if (hasChoice) {
      return stateName + ' is a deregulated electricity market — commercial customers can choose their supplier. Licensed alternative suppliers compete for commercial accounts, with fixed-rate contracts of 12–36 months typically yielding 8–15% supply savings vs. utility default tariffs. STS runs competitive RFPs across the supplier base.';
    }
    return stateName + ' is a regulated electricity market — commercial customers receive both supply and delivery from ' + primaryUtility + ' or other regulated utilities. Optimization comes from rate-schedule review, demand-charge management, behind-the-meter solar, and participation in utility efficiency and demand-response programs.';
  }

  function _regulatory(stateName, hasBPS, bpsList) {
    if (hasBPS) {
      return stateName + ' has building performance or benchmarking requirements in ' + bpsList + '. Buildings over the size threshold (typically 25,000–50,000 sq ft) must report annual energy performance and may face efficiency improvement mandates. Non-compliance penalties vary by jurisdiction.';
    }
    return stateName + ' does not currently have a statewide building performance standard. Some municipalities may have voluntary benchmarking programs. Federal IRA tax credits and ENERGY STAR certification remain primary efficiency drivers.';
  }

  function _incentives(primaryUtility) {
    return primaryUtility + ' offers commercial efficiency rebates for lighting, HVAC, motors, and controls. Custom incentives are available for larger projects. Federal IRA tax credits (Section 179D, 48E, 30C) apply to qualifying commercial efficiency, solar, storage, and EV-charging projects through 2032. State energy office grants may also be available.';
  }

  function _opportunityNote(stateName, trend) {
    if (trend === 'up') {
      return 'Rising rates in ' + stateName + ' make procurement timing and efficiency investments increasingly valuable. Buildings on default rates without efficiency review are the highest-priority opportunities.';
    }
    return 'Demand-charge management, rate-schedule optimization, and behind-the-meter generation are the highest-ROI moves for commercial portfolios in ' + stateName + '.';
  }

  function _rateNote(stateName, trend) {
    if (trend === 'up') {
      return stateName + ' commercial rates have risen meaningfully over the past 24 months. Procurement timing matters — fixed-rate contracts can lock in protection against further increases.';
    }
    if (trend === 'volatile') {
      return stateName + ' commercial rates are volatile. Index-rate exposure requires careful management; fixed-rate contracts smooth budget impact.';
    }
    return stateName + ' commercial rates are relatively stable. Optimization focus is on rate-schedule selection, demand-charge management, and efficiency improvements.';
  }

  function _make(opts) {
    return {
      name: opts.name,
      utilities: opts.utilities,
      avgRate: opts.avgRate,
      rateTrend: opts.rateTrend,
      rateNote: opts.rateNoteOverride || _rateNote(opts.name, opts.rateTrend),
      marketPulse: opts.marketPulseOverride || _marketPulse(opts.name, opts.utilities[0], opts.hasChoice),
      regulatory: opts.regulatoryOverride || _regulatory(opts.name, opts.hasBPS, opts.bpsList || ''),
      incentives: opts.incentivesOverride || _incentives(opts.utilities[0]),
      opportunity: opts.opportunityOverride || _opportunityNote(opts.name, opts.rateTrend),
      buildingTypes: opts.buildingTypesOverride || _bt(opts.name, opts.utilities, opts.hasChoice, opts.hasBPS, opts.bpsList || ''),
    };
  }

  window.MARKET_INTEL = {

    AK: _make({ name:'Alaska', utilities:['Chugach Electric','Matanuska Electric','Golden Valley Electric'], avgRate:'23.50¢/kWh (commercial)', rateTrend:'stable', hasChoice:false, hasBPS:false }),
    AL: _make({ name:'Alabama', utilities:['Alabama Power','PowerSouth','TVA (north AL)'], avgRate:'13.20¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:false }),
    AR: _make({ name:'Arkansas', utilities:['Entergy Arkansas','SWEPCO','OG&E (border)'], avgRate:'10.40¢/kWh (commercial)', rateTrend:'stable', hasChoice:false, hasBPS:false }),
    AZ: _make({ name:'Arizona', utilities:['APS','Salt River Project','TEP'], avgRate:'12.10¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:false }),

    CA: _make({
      name:'California',
      utilities:['PG&E','SCE','SDG&E','LADWP','SMUD'],
      avgRate:'26.30¢/kWh (commercial)',
      rateTrend:'up',
      hasChoice:true, // limited DA
      hasBPS:true,
      bpsList:'SF Existing Buildings Ordinance, LA EBEWE',
      rateNoteOverride:'California commercial rates are 80%+ above the national average and continue to climb under wildfire-mitigation surcharges and grid-modernization investment. Time-of-use peak periods are the largest cost driver — load shifting and storage provide outsized value.',
      marketPulseOverride:'California has limited Direct Access (DA) for commercial customers — the program is capped and most slots are taken, but openings appear annually and STS monitors them in real time. Outside DA, customers are tied to utility default rates but can still optimize through demand-charge management, solar PPAs, and storage. CCAs (Community Choice Aggregators) like CleanPowerSF, MCE, and SCP serve large portions of the state with renewable defaults.',
      regulatoryOverride:'California Title 24 efficiency code and SB 350 efficiency mandates are the most aggressive in the nation. SF\'s Existing Commercial Buildings Energy Performance Ordinance and LA\'s EBEWE require benchmarking and audits. AB 1279 sets net-zero by 2045. Title 24 updates every 3 years tighten requirements substantially.',
      incentivesOverride:'California offers the deepest commercial efficiency incentive ecosystem in the US: utility custom rebates, SGIP for storage ($200–$1,000/kWh), Title 24 prescriptive programs, and CARB clean-vehicle and electrification incentives. Self-Generation Incentive Program for batteries can pay back 50%+ of project cost.',
      opportunityOverride:'Solar+storage economics are exceptional in CA — payback periods of 4–7 years are common, and SGIP storage incentives stack on top. Most commercial portfolios have 20–40% addressable demand-charge savings.',
    }),

    CO: _make({ name:'Colorado', utilities:['Xcel Energy','Black Hills Energy','Tri-State'], avgRate:'12.80¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:true, bpsList:'Denver Energize Denver, Boulder' }),
    CT: _make({ name:'Connecticut', utilities:['Eversource','United Illuminating'], avgRate:'23.10¢/kWh (commercial)', rateTrend:'up', hasChoice:true, hasBPS:false }),
    DC: _make({ name:'District of Columbia', utilities:['Pepco'], avgRate:'15.30¢/kWh (commercial)', rateTrend:'up', hasChoice:true, hasBPS:true, bpsList:'BEPS' }),
    DE: _make({ name:'Delaware', utilities:['Delmarva Power','DEMEC'], avgRate:'13.60¢/kWh (commercial)', rateTrend:'up', hasChoice:true, hasBPS:false }),

    FL: _make({
      name:'Florida',
      utilities:['FPL','Duke Energy Florida','TECO','Gulf Power (FPL)'],
      avgRate:'12.40¢/kWh (commercial)',
      rateTrend:'up',
      hasChoice:false,
      hasBPS:false,
      marketPulseOverride:'Florida is a regulated market — commercial customers cannot choose their supplier. Optimization comes from demand-charge management, solar PPAs, FPL SolarTogether subscriptions, and rate-class review. Many large commercial accounts are on the wrong rate schedule and overpaying by 5–12%.',
      regulatoryOverride:'Florida has no statewide BPS or commercial benchmarking mandate. Individual cities (Orlando, Miami) have voluntary benchmarking programs. Florida\'s 2023 net-metering reform reduced solar export credits, shifting solar economics toward self-consumption.',
      incentivesOverride:'FPL SolarTogether is the largest community solar program in the country — commercial subscribers receive guaranteed bill savings. Duke Energy Florida and TECO offer commercial rebate programs. Federal IRA tax credits are particularly valuable in FL given strong solar irradiance.',
      opportunityOverride:'Demand-charge management and solar self-consumption are the highest-ROI moves for FL commercial portfolios. Hurricane-resilience storage projects also stack federal and state incentives.',
    }),

    GA: _make({
      name:'Georgia',
      utilities:['Georgia Power','Georgia EMC co-ops'],
      avgRate:'12.00¢/kWh (commercial)',
      rateTrend:'up',
      hasChoice:false,
      hasBPS:true,
      bpsList:'Atlanta',
      marketPulseOverride:'Georgia is a regulated market — Georgia Power serves the majority of commercial customers, with EMCs (rural co-ops) covering rural areas and Atlanta-metro suburbs. No retail choice. Commercial optimization focuses on rate-schedule selection, demand-charge management, and behind-the-meter solar.',
      regulatoryOverride:'Georgia has no statewide BPS. Atlanta passed a Commercial Buildings Energy Efficiency Ordinance requiring benchmarking for buildings >25,000 sq ft. Statewide RPS is voluntary.',
      incentivesOverride:'Georgia Power offers commercial efficiency rebates for lighting, HVAC, and motors. Custom incentives are available for large projects. Federal IRA tax credits apply to all qualifying projects.',
      opportunityOverride:'Commercial solar economics in GA are favorable given high irradiance and Georgia Power\'s net-metering rules. Demand-charge optimization and rate-schedule review yield consistent 5–10% savings.',
    }),

    HI: _make({ name:'Hawaii', utilities:['Hawaiian Electric','KIUC'], avgRate:'37.80¢/kWh (commercial)', rateTrend:'volatile', hasChoice:false, hasBPS:true, bpsList:'Honolulu BEAM', rateNoteOverride:'Hawaii has the highest commercial electricity rates in the US, driven by oil-fired generation. Solar and storage economics are exceptional — many commercial portfolios reach payback in 3–5 years.' }),
    IA: _make({ name:'Iowa', utilities:['MidAmerican Energy','Alliant Energy','Iowa municipals'], avgRate:'9.40¢/kWh (commercial)', rateTrend:'stable', hasChoice:false, hasBPS:false }),
    ID: _make({ name:'Idaho', utilities:['Idaho Power','Avista','Rocky Mountain Power'], avgRate:'8.40¢/kWh (commercial)', rateTrend:'stable', hasChoice:false, hasBPS:false }),
    IL: _make({ name:'Illinois', utilities:['ComEd','Ameren Illinois'], avgRate:'14.01¢/kWh (commercial)', rateTrend:'up', hasChoice:true, hasBPS:true, bpsList:'Chicago' }),
    IN: _make({ name:'Indiana', utilities:['Duke Energy Indiana','AEP Indiana Michigan','NIPSCO','AES Indiana','Vectren'], avgRate:'11.80¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:false }),
    KS: _make({ name:'Kansas', utilities:['Evergy','Kansas Gas & Electric','Westar'], avgRate:'11.30¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:false }),
    KY: _make({ name:'Kentucky', utilities:['LG&E','KU','Duke Energy Kentucky','Kentucky Power'], avgRate:'11.10¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:false }),
    LA: _make({ name:'Louisiana', utilities:['Entergy Louisiana','Cleco','SWEPCO'], avgRate:'11.00¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:false }),
    MA: _make({ name:'Massachusetts', utilities:['Eversource','National Grid','Unitil'], avgRate:'20.62¢/kWh (commercial)', rateTrend:'up', hasChoice:true, hasBPS:true, bpsList:'Boston BERDO, Cambridge BEUDO' }),
    MD: _make({ name:'Maryland', utilities:['BGE','Pepco','Delmarva Power','Potomac Edison'], avgRate:'16.80¢/kWh (commercial)', rateTrend:'up', hasChoice:true, hasBPS:true, bpsList:'Statewide BEPS, Montgomery County, Prince George\'s County' }),
    ME: _make({ name:'Maine', utilities:['Central Maine Power','Versant Power'], avgRate:'21.50¢/kWh (commercial)', rateTrend:'up', hasChoice:true, hasBPS:false }),
    MI: _make({ name:'Michigan', utilities:['DTE Energy','Consumers Energy','I&M','UPPCO'], avgRate:'12.90¢/kWh (commercial)', rateTrend:'up', hasChoice:true, hasBPS:true, bpsList:'Ann Arbor' }),

    MN: _make({
      name:'Minnesota',
      utilities:['Xcel Energy','Minnesota Power','Otter Tail Power','Dakota Electric'],
      avgRate:'11.90¢/kWh (commercial)',
      rateTrend:'up',
      hasChoice:false,
      hasBPS:true,
      bpsList:'St. Paul, Minneapolis',
      marketPulseOverride:'Minnesota is a regulated market — no retail choice for commercial customers. Optimization comes from rate-schedule review, demand-charge management, and Xcel\'s commercial efficiency programs. Minneapolis and St. Paul have leading municipal sustainability programs.',
      regulatoryOverride:'Minneapolis BPS requires energy benchmarking and performance improvements for commercial buildings >50,000 sq ft. St. Paul has similar requirements. Minnesota\'s 100% Clean Energy by 2040 law (signed 2023) drives utility procurement of renewable resources.',
      incentivesOverride:'Xcel Energy offers among the strongest commercial efficiency rebate programs in the Midwest — custom rebates, retro-commissioning incentives, and demand-response payments. Minnesota Department of Commerce administers state-level grants.',
      opportunityOverride:'Twin Cities BPS compliance is the leading driver of commercial efficiency investment. Buildings that haven\'t benchmarked face increasing penalty exposure. Solar+storage economics improve year-over-year.',
    }),

    MO: _make({ name:'Missouri', utilities:['Ameren Missouri','Evergy','Empire District'], avgRate:'10.80¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:true, bpsList:'St. Louis BES' }),
    MS: _make({ name:'Mississippi', utilities:['Entergy Mississippi','Mississippi Power','TVA (north MS)'], avgRate:'12.70¢/kWh (commercial)', rateTrend:'stable', hasChoice:false, hasBPS:false }),
    MT: _make({ name:'Montana', utilities:['NorthWestern Energy','MDU','Co-ops'], avgRate:'10.90¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:false }),
    NC: _make({ name:'North Carolina', utilities:['Duke Energy Carolinas','Duke Energy Progress','Dominion North Carolina'], avgRate:'10.40¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:false }),
    ND: _make({ name:'North Dakota', utilities:['Xcel Energy','MDU','Otter Tail Power'], avgRate:'10.10¢/kWh (commercial)', rateTrend:'stable', hasChoice:false, hasBPS:false }),
    NE: _make({ name:'Nebraska', utilities:['OPPD','NPPD','Lincoln Electric System'], avgRate:'9.80¢/kWh (commercial)', rateTrend:'stable', hasChoice:false, hasBPS:false }),
    NH: _make({ name:'New Hampshire', utilities:['Eversource','Unitil','Liberty Utilities NH'], avgRate:'20.40¢/kWh (commercial)', rateTrend:'up', hasChoice:true, hasBPS:false }),
    NJ: _make({ name:'New Jersey', utilities:['PSE&G','JCP&L','Atlantic City Electric','Rockland Electric'], avgRate:'15.40¢/kWh (commercial)', rateTrend:'up', hasChoice:true, hasBPS:false }),
    NM: _make({ name:'New Mexico', utilities:['PNM','El Paso Electric','Xcel (SE NM)'], avgRate:'12.30¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:false }),
    NV: _make({ name:'Nevada', utilities:['NV Energy (Sierra Pacific, Nevada Power)'], avgRate:'11.80¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:false }),

    NY: _make({
      name:'New York',
      utilities:['Con Edison','National Grid','NYSEG','Central Hudson','RG&E','Orange & Rockland'],
      avgRate:'22.54¢/kWh (commercial)',
      rateTrend:'up',
      hasChoice:true,
      hasBPS:true,
      bpsList:'NYC LL97',
      rateNoteOverride:'New York commercial rates are 60% above the national average. Con Edison territory routinely exceeds 25–30¢/kWh all-in. Procurement savings here are among the highest in dollar terms of any state.',
    }),

    OH: _make({ name:'Ohio', utilities:['AEP Ohio','FirstEnergy (Ohio Edison, CEI, Toledo Edison)','Duke Energy Ohio','AES Ohio'], avgRate:'12.80¢/kWh (commercial)', rateTrend:'up', hasChoice:true, hasBPS:false }),
    OK: _make({ name:'Oklahoma', utilities:['OG&E','PSO (AEP)','Co-ops'], avgRate:'10.30¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:false }),
    OR: _make({ name:'Oregon', utilities:['Portland General Electric','Pacific Power','Idaho Power (E. OR)'], avgRate:'12.20¢/kWh (commercial)', rateTrend:'up', hasChoice:true, hasBPS:true, bpsList:'Portland' }),
    PA: _make({ name:'Pennsylvania', utilities:['PECO','PPL Electric','West Penn Power','Duquesne Light','Penn Power'], avgRate:'17.95¢/kWh (commercial)', rateTrend:'up', hasChoice:true, hasBPS:true, bpsList:'Philadelphia' }),
    RI: _make({ name:'Rhode Island', utilities:['Rhode Island Energy (PPL)'], avgRate:'20.80¢/kWh (commercial)', rateTrend:'up', hasChoice:true, hasBPS:false }),
    SC: _make({ name:'South Carolina', utilities:['Duke Energy Carolinas','Duke Energy Progress','Dominion South Carolina','Santee Cooper'], avgRate:'11.30¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:false }),
    SD: _make({ name:'South Dakota', utilities:['Xcel Energy','NorthWestern Energy','Black Hills Energy'], avgRate:'11.20¢/kWh (commercial)', rateTrend:'stable', hasChoice:false, hasBPS:false }),
    TN: _make({ name:'Tennessee', utilities:['TVA (via local distributors: MLGW, NES, KUB, EPB)'], avgRate:'11.80¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:false }),

    TX: _make({
      name:'Texas',
      utilities:['Oncor','CenterPoint','AEP Texas','TNMP'],
      avgRate:'9.10¢/kWh (commercial)',
      rateTrend:'volatile',
      hasChoice:true,
      hasBPS:false,
      rateNoteOverride:'Texas commercial rates are below the national average but volatile. ERCOT scarcity-pricing events during summer heat and winter cold can drive 3–5x normal rates for hours at a time. Index-rate exposure requires careful management.',
    }),

    UT: _make({ name:'Utah', utilities:['Rocky Mountain Power'], avgRate:'8.90¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:false }),
    VA: _make({ name:'Virginia', utilities:['Dominion Energy Virginia','Appalachian Power','Old Dominion Electric'], avgRate:'10.60¢/kWh (commercial)', rateTrend:'up', hasChoice:true, hasBPS:false }),
    VT: _make({ name:'Vermont', utilities:['Green Mountain Power','Vermont Electric Cooperative','Burlington Electric'], avgRate:'18.80¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:false }),

    WA: _make({
      name:'Washington',
      utilities:['Puget Sound Energy','Avista','Pacific Power','Seattle City Light'],
      avgRate:'10.10¢/kWh (commercial)',
      rateTrend:'up',
      hasChoice:false,
      hasBPS:true,
      bpsList:'Seattle BEPS',
      marketPulseOverride:'Washington is a regulated market — Puget Sound Energy, Avista, Pacific Power, and Seattle City Light dominate. No retail choice. Commercial optimization focuses on rate-schedule selection, demand-charge management, and behind-the-meter solar.',
      regulatoryOverride:'Seattle\'s Building Performance Standards (BEPS, Ordinance 126442) require energy performance targets for commercial buildings >20,000 sq ft, with first compliance deadlines in 2027–2031 depending on building size. Statewide Clean Buildings Performance Standard (HB 1257) covers buildings >50,000 sq ft with similar requirements.',
      incentivesOverride:'Puget Sound Energy and Seattle City Light offer commercial efficiency rebate programs. Washington State Energy Office administers grants for efficiency and electrification. Federal IRA incentives apply to all projects.',
      opportunityOverride:'BPS compliance is creating significant urgency for Seattle-area commercial buildings. Heat-pump retrofits and lighting upgrades are among the highest-ROI moves.',
    }),

    WI: _make({ name:'Wisconsin', utilities:['We Energies','Alliant Energy WPL','Xcel Energy','Madison Gas & Electric','WPS'], avgRate:'12.70¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:false }),
    WV: _make({ name:'West Virginia', utilities:['Appalachian Power','FirstEnergy (Mon Power, Potomac Edison)'], avgRate:'11.80¢/kWh (commercial)', rateTrend:'up', hasChoice:false, hasBPS:false }),
    WY: _make({ name:'Wyoming', utilities:['Rocky Mountain Power','Black Hills Energy','Co-ops'], avgRate:'10.10¢/kWh (commercial)', rateTrend:'stable', hasChoice:false, hasBPS:false }),

  };

})();

// Building-type display labels (kept here so the data file is self-contained)
window.BTYPE_NAMES = {
  office:      'Office & CRE',
  hospitality: 'Hospitality',
  retail:      'Retail',
  industrial:  'Industrial',
  healthcare:  'Healthcare',
  multifamily: 'Multifamily'
};

// Rate trend icons
window.TREND_ICONS = {
  up:       '↑',
  down:     '↓',
  stable:   '→',
  volatile: '⚡'
};
