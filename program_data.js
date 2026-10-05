// STS Portal Build: 2026-05-04T17:34:03Z-v100000
// STS Portal · Program Intelligence Data
// Public-source reference data refreshed on the cadence noted per program.

window.STATE_TO_ISO = {
  DE:'PJM',IL:'PJM',IN:'PJM',KY:'PJM',MD:'PJM',MI:'PJM',NJ:'PJM',NC:'PJM',
  OH:'PJM',PA:'PJM',TN:'PJM',VA:'PJM',WV:'PJM',DC:'PJM',
  NY:'NYISO',
  CT:'ISO-NE',ME:'ISO-NE',MA:'ISO-NE',NH:'ISO-NE',RI:'ISO-NE',VT:'ISO-NE',
  AR:'MISO',IA:'MISO',LA:'MISO',MN:'MISO',MS:'MISO',MO:'MISO',ND:'MISO',SD:'MISO',WI:'MISO',
  TX:'ERCOT', CA:'CAISO',
  KS:'SPP',NE:'SPP',OK:'SPP',NM:'SPP',
  AL:'SE',GA:'SE',FL:'SE',SC:'SE',
  AZ:'WECC',CO:'WECC',ID:'WECC',MT:'WECC',NV:'WECC',OR:'WECC',UT:'WECC',WA:'WECC',WY:'WECC',
};

