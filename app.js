/* DomestiCare Tailor-made Contracts (domestics.inreco.co.za)
   Questions -> PayFast -> payment server confirms -> paid templates -> PDFs made on this device.
   Uses PayFast Pay Now fields only: never put a merchant key or passphrase here. */
(function () {
  'use strict';
  const CONTACT = { whatsapp: '27844027029', whatsappDisplay: '084 402 7029', email: 'info@inreco.co.za' };
  const SERVER = 'https://ccmaprep-pay.badenhorst-casper.workers.dev';   // iNRECO payment server (Cloudflare Worker)
  const LOCK = { statusUrl: SERVER + '/status', docUrl: SERVER + '/doc', notifyUrl: SERVER + '/itn', everyMs: 4000, returnMs: 120000, waitMs: 600000 };
  const PAYFAST = { receiver: '12090292', action: 'https://www.payfast.co.za/eng/process', siteUrl: 'https://domestics.inreco.co.za/' };
  const PRICES = { c: 150, cd: 180, ck: 180, cdk: 199 };
  const NAMES = { c: 'DomestiCare Employment Contract', cd: 'DomestiCare Contract + Duties Checklist', ck: 'DomestiCare Contract + Code of Conduct', cdk: 'DomestiCare Contract + Duties Checklist + Code of Conduct' };
  const NMW = 30.23, WEEKS_PER_MONTH = 4.333, LAW_DATE = 'November 2026';
  const ORDER_KEY = 'domesticare_order_v1', DRAFT_KEY = 'domesticare_draft_v1';
  const REF_RE = /^DOM-\d{6}-[A-Z0-9]{5}$/;
  const DAYS = [['Mon', 'Monday'], ['Tue', 'Tuesday'], ['Wed', 'Wednesday'], ['Thu', 'Thursday'], ['Fri', 'Friday'], ['Sat', 'Saturday'], ['Sun', 'Sunday']];
  const AMENITIES = ['Window', 'Door that locks', 'Own toilet', 'Shared toilet', 'Own shower or bath', 'Shared shower or bath', 'Electricity', 'Hot water', 'Bed', 'Wardrobe', 'Kitchenette'];
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const group3 = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const money = n => { const c = Math.round((+n || 0) * 100); const neg = c < 0 ? '-' : ''; const v = Math.abs(c); return `${neg}R${group3(String(Math.floor(v / 100)))}.${String(v % 100).padStart(2, '0')}`; };
  const rand = n => 'R' + group3(String(Math.round(+n || 0)));
  const D = window.DC_DATA;

  function makeOrderRef() {
    const d = new Date(), pad = n => String(n).padStart(2, '0');
    const rnd = Array.from(crypto.getRandomValues(new Uint8Array(4)), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('') + 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[crypto.getRandomValues(new Uint8Array(1))[0] % 32];
    return `DOM-${String(d.getFullYear()).slice(2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${rnd}`;
  }
  const ORDER_REF = makeOrderRef();
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (_) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} } };

  /* ---------- build the form widgets ---------- */
  let role = '';
  function buildUI() {
    const rc = $('#roleChips');
    Object.entries(D.roles).forEach(([k, r]) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.role = k; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false'); b.textContent = r.label;
      b.addEventListener('click', () => setRole(k, true)); rc.appendChild(b);
    });
    const dg = $('#dutyGroups');
    D.categories.forEach(c => {
      const det = document.createElement('details'); det.className = 'dgroup'; det.dataset.cat = c.key;
      det.innerHTML = `<summary>${c.label}<span class="cnt"></span></summary><div class="dl"></div>`;
      const dl = $('.dl', det);
      c.duties.forEach(([k, t]) => {
        const l = document.createElement('label'); l.className = 'check';
        l.innerHTML = `<input type="checkbox" class="duty" value="${k}"> <span></span>`; $('span', l).textContent = t; dl.appendChild(l);
      });
      dg.appendChild(det);
    });
    const wd = $('#workDays');
    DAYS.forEach(([s, full], i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.day = s; b.title = full; b.textContent = s;
      b.setAttribute('aria-pressed', i < 5 ? 'true' : 'false'); b.addEventListener('click', () => { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); update(); }); wd.appendChild(b);
    });
    const am = $('#amenities');
    AMENITIES.forEach(a => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.amenity = a; b.textContent = a;
      b.setAttribute('aria-pressed', ['Window', 'Door that locks', 'Electricity'].includes(a) ? 'true' : 'false');
      b.addEventListener('click', () => { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); update(); }); am.appendChild(b);
    });
  }
  function setRole(k, applyDefaults) {
    role = k;
    $$('#roleChips .chip').forEach(b => b.setAttribute('aria-checked', String(b.dataset.role === k)));
    if (applyDefaults) {
      const r = D.roles[k];
      $('#jobTitle').value = r.title;
      $$('.duty').forEach(cb => { cb.checked = r.duties.includes(cb.value); });
      $$('.dgroup').forEach(det => { det.open = $$('.duty', det).some(cb => cb.checked); });
    }
    update();
  }

  /* ---------- read / restore answers ---------- */
  const TEXT_IDS = ['employerName', 'employerId', 'employerAddress', 'employerPhone', 'employerEmail', 'workerName', 'workerId', 'workerDob', 'workerPhone', 'workerAddress', 'nokName', 'nokPhone', 'permitNo', 'permitExpiry',
    'jobTitle', 'startDate', 'licenceCode', 'probation', 'reportsTo', 'endDate', 'fixedReason', 'startTime', 'endTime', 'breakMins', 'overtime', 'standbyAmt',
    'payFreq', 'wage', 'payMethod', 'payDay', 'bankText', 'reviewDate', 'notice', 'transportAmt', 'transportPer', 'medicalAmt', 'bonus', 'otherBenefits',
    'accomDescription', 'accomDeduction', 'vacateDays', 'offFrom', 'offTo', 'visitors'];
  const CHECK_IDS = ['foreign', 'nightWork', 'standby', 'meals', 'uniform', 'addDuties', 'addCode', 'popia', 'terms'];
  function collect() {
    const a = { role };
    TEXT_IDS.forEach(id => { a[id] = ($('#' + id).value || '').trim(); });
    CHECK_IDS.forEach(id => { a[id] = $('#' + id).checked; });
    a.contractType = ($('input[name=contractType]:checked') || {}).value || 'permanent';
    a.liveIn = (($('input[name=liveIn]:checked') || {}).value || 'no') === 'yes';
    a.workDays = $$('#workDays .chip').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.day);
    a.amenities = $$('#amenities .chip').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.amenity);
    a.duties = $$('.duty').filter(cb => cb.checked).map(cb => cb.value);
    return a;
  }
  function restore(a) {
    if (!a) return;
    TEXT_IDS.forEach(id => { if (a[id] != null && $('#' + id)) $('#' + id).value = a[id]; });
    CHECK_IDS.forEach(id => { if (a[id] != null && $('#' + id)) $('#' + id).checked = !!a[id]; });
    const ct = $(`input[name=contractType][value="${a.contractType === 'fixed' ? 'fixed' : 'permanent'}"]`); if (ct) ct.checked = true;
    const li = $(`input[name=liveIn][value="${a.liveIn ? 'yes' : 'no'}"]`); if (li) li.checked = true;
    if (Array.isArray(a.workDays)) $$('#workDays .chip').forEach(b => b.setAttribute('aria-pressed', String(a.workDays.includes(b.dataset.day))));
    if (Array.isArray(a.amenities)) $$('#amenities .chip').forEach(b => b.setAttribute('aria-pressed', String(a.amenities.includes(b.dataset.amenity))));
    if (Array.isArray(a.duties)) $$('.duty').forEach(cb => { cb.checked = a.duties.includes(cb.value); });
    $$('.dgroup').forEach(det => { det.open = $$('.duty', det).some(cb => cb.checked); });
    if (a.role && D.roles[a.role]) setRole(a.role, false);
  }

  /* ---------- the maths and the legal checks ---------- */
  const mins = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ''); return m ? (+m[1]) * 60 + (+m[2]) : NaN; };
  const num = s => { const n = parseFloat(String(s).replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
  function fmtDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); if (!m) return s || '';
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  function ageOn(dob, on) {
    const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || ''), b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(on || '');
    if (!a || !b) return NaN;
    let age = +b[1] - +a[1]; if (+b[2] < +a[2] || (+b[2] === +a[2] && +b[3] < +a[3])) age--; return age;
  }
  const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function dayList(short) {
    const full = short.map(s => DAYS.find(d => d[0] === s)[1]);
    const idx = short.map(s => DAYS.findIndex(d => d[0] === s)).sort((x, y) => x - y);
    const contiguous = idx.length > 2 && idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
    return contiguous ? `${DAYS[idx[0]][1]} to ${DAYS[idx[idx.length - 1]][1]}` : full.join(', ');
  }

  function compute(a) {
    const errs = [];   // [fieldId, message]
    const days = a.workDays.length;
    const span = (mins(a.endTime) - mins(a.startTime)) / 60;
    const brk = +a.breakMins || 0;
    const hpd = Math.round((span - brk / 60) * 100) / 100;
    const weekly = Math.round(hpd * days * 100) / 100;
    const hours = { days, span, hpd, weekly, ok: true, msg: '' };
    if (!days) { errs.push(['workDays', 'at least one working day']); hours.ok = false; }
    if (!(span > 0)) { errs.push(['endTime', 'a finish time after the start time']); hours.ok = false; }
    else {
      const limit = days > 5 ? 8 : 9;
      if (brk === 0 && span >= 6) { errs.push(['breakMins', 'a meal break (needed when the work day is 6 hours or longer)']); hours.ok = false; hours.msg = 'A day of 6 hours or more needs a meal break: 1 hour, or 30 minutes if you both agree in writing.'; }
      else if (hpd > limit) { errs.push(['endTime', `shorter days (most ${limit} ordinary hours a day when working ${days > 5 ? 'more than 5' : '5 or fewer'} days a week)`]); hours.ok = false; hours.msg = `That is ${hpd} hours a day. The law allows at most ${limit} ordinary hours a day for ${days} working days a week. Extra time is overtime and must be agreed and paid at 1.5 times.`; }
      else if (weekly > 45) { errs.push(['workDays', 'at most 45 ordinary hours a week']); hours.ok = false; hours.msg = `That is ${weekly} hours a week. The law allows at most 45 ordinary hours a week.`; }
    }
    // National Minimum Wage (paid for at least 4 hours on any day worked)
    const monthly = a.payFreq !== 'weekly';
    const paidDay = Math.max(hpd || 0, 4);
    const paidWeek = paidDay * days;
    const factor = monthly ? WEEKS_PER_MONTH : 1;
    const minPay = Math.ceil(NMW * paidWeek * factor * 100) / 100;
    const wage = num(a.wage);
    const hourly = wage > 0 && paidWeek > 0 ? wage / (paidWeek * factor) : NaN;
    const nmw = { minPay, wage, hourly, per: monthly ? 'month' : 'week', ok: wage >= minPay - 0.004 };
    if (!(wage > 0)) errs.push(['wage', 'the wage']);
    else if (hours.ok && !nmw.ok) errs.push(['wage', `a wage of at least ${money(minPay)} a ${nmw.per} (National Minimum Wage)`]);

    // Age
    const age = ageOn(a.workerDob, a.startDate || todayIso());
    if (!a.workerDob) errs.push(['workerDob', "the worker's date of birth"]);
    else if (!(age >= 0) || age > 100) errs.push(['workerDob', 'a valid date of birth']);
    else if (age < 15) errs.push(['workerDob', 'a worker of at least 15 (children under 15 may not be employed)']);

    // Required fields
    [['employerName', 'your name'], ['employerAddress', 'the address of the home'], ['employerPhone', 'your phone number'], ['workerName', "the worker's name"], ['startDate', 'the start date']]
      .forEach(([id, n]) => { if (!a[id]) errs.push([id, n]); });
    if (!a.role) errs.push(['roleChips', 'the main job']);
    if (!a.duties.length) errs.push(['dutyGroups', 'at least one duty']);
    if (a.contractType === 'fixed') {
      if (!a.endDate) errs.push(['endDate', 'the end date of the fixed term']);
      else if (a.startDate && a.endDate <= a.startDate) errs.push(['endDate', 'an end date after the start date']);
    }
    const standbyShown = showStandby(a);
    const sb = num(a.standbyAmt);
    if (standbyShown && a.standby && !(sb >= 20)) errs.push(['standbyAmt', 'a standby allowance of at least R20 a shift']);
    const accom = a.liveIn ? (num(a.accomDeduction) || 0) : 0;
    if (accom < 0) errs.push(['accomDeduction', 'a room deduction of 0 or more']);
    if (accom > 0 && wage > 0 && accom > wage * 0.1 + 0.004) errs.push(['accomDeduction', `a room deduction of at most ${money(wage * 0.1)} (10% of the wage)`]);
    const am = a.amenities;
    const roomOk = am.includes('Window') && am.includes('Door that locks') && (am.includes('Own toilet') || am.includes('Shared toilet')) && (am.includes('Own shower or bath') || am.includes('Shared shower or bath'));
    if (accom > 0 && !roomOk) errs.push(['amenities', 'a room with a window, a door that locks, a toilet and a shower or bath (needed before you may deduct for it)']);
    if (a.liveIn && (num(a.vacateDays) || 0) < 30) errs.push(['vacateDays', 'at least 30 days to move out']);
    return { errs, hours, nmw, age, accom, standbyShown };
  }
  function showStandby(a) {
    return ['nanny', 'aupair', 'caregiver'].includes(a.role) || a.liveIn || a.duties.some(k => /^[ce]\d/.test(k));
  }
  function productCode(a) { return 'c' + (a.addDuties ? 'd' : '') + (a.addCode ? 'k' : ''); }

  /* ---------- answers -> template variables and flags ---------- */
  function varsFor(a, ref, code) {
    const c = compute(a);
    const has = p => a.duties.some(k => k.startsWith(p));
    const hourly = c.nmw.hourly;
    const per = c.nmw.per;
    const off = DAYS.filter(d => !a.workDays.includes(d[0])).map(d => d[1]);
    const transport = num(a.transportAmt) > 0 ? `${money(num(a.transportAmt))} per ${a.transportPer === 'day' ? 'working day' : a.transportPer}` : 'None';
    const flags = {
      liveIn: a.liveIn, fixedTerm: a.contractType === 'fixed', probation: +a.probation > 0, foreign: a.foreign,
      minor: c.age >= 15 && c.age < 18,
      break60: +a.breakMins === 60, break30: +a.breakMins === 30, break0: +a.breakMins === 0,
      overtimeYes: a.overtime === 'yes', overtimeNo: a.overtime !== 'yes', nightWork: a.nightWork,
      standby: c.standbyShown && a.standby, sundayWork: a.workDays.includes('Sun'),
      frlApplies: a.workDays.length >= 4, meals: a.meals, uniform: a.uniform, accomDeduction: c.accom > 0,
      childcare: ['nanny', 'aupair'].includes(a.role) || has('c'), eldercare: a.role === 'caregiver' || has('e'),
      cook: a.role === 'cook' || a.duties.includes('k2'), gardener: ['gardener', 'combined'].includes(a.role) || has('ga'),
      driver: a.role === 'driver',
      hasDuties: code.includes('d'), hasCode: code.includes('k')
    };
    const vars = {
      ref, lawDate: LAW_DATE, nmwHourly: money(NMW),
      employerName: a.employerName, employerId: a.employerId, employerAddress: a.employerAddress, employerPhone: a.employerPhone, employerEmail: a.employerEmail || 'None',
      workerName: a.workerName, workerId: a.workerId, workerDob: fmtDate(a.workerDob), workerAddress: a.workerAddress || (a.liveIn ? "Lives in at the Employer's home" : ''), workerPhone: a.workerPhone,
      nokName: a.nokName, nokPhone: a.nokPhone, nokText: [a.nokName, a.nokPhone].filter(Boolean).join(', '), permitNo: a.permitNo, permitExpiry: fmtDate(a.permitExpiry),
      jobTitle: a.jobTitle || (D.roles[a.role] || {}).title, contractType: a.contractType === 'fixed' ? `Fixed term, ends ${fmtDate(a.endDate)}` : 'Permanent',
      startDate: fmtDate(a.startDate), endDate: fmtDate(a.endDate), fixedReason: a.fixedReason || 'agreed between the parties',
      probationMonths: a.probation, probationText: +a.probation > 0 ? `${a.probation} month${+a.probation > 1 ? 's' : ''}` : 'None',
      reportsTo: a.reportsTo || 'The Employer', liveInText: a.liveIn ? 'Yes (see section 13)' : 'No', licenceCode: a.licenceCode || 'code ________',
      workDays: dayList(a.workDays), startTime: a.startTime, endTime: a.endTime,
      breakText: { 60: '1 hour (unpaid)', 30: '30 minutes (unpaid, agreed in writing by signing this contract)', 0: 'None (fewer than 6 hours a day)' }[+a.breakMins],
      hoursPerDay: String(c.hours.hpd), hoursPerWeek: String(c.hours.weekly),
      overtimeText: a.overtime === 'yes' ? 'By agreement only; at most 15 hours a week and 12 hours a day in total' : 'Not expected (see 4.4)',
      nightText: a.nightWork ? 'Yes, by agreement (see 4.7)' : 'No', standbyText: flags.standby ? `Yes: ${money(num(a.standbyAmt))} a shift, at most 5 a month (see 4.8)` : 'No',
      standbyAllowance: money(num(a.standbyAmt) || 20),
      ot15: money(hourly * 1.5), sun15: money(hourly * 1.5), sun2: money(hourly * 2),
      wageText: `${money(c.nmw.wage)} a ${per} (before UIF)`, hourlyText: money(hourly),
      payMethodText: a.payMethod === 'cash' ? 'Cash, against a signed receipt and payslip' : "EFT into the Employee's bank account",
      payDay: a.payDay, bankText: a.payMethod === 'cash' ? 'Not applicable (paid in cash)' : a.bankText, reviewDate: a.reviewDate,
      noticeText: +a.notice > 0 ? `${a.notice} weeks (by either party, after probation)` : 'No (the legal minimum applies)',
      annualDays: String(a.workDays.length * 3), sickDays: String(a.workDays.length * 6),
      frlText: flags.frlApplies ? '5 days paid each year after 4 months (see 6.3)' : 'Not applicable: works fewer than 4 days a week (see 6.3)',
      mealsText: a.meals ? 'Yes, free (never deducted from the wage)' : 'Not provided', transportText: transport,
      uniformText: a.uniform ? 'Yes, free of charge' : 'Not provided', medicalText: num(a.medicalAmt) > 0 ? `${money(num(a.medicalAmt))} a month` : 'None',
      bonusText: { none: 'None', '13th': "13th cheque: one month's wage, paid in December", discretion: "At the Employer's choice each year (not guaranteed)" }[a.bonus] || 'None',
      otherBenefits: a.otherBenefits || 'None',
      accomDescription: a.accomDescription, amenities: a.amenities.join(', '), accomDeduction: `${money(c.accom)} a ${per}`,
      accomDeductionText: c.accom > 0 ? `${money(c.accom)} a ${per} (not more than 10% of the wage)` : 'None: the room is free',
      vacateDays: String(Math.max(30, num(a.vacateDays) || 30)), offDutyText: `From ${a.offFrom} to ${a.offTo} on working days, and all day on days off`,
      daysOffText: off.length ? off.join(', ') : 'As agreed (at least 36 hours in a row each week)',
      visitorsText: { day: 'Day visitors with permission; no overnight guests without written permission', ask: 'Only with permission each time', free: 'Welcome in off-duty time; overnight guests with permission' }[a.visitors] || ''
    };
    const groupOf = {}; D.categories.forEach(cat => cat.duties.forEach(([k, t]) => { groupOf[k] = { key: k, text: t, group: cat.label }; }));
    const duties = a.duties.map(k => groupOf[k]).filter(Boolean);
    return { vars, flags, duties };
  }

  /* ---------- live screen updates ---------- */
  function update() {
    const a = collect();
    const c = compute(a);
    $('#fixedBox').hidden = a.contractType !== 'fixed';
    $('#foreignBox').hidden = !a.foreign;
    $('#liveBox').hidden = !a.liveIn;
    $('#licenceBox').hidden = a.role !== 'driver';
    $('#bankBox').hidden = a.payMethod === 'cash';
    $('#standbyWrap').hidden = !c.standbyShown;
    $('#standbyBox').hidden = !(c.standbyShown && a.standby);
    $$('.dgroup').forEach(det => { const n = $$('.duty:checked', det).length; $('.cnt', det).textContent = n ? `${n} ticked` : ''; });
    // hours
    const hc = $('#hoursCalc');
    if (c.hours.days && c.hours.span > 0) {
      hc.className = 'calc' + (c.hours.msg ? ' bad' : '');
      hc.textContent = c.hours.msg || `${c.hours.hpd} working hours a day × ${c.hours.days} day${c.hours.days > 1 ? 's' : ''} = ${c.hours.weekly} hours a week.`;
    } else hc.textContent = '';
    // minimum wage
    const nb = $('#nmwBox');
    if (c.hours.ok && c.hours.days) {
      const base = `Legal minimum for ${Math.round(Math.max(c.hours.hpd, 4) * c.hours.days * 100) / 100} hours a week: ${money(c.nmw.minPay)} a ${c.nmw.per} (R30.23 an hour${c.nmw.per === 'month' ? ' × 4.333 weeks' : ''}).`;
      if (c.nmw.wage > 0) {
        nb.className = 'nmw' + (c.nmw.ok ? '' : ' bad');
        nb.textContent = c.nmw.ok ? `✓ ${base} Your wage works out to ${money(c.nmw.hourly)} an hour.` : `✗ Too low. ${base} You can't continue until the wage is at least ${money(c.nmw.minPay)}.`;
      } else { nb.className = 'nmw'; nb.textContent = base; }
    } else nb.textContent = '';
    // age
    const am = $('#ageMsg');
    if (a.workerDob && c.age >= 0 && c.age < 15) { am.hidden = false; am.className = 'msg bad'; am.textContent = 'Children under 15 may not be employed. You cannot make a contract for this person.'; }
    else if (a.workerDob && c.age >= 15 && c.age < 18) { am.hidden = false; am.className = 'msg'; am.textContent = `The worker is ${c.age}. Workers under 18 may not do risky work, and the contract adds the extra rules for young workers.`; }
    else am.hidden = true;
    // price
    const code = productCode(a), price = PRICES[code];
    $('#total').textContent = rand(price); $('#stickyTotal').textContent = rand(price);
    if (!paidState.paid) { $('#payBtn').textContent = `Pay ${rand(price)} with PayFast`; }
    $('#nudge').hidden = code === 'cdk';
    $('#nudge').innerHTML = code === 'c' ? 'Add both and pay <b>R199</b> for all three (save R11).' : 'Add the other one too: all three for <b>R199</b> (save R11).';
    if (!paidState.paid) store.set(DRAFT_KEY, { a, at: Date.now() });
  }

  function showErrors(errs) {
    $$('.invalid').forEach(e => e.classList.remove('invalid'));
    const box = $('#errors');
    if (!errs.length) { box.hidden = true; return; }
    errs.forEach(([id]) => { const el = $('#' + id); if (el) el.classList.add('invalid'); });
    box.hidden = false; box.innerHTML = '<b>Please check:</b> ';
    const ul = document.createElement('span'); ul.textContent = [...new Set(errs.map(e => e[1]))].join('; ') + '.'; box.appendChild(ul);
    const first = $('.invalid'); (first || box).scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /* ---------- PayFast ---------- */
  function payfastFields(a) {
    const code = productCode(a);
    const f = {
      cmd: '_paynow', receiver: PAYFAST.receiver,
      return_url: `${PAYFAST.siteUrl}?ref=${ORDER_REF}#paid`, cancel_url: `${PAYFAST.siteUrl}?ref=${ORDER_REF}#cancelled`, notify_url: LOCK.notifyUrl,
      name_first: (a.employerName || '').split(/\s+/)[0].slice(0, 100),
      email_address: a.employerEmail && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(a.employerEmail) ? a.employerEmail : '',
      m_payment_id: `${ORDER_REF}.${code}`, amount: PRICES[code].toFixed(2), item_name: NAMES[code], item_description: `Order ${ORDER_REF}`
    };
    Object.keys(f).forEach(k => { if (!f[k]) delete f[k]; });
    return { action: PAYFAST.action, fields: f };
  }
  window.payfastFields = () => payfastFields(collect());
  window.ORDER_REF = ORDER_REF;

  function pay(e) {
    if (e) e.preventDefault();
    const a = collect();
    const errs = compute(a).errs;
    if (!a.popia) errs.push(['popia', 'the privacy box']);
    if (!a.terms) errs.push(['terms', 'the "template, not legal advice" box']);
    if (errs.length) return showErrors(errs);
    showErrors([]);
    const code = productCode(a), payload = payfastFields(a);
    store.set(ORDER_KEY, { ref: ORDER_REF, code, amount: payload.fields.amount, answers: a, at: Date.now() });
    const f = document.createElement('form');
    f.method = 'post'; f.action = payload.action; f.target = '_blank'; f.style.display = 'none';
    Object.entries(payload.fields).forEach(([n, v]) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = n; i.value = v; f.appendChild(i); });
    document.body.appendChild(f); f.submit(); f.remove();
    startPolling(ORDER_REF, LOCK.waitMs, true);
  }

  /* ---------- payment lock: nothing downloadable until the server says paid ---------- */
  const paidState = { paid: false, ref: '', templates: null, items: null, timer: null, run: 0, state: 'idle' };
  const box = () => $('#payReturn');
  function setBox(title, text, nodes) {
    $('#payReturnTitle').textContent = title; $('#payReturnText').textContent = text;
    const act = $('#payReturnActions'); act.innerHTML = ''; (nodes || []).forEach(n => act.appendChild(n));
    box().hidden = false; box().scrollIntoView({ block: 'start' });
  }
  function el(tag, attrs, text) { const e = document.createElement(tag); Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v)); if (text) e.textContent = text; return e; }
  async function getJson(url) {
    try { const r = await fetch(url, { cache: 'no-store' }); const j = await r.json().catch(() => ({})); return { status: r.status, j }; }
    catch (_) { return { status: 0, j: {} }; }
  }
  function startPolling(ref, maxMs, waiting) {
    const run = ++paidState.run; clearTimeout(paidState.timer); paidState.state = 'polling';
    setBox(waiting ? 'Waiting for your payment…' : 'Confirming your payment…',
      waiting ? `Finish paying in the PayFast tab. Your download buttons appear here as soon as PayFast confirms your payment. Order: ${ref}.` : `Please keep this page open. This takes a few seconds. Order: ${ref}.`,
      [el('p', { class: 'small', role: 'status' }, '⏳ Checking with PayFast…')]);
    const until = Date.now() + maxMs;
    const tick = async () => {
      if (run !== paidState.run) return;
      const st = await getJson(`${LOCK.statusUrl}?ref=${encodeURIComponent(ref)}`);
      if (run !== paidState.run) return;
      if (st.j && st.j.paid === true) return unlock(ref);
      if (Date.now() >= until) return notYet(ref);
      paidState.timer = setTimeout(tick, LOCK.everyMs);
    };
    tick();
  }
  function notYet(ref) {
    paidState.state = 'timeout';
    const again = el('button', { type: 'button', class: 'btn btn-blue' }, 'Tap to check again');
    again.addEventListener('click', () => startPolling(ref, LOCK.returnMs, false));
    const wa = el('a', { class: 'btn btn-wa', href: `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent(`Hi iNRECO, I paid for DomestiCare but my download did not open. Order ${ref}.`)}`, target: '_blank', rel: 'noopener' }, 'WhatsApp us');
    const g = el('div', { class: 'dl-list' }); g.append(again, wa);
    setBox('Payment not confirmed yet', `We have not received PayFast's confirmation for order ${ref} yet. It can take a few minutes. If you paid, don't worry: your order number keeps your payment safe.`, [g]);
  }
  async function unlock(ref) {
    const r = await getJson(`${LOCK.docUrl}?ref=${encodeURIComponent(ref)}`);
    if (!(r.j && r.j.paid === true && r.j.templates && r.j.templates.contract)) return notYet(ref);
    Object.assign(paidState, { paid: true, ref, templates: r.j.templates, items: r.j.items, state: 'paid' });
    const order = store.get(ORDER_KEY);
    if (order && order.ref === ref) { order.paid = { amount: r.j.amount, item: r.j.item, at: Date.now() }; store.set(ORDER_KEY, order); if (order.answers) restore(order.answers); }
    showDownloads(ref, r.j);
  }
  const DOCS = [['contract', 'Download the contract', 'Contract'], ['duties', 'Download the duties checklist', 'Duties_Checklist'], ['code', 'Download the Code of Conduct', 'Code_of_Conduct']];
  function showDownloads(ref, j) {
    const list = el('div', { class: 'dl-list' });
    DOCS.forEach(([k, label]) => {
      if (!j.templates[k]) return;
      const b = el('button', { type: 'button', class: 'btn btn-green', 'data-doc': k, id: 'dl_' + k }, '⬇ ' + label);
      b.addEventListener('click', () => download([k]));
      list.appendChild(b);
    });
    const n = Object.keys(j.templates).length;
    if (n > 1) { const all = el('button', { type: 'button', class: 'btn btn-blue', id: 'dl_all' }, `⬇ Download all ${n}`); all.addEventListener('click', () => download(DOCS.map(d => d[0]).filter(k => j.templates[k]))); list.appendChild(all); }
    const tip = el('p', { class: 'small' }, 'Tip: check the answers below first. If you fix a typo, just download again. Print, sign on the last page, initial every page, and give your worker a copy.');
    setBox('✅ Payment confirmed', `Thank you. PayFast confirmed ${rand(+j.amount)} for order ${ref}. Your documents are ready.`, [list, tip]);
    $('#payBtn').textContent = 'Paid ✓ – use the download buttons at the top';
    $('#payBtn').disabled = true;
    $('#stickyBtn').textContent = 'Download'; $('#stickyBtn').setAttribute('href', '#payReturn');
  }
  async function download(keys) {
    const a = collect();
    const order = store.get(ORDER_KEY);
    // The paid order is for one household and one worker.
    if (order && order.ref === paidState.ref && order.answers) {
      const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (norm(order.answers.workerName) !== norm(a.workerName) || norm(order.answers.employerName) !== norm(a.employerName)) {
        alert('This order is for ' + order.answers.workerName + ' and ' + order.answers.employerName + '. For another worker or household, please start a new order.');
        $('#workerName').value = order.answers.workerName; $('#employerName').value = order.answers.employerName; return;
      }
    }
    const errs = compute(a).errs;
    if (errs.length) return showErrors(errs);
    if (!order || order.ref !== paidState.ref) store.set(ORDER_KEY, { ref: paidState.ref, code: '', answers: a, at: Date.now(), paid: true });
    else { order.answers = a; store.set(ORDER_KEY, order); }
    await window.DCDocs.loadLogo();
    const code = 'c' + (paidState.templates.duties ? 'd' : '') + (paidState.templates.code ? 'k' : '');
    const { vars, flags, duties } = varsFor(a, paidState.ref, code);
    const who = (a.workerName || 'worker').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
    for (const k of keys) {
      const doc = window.DCDocs.build(paidState.templates[k], vars, flags, { ref: paidState.ref, duties });
      doc.save(`DomestiCare_${DOCS.find(d => d[0] === k)[2]}_${who}.pdf`);
      await new Promise(r => setTimeout(r, 400));
    }
  }
  window.DC_TEST = { collect, compute, varsFor, restore, setRole };

  function onHash() {
    const h = location.hash;
    const q = (new URLSearchParams(location.search).get('ref') || '').toUpperCase();
    const order = store.get(ORDER_KEY);
    const ref = REF_RE.test(q) ? q : (order && REF_RE.test(order.ref || '') ? order.ref : '');
    if (h === '#paid') {
      if (paidState.state === 'paid' || paidState.state === 'polling') return;
      if (!ref) return setBox('Payment not confirmed yet', "We could not find your order number on this device. If you paid, WhatsApp us your PayFast receipt and we'll help.", []);
      return startPolling(ref, LOCK.returnMs, false);
    }
    if (h === '#cancelled') {
      if (paidState.state === 'paid') return;
      ++paidState.run; clearTimeout(paidState.timer); paidState.state = 'idle';
      return setBox('Payment cancelled', 'No money was taken. Your answers are still here. You can pay again below, or WhatsApp us for eWallet or CashSend.', [el('a', { class: 'btn btn-wa', href: `https://wa.me/${CONTACT.whatsapp}?text=${encodeURIComponent('Hi iNRECO, I could not pay for DomestiCare on PayFast. Please send me eWallet or CashSend details.')}`, target: '_blank', rel: 'noopener' }, 'WhatsApp us')]);
    }
  }

  /* ---------- start ---------- */
  buildUI();
  $('#refShow').textContent = ORDER_REF;
  $('#yr').textContent = new Date().getFullYear();
  const qRef = (new URLSearchParams(location.search).get('ref') || '').toUpperCase();
  const saved = store.get(ORDER_KEY), draft = store.get(DRAFT_KEY);
  if (saved && saved.answers && (saved.ref === qRef || saved.paid)) restore(saved.answers);
  else if (draft && draft.a) restore(draft.a);
  $('#dcForm').addEventListener('input', update);
  $('#dcForm').addEventListener('change', update);
  $('#payBtn').addEventListener('click', pay);
  window.addEventListener('hashchange', onHash);
  const sticky = $('#sticky');
  const onScroll = () => sticky.classList.toggle('off', window.scrollY < 420);
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  update();
  if (location.hash === '#paid' || location.hash === '#cancelled') onHash();
  else if (saved && saved.paid && REF_RE.test(saved.ref || '')) unlock(saved.ref);   // come back later: downloads again
})();