window.PROGRAM_DATA = {

  procurement: {
    label:'Energy Procurement', refreshed:'2026-04',
    headline:'Default rates jumped ~22% across PJM. Competitive supply is the only counterweight.',
    summary:'In deregulated markets your portfolio can bypass the utility default supply rate via a competitive RFP. Recent PJM capacity cost spikes have widened the gap between default and competitive significantly.',
    sources:[
      {name:'PJM 2026/27 BRA', url:'https://www.pjm.com/markets-and-operations/rpm', date:'Jul 2025'},
      {name:'EIA Form 861', url:'https://www.eia.gov/electricity/data/eia861/', date:'Annual'},
      {name:'NARUC PUC Directory', url:'https://www.naruc.org/about-naruc/regulatory-commissions/', date:'Quarterly'},
    ],
    byState:{
      PA:{deregulated:true, utility:'PECO/Duquesne/PPL/FE', defaultRate:11.45, competitiveRate:8.95, savingsLow:15, savingsHigh:28, suppliers:32, trend:[7.2,7.4,9.1,10.6,11.45], note:'Capacity charges flow through utility default. Competitive contracts hedge.'},
      NJ:{deregulated:true, utility:'PSE&G/JCP&L/Atlantic/Rockland', defaultRate:13.82, competitiveRate:10.40, savingsLow:18, savingsHigh:30, suppliers:28, trend:[9.2,9.8,11.5,12.9,13.82], note:'BGS auction sets default; competitive locks 12-36 month fixed.'},
      NY:{deregulated:true, utility:'Con Ed/National Grid/NYSEG', defaultRate:14.95, competitiveRate:11.20, savingsLow:15, savingsHigh:28, suppliers:38, trend:[10.4,11.1,12.8,13.7,14.95], note:'Higher capacity in NYC zone (J/K). NYISO ICAP separate from supply.'},
      MA:{deregulated:true, utility:'Eversource/National Grid/Unitil', defaultRate:16.22, competitiveRate:12.10, savingsLow:15, savingsHigh:30, suppliers:24, trend:[12.8,13.2,15.0,15.7,16.22], note:'Basic Service rates reset semi-annually; large gap in winter.'},
      CT:{deregulated:true, utility:'Eversource/UI', defaultRate:17.85, competitiveRate:13.30, savingsLow:18, savingsHigh:28, suppliers:22, trend:[12.4,13.5,15.7,16.4,17.85], note:'Standard Service rates among highest in nation.'},
      IL:{deregulated:true, utility:'ComEd/Ameren', defaultRate:8.92, competitiveRate:7.40, savingsLow:10, savingsHigh:22, suppliers:26, trend:[5.8,6.1,7.2,8.3,8.92], note:'PJM ComEd vs MISO Ameren; capacity rules differ.'},
      OH:{deregulated:true, utility:'AEP/FE/Duke/DP&L', defaultRate:10.18, competitiveRate:7.95, savingsLow:15, savingsHigh:28, suppliers:30, trend:[6.5,6.9,8.2,9.4,10.18], note:'Standard Service Offer (SSO) auctions reset annually.'},
      MD:{deregulated:true, utility:'BGE/Pepco/Delmarva/Potomac', defaultRate:13.45, competitiveRate:10.10, savingsLow:15, savingsHigh:28, suppliers:24, trend:[8.7,9.2,11.4,12.6,13.45], note:'BGE zone cleared at $466/MW-day in 2025/26 — flow-through.'},
      DE:{deregulated:true, utility:'Delmarva', defaultRate:13.20, competitiveRate:10.30, savingsLow:15, savingsHigh:25, suppliers:16, trend:[8.5,9.0,11.0,12.4,13.20], note:'Smaller market; fewer suppliers but competitive vs default.'},
      DC:{deregulated:true, utility:'Pepco', defaultRate:13.85, competitiveRate:10.60, savingsLow:15, savingsHigh:26, suppliers:18, trend:[9.0,9.5,11.5,12.9,13.85], note:'Standard Offer Service auctions semi-annually.'},
      TX:{deregulated:true, utility:'Oncor/CenterPoint/AEP/TNMP TDUs', defaultRate:11.65, competitiveRate:8.90, savingsLow:15, savingsHigh:30, suppliers:60, trend:[8.4,8.9,10.2,10.9,11.65], note:'ERCOT only; nodal LMP flows through. 60+ REPs offer fixed-price.'},
      ME:{deregulated:true, utility:'CMP/Versant', defaultRate:14.20, competitiveRate:11.50, savingsLow:12, savingsHigh:22, suppliers:14, trend:[10.1,10.7,12.4,13.3,14.20], note:'Standard Offer set by PUC bid; competitive RFPs available.'},
      NH:{deregulated:true, utility:'Eversource/Liberty/Unitil/NHEC', defaultRate:13.95, competitiveRate:11.40, savingsLow:12, savingsHigh:22, suppliers:12, trend:[9.8,10.4,12.0,13.0,13.95], note:'Default service resets semi-annually; large gap in winter.'},
      RI:{deregulated:true, utility:'Rhode Island Energy', defaultRate:16.85, competitiveRate:12.40, savingsLow:18, savingsHigh:30, suppliers:14, trend:[12.1,13.0,14.8,15.7,16.85], note:'Last Resort Service rates among the highest.'},
      _DEFAULT:{deregulated:false, utility:'Investor-owned utility', defaultRate:null, competitiveRate:null, savingsLow:null, savingsHigh:null, suppliers:0, trend:null, note:'Regulated market — supplier choice limited. STS focuses on tariff optimization and renewable PPAs.'},
    },
  },

  dr: {
    label:'Demand Response', refreshed:'2025-12',
    headline:'PJM 2026/27 capacity cleared at the $329.17/MW-day cap. 2027/28 already cleared higher.',
    summary:'DR programs pay capacity dollars for the right to reduce load during grid emergencies (typically <10 events/year, 4 hours each). Recent ISO auctions cleared at record highs, making DR revenue dramatically more attractive than 18 months ago.',
    sources:[
      {name:'PJM 2027/28 BRA Report', url:'https://www.pjm.com/markets-and-operations/rpm', date:'Dec 17 2025'},
      {name:'PJM 2026/27 BRA Report', url:'https://www.pjm.com/markets-and-operations/rpm', date:'Jul 22 2025'},
      {name:'NYISO ICAP', url:'https://www.nyiso.com/markets-operations/services/installed-capacity', date:'Quarterly'},
      {name:'ISO-NE FCM', url:'https://www.iso-ne.com/markets-operations/markets/forward-capacity-market', date:'Annual'},
    ],
    byISO:{
      'PJM':{
        zone:'RTO uniform',
        rates:[
          {label:'2024/25', value:28.92, status:'historical'},
          {label:'2025/26', value:269.92, status:'current'},
          {label:'2026/27', value:329.17, status:'next', cap:true},
          {label:'2027/28', value:333.44, status:'cleared', cap:true},
        ],
        annualRevPerMW:120147,
        note:'Floor/cap of $179.55/$333.44 set by FERC ER25-1357 for 2026/27 and 2027/28 auctions. RTO cleared uniformly — no zonal divergence for the first time. Driven by 5,400+ MW data center load growth.',
      },
      'NYISO':{
        zone:'NYC Zone J',
        rates:[
          {label:'Sum 24', value:6.10, unit:'$/kW-mo', status:'historical'},
          {label:'Sum 25', value:8.50, unit:'$/kW-mo', status:'current'},
          {label:'Win 25/26', value:5.20, unit:'$/kW-mo', status:'current'},
        ],
        annualRevPerMW:102000,
        note:'NYC zone J consistently highest in country. ICAP auctions monthly. SCR program for DR aggregators.',
      },
      'ISO-NE':{
        zone:'New England-wide',
        rates:[
          {label:'FCA 17', value:2.55, unit:'$/kW-mo', status:'historical'},
          {label:'FCA 18', value:3.58, unit:'$/kW-mo', status:'current'},
        ],
        annualRevPerMW:43000,
        note:'Forward Capacity Market clears 3 years ahead. Recent auctions weak vs PJM/NYISO due to surplus.',
      },
      'ERCOT':{zone:'Texas', rates:[{label:'2024 ERS',value:23,unit:'$/MWh',status:'historical'},{label:'2025 ERS',value:42,unit:'$/MWh',status:'current'}], annualRevPerMW:50000, note:'Energy-only market — no traditional capacity payments. ERS, 4CP shaving, and emergency reserve programs together provide DR value.'},
      'MISO':{zone:'Variable by zone', rates:[{label:'PRA 24/25',value:30,unit:'$/MW-day',status:'historical'},{label:'PRA 25/26',value:666.50,unit:'$/MW-day',status:'current'}], annualRevPerMW:96000, note:'Zonal capacity prices vary widely. Zone 7 (MI) recently strongest. Annual PRA auction.'},
      'CAISO':{zone:'California', rates:null, annualRevPerMW:65000, note:'Resource adequacy mostly bilateral; CCAs procure separately. DR via PDR/RDRR participation.'},
      'SE':{zone:'Southeast (regulated)', rates:null, annualRevPerMW:24000, note:'No organized capacity market. Utility-run DR programs only (e.g., FPL Business On Call).'},
      'WECC':{zone:'West (non-CAISO)', rates:null, annualRevPerMW:20000, note:'No organized capacity market outside CAISO. Utility-tariff DR programs only.'},
      'SPP':{zone:'Southwest Power Pool', rates:null, annualRevPerMW:30000, note:'Energy + Operating Reserves market only. Modest DR value via reserve participation.'},
    },
  },

  bps: {
    label:'Building Performance Standards', refreshed:'2026-01',
    headline:'9% of NYC buildings exceeded 2024 caps. 57% are over 2030 limits — and the next phase starts in 4 years.',
    summary:'Building Performance Standards set legally enforceable carbon caps on commercial buildings. Penalties are real ($268/ton CO₂e in NYC). Phase 2 limits in 2030 will affect ~75% of covered buildings — most of which are compliant today but won\'t be tomorrow.',
    sources:[
      {name:'NYC LL97', url:'https://www.nyc.gov/site/buildings/codes/ll97-greenhouse-gas-emissions-reductions.page', date:'Active 2024'},
      {name:'Boston BERDO 2.0', url:'https://www.boston.gov/departments/environment/building-emissions-reduction-and-disclosure', date:'Active 2025'},
      {name:'DC BEPS', url:'https://doee.dc.gov/service/building-energy-performance-standards-beps', date:'Active 2026'},
      {name:'IMT BPS Tracker', url:'https://www.imt.org/resources/comparison-of-bps-policies/', date:'Updated quarterly'},
    ],
    byJurisdiction:{
      'NY:New York':{ordinance:'Local Law 97', effective:'2024', coverage:'Buildings >25,000 sqft', caps:{office:{p1:8.46,p2:4.53}, healthcare:{p1:23.81,p2:11.93}, medical_office:{p1:11.93,p2:4.96}, hotel:{p1:9.87,p2:5.26}, retail:{p1:11.81,p2:5.50}, warehouse:{p1:4.20,p2:1.10}}, phases:['2024-29 P1','2030-34 P2','2035-49 P3','2050 net-zero'], currentPhase:0, penalty:268, penaltyUnit:'$/metric ton CO₂e/year', deadline:'May 1 annual filing'},
      'MA:Boston':{ordinance:'BERDO 2.0', effective:'2025', coverage:'Buildings >20,000 sqft (35,000 phased)', caps:null, phases:['2025-29 P1','2030-39 P2','2040-49 P3','2050 net-zero'], currentPhase:0, penalty:234, penaltyUnit:'$/metric ton CO₂e', deadline:'May 15 annual filing'},
      'DC:Washington':{ordinance:'BEPS', effective:'2026 cycle 2', coverage:'Buildings >50,000 sqft', caps:null, phases:['2021-26 C1','2027-32 C2','2033-39 C3'], currentPhase:1, penalty:'EUI-based fine schedule', deadline:'Apr 1 annual benchmarking'},
      'CO:Denver':{ordinance:'Energize Denver', effective:'2024', coverage:'Buildings >25,000 sqft', caps:null, phases:['2024 baseline','2027 interim','2030 final'], currentPhase:0, penalty:'Up to $0.50/sqft non-compliance', deadline:'Jun 1 annual filing'},
      'CO:Boulder':{ordinance:'Building Performance Ordinance', effective:'2025', coverage:'Buildings >20,000 sqft', caps:null, phases:['2025','2030','2035'], currentPhase:0, penalty:'$0.10/sqft/year', deadline:'Jun 1'},
      'WA:Seattle':{ordinance:'Building Emissions Performance Standard', effective:'2027', coverage:'Buildings >20,000 sqft', caps:null, phases:['2027','2031','2036','2041','2046','2051'], currentPhase:0, penalty:'$10/MTCO2e (escalating)', deadline:'Annual'},
      _DEFAULT:{ordinance:null, note:'No active BPS in this jurisdiction. Track new ordinances; many states/cities have proposals pending.'},
    },
  },

  rebates: {
    label:'Rebates & Incentives', refreshed:'2026-04',
    headline:'2,800+ active utility rebate programs nationwide. Deadlines and dollar caps shift monthly.',
    summary:'The DSIRE database (NCSU, federally funded) tracks every utility rebate, tax incentive, and state program. Rebates expire — capturing them before fund depletion is the difference between $0 and $50K+ per location for HVAC/lighting/controls upgrades.',
    sources:[
      {name:'DSIRE Database', url:'https://www.dsireusa.org', date:'Updated monthly'},
      {name:'IRA Hub', url:'https://www.energy.gov/lpo/inflation-reduction-act-2022', date:'Active'},
    ],
    byState:{
      CA:{programs:218, federal:9, hvac:'$800-$5,000/unit', led:'$0.05-$0.45/sqft', vfd:'$75-$250/HP', cx:'$0.10-$0.30/sqft', note:'Among the strongest rebate stacks nationwide.'},
      NY:{programs:166, federal:9, hvac:'$1,000-$4,500/unit', led:'$0.06-$0.50/sqft', vfd:'$80-$220/HP', cx:'$0.10-$0.30/sqft', note:'NYSERDA + Con Ed/National Grid programs stack.'},
      TX:{programs:142, federal:9, hvac:'$600-$3,800/unit', led:'$0.04-$0.32/sqft', vfd:'$60-$180/HP', cx:'$0.06-$0.20/sqft'},
      FL:{programs:96,  federal:9, hvac:'$400-$2,800/unit', led:'$0.03-$0.28/sqft', vfd:'$50-$150/HP', cx:'$0.05-$0.18/sqft'},
      MA:{programs:128, federal:9, hvac:'$1,200-$5,200/unit', led:'$0.08-$0.55/sqft', vfd:'$90-$280/HP', cx:'$0.12-$0.35/sqft', note:'Mass Save program among the strongest in nation.'},
      PA:{programs:104, federal:9, hvac:'$700-$3,600/unit', led:'$0.05-$0.40/sqft', vfd:'$70-$200/HP', cx:'$0.08-$0.22/sqft', note:'Act 129 EE&C funded programs across PECO/Duquesne/PPL/FE.'},
      IL:{programs:118, federal:9, hvac:'$800-$3,800/unit', led:'$0.05-$0.42/sqft', vfd:'$70-$200/HP', cx:'$0.08-$0.25/sqft'},
      OH:{programs:88,  federal:9, hvac:'$650-$3,400/unit', led:'$0.05-$0.38/sqft', vfd:'$65-$190/HP', cx:'$0.07-$0.20/sqft'},
      NJ:{programs:124, federal:9, hvac:'$900-$4,000/unit', led:'$0.06-$0.45/sqft', vfd:'$75-$220/HP', cx:'$0.10-$0.28/sqft'},
      _DEFAULT:{programs:65, federal:9, hvac:'$500-$2,800/unit', led:'$0.03-$0.30/sqft', vfd:'$50-$160/HP', cx:'$0.05-$0.18/sqft'},
    },
  },

  recs: {
    label:'Renewable Energy Credits', refreshed:'2026-04',
    headline:'Voluntary REC market: $1.50–$3/MWh. State compliance markets trade 5–60× higher.',
    summary:'RECs let portfolios make defensible renewable claims and meet state RPS or corporate sustainability goals. Voluntary market pricing has stayed cheap; compliance markets (NJ Class I SREC, MA Class I REC) trade at premium because of mandates.',
    sources:[
      {name:'PJM-GATS', url:'https://www.pjm-eis.com/getting-started/about-gats.aspx', date:'Quarterly'},
      {name:'NEPOOL-GIS', url:'https://www.nepoolgis.com', date:'Quarterly'},
      {name:'EPA Green Power Partnership', url:'https://www.epa.gov/greenpower', date:'Free'},
    ],
    markets:[
      {key:'voluntary', name:'Voluntary (national)', price:2.10, unit:'$/MWh', trend:[1.20,1.45,1.80,2.10], note:'Green-e certified; for corporate ESG claims and Scope 2 reporting.'},
      {key:'nj_srec', name:'NJ SREC (Class I solar)', price:212, unit:'$/MWh', trend:[185,195,205,212], note:'Strongest solar carve-out market. SACP cap protects price floor.'},
      {key:'ma_class1', name:'MA Class I REC', price:36, unit:'$/MWh', trend:[28,31,34,36], note:'New England RPS Class I. Trades through NEPOOL-GIS.'},
      {key:'pjm_t1', name:'PJM Tier 1 (PA AEPS)', price:7.50, unit:'$/MWh', trend:[4.8,5.5,6.8,7.50], note:'PA AEPS Tier 1 — solar carve-out separate.'},
      {key:'wregis', name:'WREGIS (West)', price:1.85, unit:'$/MWh', trend:[1.40,1.55,1.70,1.85], note:'Western voluntary market. Lower volumes vs PJM/NEPOOL.'},
    ],
  },

  solar: {
    label:'Solar & Community Solar', refreshed:'2026-03',
    headline:'24 states + DC have community solar programs. Subscription savings 5–20% off retail with no install.',
    summary:'Community solar lets your locations get solar credits without rooftop installation — STS subscribes you to local projects and bills are netted via VNM (Virtual Net Metering). Where rooftop is feasible, NREL-modeled production data tells you whether on-site PV pencils.',
    sources:[
      {name:'DSIRE Community Solar', url:'https://programs.dsireusa.org/system/program?type=210', date:'Quarterly'},
      {name:'NREL PVWatts', url:'https://pvwatts.nrel.gov/', date:'Live API'},
      {name:'CESA', url:'https://www.cesa.org', date:'Annual'},
    ],
    byState:{
      NY:{open:true, status:'Active', savings:'5-15% off bill', irradiance:1250, programs:'NY-Sun + Community Solar'},
      MA:{open:true, status:'Active', savings:'10-20% off bill', irradiance:1200, programs:'SMART + Community Shared Solar'},
      NJ:{open:true, status:'Active', savings:'10-20% off bill', irradiance:1300, programs:'CSEP + SuSI'},
      MD:{open:true, status:'Active', savings:'5-15% off bill', irradiance:1300, programs:'Community Solar Pilot'},
      IL:{open:true, status:'Active', savings:'10-20% off bill', irradiance:1250, programs:'Illinois Shines + Solar for All'},
      CO:{open:true, status:'Active', savings:'5-15% off bill', irradiance:1650, programs:'Community Solar Garden'},
      MN:{open:true, status:'Active', savings:'10-15% off bill', irradiance:1350, programs:'Solar*Rewards Community'},
      VA:{open:true, status:'Active', savings:'5-10% off bill', irradiance:1350, programs:'Shared Solar Program'},
      CA:{open:true, status:'CCA-led', savings:'Variable', irradiance:1750, programs:'CCA community solar + DAC-SASH'},
      DC:{open:true, status:'Active', savings:'10-15% off bill', irradiance:1300, programs:'DC Sustainable Energy Utility'},
      ME:{open:true, status:'Active', savings:'5-15% off bill', irradiance:1250, programs:'NEB Community Solar'},
      CT:{open:true, status:'Active', savings:'5-15% off bill', irradiance:1250, programs:'Shared Clean Energy Facilities'},
      RI:{open:true, status:'Active', savings:'5-15% off bill', irradiance:1250, programs:'Community Remote Net Metering'},
      OR:{open:true, status:'Active', savings:'5-10% off bill', irradiance:1300, programs:'Community Solar Program'},
      PA:{open:false, status:'Pending legislation', savings:null, irradiance:1300, programs:'On-site PV only via SREC + net metering'},
      TX:{open:false, status:'Limited (utility-led)', savings:null, irradiance:1650, programs:'Austin Energy + CPS Energy programs only'},
      _DEFAULT:{open:false, status:'Not yet authorized', savings:null, irradiance:1300, programs:'On-site PV available; community solar pending state authorization.'},
    },
  },

  efficiency: {
    label:'Energy Efficiency · EaaS', refreshed:'2026-02',
    headline:'Buildings on ASHRAE 90.1-2007 or older have 25-40% achievable savings vs current code.',
    summary:'Energy as a Service (EaaS) finances retrofits — LED, controls, HVAC, envelope — through the savings stream itself. No capex. Older building stock unlocks the largest wins; ASHRAE 90.1 vintage by state determines the gap.',
    sources:[
      {name:'ASHRAE 90.1', url:'https://www.ashrae.org/technical-resources/standards-and-guidelines', date:'Latest 2022'},
      {name:'DOE Better Buildings', url:'https://betterbuildingssolutioncenter.energy.gov/', date:'Annual'},
      {name:'IECC State Adoption', url:'https://www.energycodes.gov/status', date:'Live'},
    ],
    bands:[
      {key:'leading', label:'Leading codes', states:['CA','NY','MA','WA','OR','CT'], code:'ASHRAE 90.1-2019 / IECC 2021', savings:'15-25%', cycle:'~3 yr'},
      {key:'modern', label:'Modern codes', states:['IL','MN','MD','NJ','VT','RI','VA','CO','HI','DC'], code:'ASHRAE 90.1-2016 / IECC 2018', savings:'20-30%', cycle:'~5 yr'},
      {key:'mid', label:'Mid-vintage', states:['PA','OH','GA','TX','FL','NV','AZ','NC','SC','UT','MI','WI','TN','NM','LA','IA','IN'], code:'ASHRAE 90.1-2010 / IECC 2015', savings:'25-35%', cycle:'~7 yr'},
      {key:'older', label:'Older codes', states:['MS','MO','KY','AL','AR','OK','KS','NE','SD','ND','WV','ID','MT','WY','AK'], code:'ASHRAE 90.1-2007 or earlier', savings:'30-45%', cycle:'No formal cycle'},
    ],
  },

  esg: {
    label:'ESG & Sustainability', refreshed:'2026-03',
    headline:'SEC climate rule litigation pending. CDP, SBTi, and TCFD remain the de-facto frameworks.',
    summary:'Even with the SEC climate rule stayed pending litigation, voluntary frameworks (CDP, SBTi, TCFD/ISSB) are the working standard for B2B and investor-facing disclosures. STS converts utility data into the formats your sustainability and IR teams need.',
    sources:[
      {name:'SEC Climate Rule', url:'https://www.sec.gov/news/press-release/2024-31', date:'Stayed Apr 2024'},
      {name:'SBTi Sectors', url:'https://sciencebasedtargets.org/sectors', date:'Annual'},
      {name:'CDP', url:'https://www.cdp.net', date:'Annual cycle'},
      {name:'IFRS / ISSB', url:'https://www.ifrs.org/groups/international-sustainability-standards-board/', date:'Active'},
    ],
    frameworks:[
      {name:'CDP', adopters:'24,000+ corps globally', timeline:'Annual: Apr–Jul', scope:'Climate, Water, Forests', use:'Investor-grade ESG ratings'},
      {name:'SBTi', adopters:'8,000+ corps globally', timeline:'24 months from commitment', scope:'Scope 1, 2, 3 reduction targets', use:'Validated decarb pathway'},
      {name:'TCFD/ISSB', adopters:'Mandatory in UK, EU, JP, NZ, AU, CA', timeline:'Annual', scope:'Climate-related financial risk', use:'10-K equivalent disclosure'},
      {name:'GHG Protocol', adopters:'Universal', timeline:'Annual inventory', scope:'Scope 1+2+3 accounting', use:'Foundation for all frameworks'},
    ],
  },

  recovery: {
    label:'Utility Cost Recovery', refreshed:'2026-01',
    headline:'Industry studies find 1–3% of commercial utility billing contains errors. STS recovers them retrospectively.',
    summary:'Demand ratchet errors, tariff misclassification, missed sales-tax exemptions, meter multiplier errors — these are the most common categories of overcharge. State PUCs allow retroactive refunds for typically 2–4 years of overbilling once documented.',
    sources:[
      {name:'NARUC PUC Directory', url:'https://www.naruc.org/about-naruc/regulatory-commissions/', date:'Live'},
      {name:'DOE Better Buildings — billing audit case studies', url:'https://betterbuildingssolutioncenter.energy.gov/', date:'Annual'},
    ],
    stats:{
      avgRecovery:'1.2% of annual spend (industry median)',
      lookback:'2-4 years (varies by state)',
      contingency:'STS-only fee — no recovery, no charge',
      categories:[
        {name:'Demand ratchet errors', share:38},
        {name:'Tariff/rate-class misassignment', share:24},
        {name:'Missed sales-tax exemptions', share:18},
        {name:'Meter multiplier errors', share:9},
        {name:'Late payment / penalty waivers', share:6},
        {name:'Other (unmetered service, etc.)', share:5},
      ],
    },
  },
};

console.log('[program_data] loaded · ' + Object.keys(window.PROGRAM_DATA).length + ' programs');
