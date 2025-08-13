// FitPals app.js — Firebase + UI logic
// Uses Firestore for realtime storage; anonymous auth by default
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, onSnapshot, query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.11.1/firebase-firestore.js";

// ---------- Helpers ----------
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const todayISO = () => new Date().toISOString().slice(0,10);
const uid8 = () => Math.random().toString(36).slice(2,10);

async function sha256(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function switchTab(name){
  $$('.tabs .tab').forEach(b=>b.setAttribute('aria-current', b.dataset.tab===name? 'page':'false'));
  $$('main > section').forEach(s=>s.classList.toggle('hidden', s.id!=='tab-'+name));
}

function toast(msg){ console.log('[FitPals]', msg); }

// ---------- Firebase ----------
const { app, auth, db, onAuthStateChanged, signInAnonymously, signOut, updateProfile } = window.fp;

// ---------- State ----------
let state = {
  user: null,        // Firebase user
  displayName: '',   // chosen display name
  group: null,       // { id, name, passwordHash }
  members: [],       // [{uid, name}]
  caches: {}         // { daily: Map, weekly: ... }
};

function setBadge(){
  const badge = $('#userBadge');
  if(!state.user){ badge.textContent = 'Not signed in'; return; }
  badge.textContent = `${state.displayName||'Anonymous'} — ${state.group? 'Group: '+state.group.id : 'No group'}`;
}

onAuthStateChanged(auth, async (user)=>{
  state.user = user || null;
  if(user && !user.displayName){
    await updateProfile(user, { displayName: 'Anon-'+uid8() }).catch(()=>{});
  }
  setBadge();
});

// ---------- Auth UI ----------
$('#btnAnon').addEventListener('click', async ()=>{
  await signInAnonymously(auth);
  state.displayName = ($('#name').value.trim() || 'Friend');
  setBadge();
});
$('#btnSignOut').addEventListener('click', async ()=>{
  await signOut(auth);
  state = { user:null, displayName:'', group:null, members:[], caches:{} };
  setBadge();
  switchTab('auth');
});

// ---------- Groups ----------
const groupsCol = () => collection(db, 'groups');
const groupDoc = (id) => doc(db, 'groups', id);
const membersCol = (gid) => collection(db, 'groups', gid, 'members');
const chatCol = (gid) => collection(db, 'groups', gid, 'chat');
const logsCol = (gid) => collection(db, 'groups', gid, 'logs'); // docId: uid_day (e.g., abc_2025-08-13)

async function listGroups(){
  const snap = await getDocs(query(groupsCol()));
  const sel = $('#groupList');
  sel.innerHTML = '';
  const opt = document.createElement('option');
  opt.value=''; opt.textContent='— Select existing group —';
  sel.appendChild(opt);
  snap.forEach(doc=>{
    const o=document.createElement('option');
    o.value=doc.id; o.textContent=doc.id;
    sel.appendChild(o);
  });
}
$('#refreshGroups').addEventListener('click', listGroups);
listGroups().catch(console.error);

$('#groupList').addEventListener('change', (e)=>{
  $('#groupCode').value = e.target.value;
});

$('#btnJoin').addEventListener('click', async ()=>{
  if(!auth.currentUser){ await signInAnonymously(auth); }
  const name = ($('#name').value.trim() || 'Friend');
  state.displayName = name;
  const code = ($('#groupCode').value.trim() || $('#groupList').value || '').toLowerCase();
  const pass = $('#groupPass').value;
  if(!code || !pass){ alert('Enter a group code and password.'); return; }
  const hash = await sha256(pass);

  const gRef = groupDoc(code);
  const gSnap = await getDoc(gRef);
  if(!gSnap.exists()){
    // create new group
    await setDoc(gRef, { id: code, passwordHash: hash, createdAt: Date.now() });
  }else{
    const data = gSnap.data();
    if(data.passwordHash !== hash){
      alert('Wrong group password.');
      return;
    }
  }
  // Join members subcollection
  await setDoc(doc(membersCol(code), auth.currentUser.uid), { uid: auth.currentUser.uid, name, joinedAt: Date.now() }, { merge:true });
  state.group = { id: code };
  setBadge();
  subscribeMembers();
  subscribeChat();
  switchTab('log');
});

async function subscribeMembers(){
  if(!state.group) return;
  const snap = await getDocs(membersCol(state.group.id));
  state.members = snap.docs.map(d=>d.data()).sort((a,b)=> (a.name||'').localeCompare(b.name||''));
  // Fill multi-select for graphs
  const multi = $('#memberMulti');
  multi.innerHTML='';
  state.members.forEach(m=>{
    const o=document.createElement('option');
    o.value=m.uid; o.textContent=m.name || m.uid.slice(0,6);
    multi.appendChild(o);
  });
}

// ---------- Daily Log ----------
function dayKey(uid, day){ return `${uid}_${day}`; }

$('#dayDate').value = todayISO();
$('#mealTime').value = new Date().toTimeString().slice(0,5);
$('#exTime').value = new Date().toTimeString().slice(0,5);

$('#addMeal').addEventListener('click', async ()=>{
  if(!state.group || !auth.currentUser) return alert('Join a group first.');
  const d = $('#dayDate').value || todayISO();
  const payload = {
    meals: [{
      id: uid8(),
      type: $('#mealType').value,
      time: $('#mealTime').value,
      notes: $('#mealNotes').value.trim(),
      calories: +($('#calories').value||0),
      protein: +($('#protein').value||0),
      carbs: +($('#carbs').value||0),
      fat: +($('#fat').value||0)
    }]
  };
  await upsertLog(d, payload, 'meals');
  clearMealInputs();
  await renderDay(d);
});

function clearMealInputs(){
  ['mealNotes','calories','protein','carbs','fat'].forEach(id=> $('#'+id).value='');
}

$('#addEx').addEventListener('click', async ()=>{
  if(!state.group || !auth.currentUser) return alert('Join a group first.');
  const d = $('#dayDate').value || todayISO();
  const payload = {
    exercises: [{
      id: uid8(),
      type: $('#exType').value,
      time: $('#exTime').value,
      duration: +($('#exDuration').value||0),
      calories: +($('#exCals').value||0),
      distance: +($('#exDist').value||0),
      steps: +($('#exSteps').value||0),
      hr: +($('#exHr').value||0)
    }]
  };
  await upsertLog(d, payload, 'exercises');
  ['exDuration','exCals','exDist','exSteps','exHr'].forEach(id=> $('#'+id).value='');
  await renderDay(d);
});

$('#water').addEventListener('change', saveExtras);
$('#steps').addEventListener('change', saveExtras);
async function saveExtras(){
  if(!state.group || !auth.currentUser) return;
  const d = $('#dayDate').value || todayISO();
  const payload = { extras: [{ water:+($('#water').value||0), steps:+($('#steps').value||0) }] };
  await upsertLog(d, payload, 'extras');
  await renderDay(d);
}

async function upsertLog(day, patch, key){
  const ref = doc(logsCol(state.group.id), dayKey(auth.currentUser.uid, day));
  const snap = await getDoc(ref);
  const base = snap.exists()? snap.data() : { uid: auth.currentUser.uid, day, meals:[], exercises:[], extras:[], ts: Date.now() };
  base[key] = [...(base[key]||[]), ...patch[key]];
  base.ts = Date.now();
  await setDoc(ref, base);
}

async function renderDay(day){
  // Aggregate today's lists for current user
  const ref = doc(logsCol(state.group.id), dayKey(auth.currentUser.uid, day));
  const snap = await getDoc(ref);
  const data = snap.exists()? snap.data() : { meals:[], exercises:[], extras:[] };

  // Meals UI
  const mList = $('#mealsList'); mList.innerHTML='';
  (data.meals||[]).slice().reverse().forEach(m=>{
    const el = document.createElement('div'); el.className='item';
    el.innerHTML = `<div><strong>${m.type}</strong> <span class="muted">${m.time||''}</span><div class="muted">${m.notes||''}</div></div>
      <div class="kpi">${m.calories||0} kcal • ${m.protein||0}g P • ${m.carbs||0}g C • ${m.fat||0}g F</div>`;
    mList.appendChild(el);
  });

  // Exercise UI
  const eList = $('#exList'); eList.innerHTML='';
  (data.exercises||[]).slice().reverse().forEach(x=>{
    const el=document.createElement('div'); el.className='item';
    el.innerHTML = `<div><strong>${x.type}</strong> <span class="muted">${x.time||''}</span></div>
      <div class="kpi">${x.duration||0} min • ${x.calories||0} kcal ${x.distance? '• '+x.distance+' km':''} ${x.steps? '• '+x.steps+' steps':''}</div>`;
    eList.appendChild(el);
  });

  // KPIs
  const intake = (data.meals||[]).reduce((a,b)=>a+(+b.calories||0),0);
  const protein = (data.meals||[]).reduce((a,b)=>a+(+b.protein||0),0);
  const exmin = (data.exercises||[]).reduce((a,b)=>a+(+b.duration||0),0);
  const excals = (data.exercises||[]).reduce((a,b)=>a+(+b.calories||0),0);
  const water = (data.extras||[]).reduce((a,b)=>a+(+b.water||0),0);
  const steps = (data.extras||[]).reduce((a,b)=>a+(+b.steps||0),0);

  const kpi = $('#kpi'); kpi.innerHTML='';
  const make=(label,val,suf='')=>`<div class="item"><div class="muted">${label}</div><div class="kpi" style="font-weight:700">${val}${suf}</div></div>`;
  kpi.innerHTML = make('Intake', intake,' kcal') + make('Protein', protein,' g') + make('Exercise', exmin,' min') + make('Burned', excals,' kcal') + make('Water', water,' ml') + make('Steps', steps,'');
}
$('#dayDate').addEventListener('change', ()=>renderDay($('#dayDate').value));

// ---------- Weekly Summary (Excel-style) ----------
function startOfWeek(d){ const dt = new Date(d); const day = dt.getDay(); const diff = dt.getDate() - day + (day===0?-6:1); const monday = new Date(dt.setDate(diff)); return monday.toISOString().slice(0,10); }

async function buildWeekTable(){
  if(!state.group) return;
  const now = $('#dayDate').value || todayISO();
  const weekStart = startOfWeek(now);
  // fetch all logs for group in this week
  const snap = await getDocs(logsCol(state.group.id));
  const rows = {};
  snap.forEach(doc=>{
    const data = doc.data();
    // filter by week
    if(data.day < weekStart) return;
    const person = data.uid;
    if(!rows[person]) rows[person] = { meals:0, intake:0, protein:0, exmin:0, excals:0, water:0, steps:0 };
    (data.meals||[]).forEach(m=>{ rows[person].meals++; rows[person].intake += (+m.calories||0); rows[person].protein += (+m.protein||0); });
    (data.exercises||[]).forEach(x=>{ rows[person].exmin += (+x.duration||0); rows[person].excals += (+x.calories||0); });
    (data.extras||[]).forEach(e=>{ rows[person].water += (+e.water||0); rows[person].steps += (+e.steps||0); });
  });
  // render table
  const mapName = Object.fromEntries(state.members.map(m=>[m.uid, m.name||m.uid.slice(0,6)]));
  const root = $('#weekTable');
  let html = '<div class="table"><table><thead><tr><th>Item</th>';
  Object.keys(rows).forEach(uid=> html += `<th>${mapName[uid]||uid.slice(0,6)}</th>`);
  html += '</tr></thead><tbody>';
  const addRow = (label, key, fmt=(v)=>v) => {
    html += `<tr><td>${label}</td>`;
    Object.values(rows).forEach(r=> html += `<td>${fmt(r[key]||0)}</td>`);
    html += '</tr>';
  };
  addRow('Total Calories (intake)', 'intake');
  addRow('Total Protein (g)', 'protein');
  addRow('Exercise Minutes', 'exmin');
  addRow('Exercise Calories', 'excals');
  addRow('Water (ml)', 'water');
  addRow('Steps', 'steps');
  html += '</tbody></table></div>';
  root.innerHTML = html;
}
$('#exportCSV').addEventListener('click', ()=>{
  const table = $('#weekTable').innerText || '';
  const blob = new Blob([table], {type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`fitpals_week_${todayISO()}.csv`; a.click(); URL.revokeObjectURL(a.href);
});

// ---------- Charts ----------
let chart = null;
function destroyChart(){ if(chart){ chart.destroy(); chart=null; }}

$('#drawChart').addEventListener('click', drawChart);
async function drawChart(){
  if(!state.group) return;
  const metric = $('#metricSelect').value;
  const selected = Array.from($('#memberMulti').selectedOptions).map(o=>o.value);
  const members = selected.length? state.members.filter(m=>selected.includes(m.uid)) : state.members.slice(0,5);

  // Fetch all logs (simple approach for prototype)
  const snap = await getDocs(logsCol(state.group.id));
  const logs = snap.docs.map(d=>d.data());

  // Build datasets per member per day
  const days = Array.from(new Set(logs.map(l=>l.day))).sort();
  function agg(day, uid){
    const l = logs.filter(x=> x.day===day && x.uid===uid);
    let intake=0, protein=0, exMinutes=0, exCalories=0, water=0, steps=0, weight=0;
    l.forEach(r=>{
      (r.meals||[]).forEach(m=>{ intake+=(+m.calories||0); protein+=(+m.protein||0); });
      (r.exercises||[]).forEach(x=>{ exMinutes+=(+x.duration||0); exCalories+=(+x.calories||0); });
      (r.extras||[]).forEach(e=>{ water+=(+e.water||0); steps+=(+e.steps||0); if(e.weight) weight=e.weight; });
    });
    return {calories:intake, protein, exMinutes, exCalories, water, steps, weight};
  }

  const datasets = members.map(m=>{
    const data = days.map(d=> agg(d, m.uid)[metric] || 0);
    return { label: m.name || m.uid.slice(0,6), data };
  });

  destroyChart();
  const ctx = $('#chart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: { labels: days, datasets },
    options: {
      responsive: true,
      interaction: { mode: 'nearest', intersect: false },
      plugins: { legend: { position: 'bottom' } },
      scales: { x: { ticks: { maxRotation: 0 } }, y: { beginAtZero: true } }
    }
  });
}

// ---------- Leaderboard ----------
function dateInRange(dateISO, days){ if(days==='all') return true; const d=new Date(dateISO), now=new Date(); const diff=(now-d)/(1000*60*60*24); return diff>=0 && diff<=+days; }
function calcDayPoints(log){
  const meals = log.meals||[], exercises = log.exercises||[], extras = log.extras||[];
  const steps = extras.reduce((a,b)=>a+(+b.steps||0),0);
  const water = extras.reduce((a,b)=>a+(+b.water||0),0);
  const protein = meals.reduce((a,b)=>a+(+b.protein||0),0);
  const exmin = exercises.reduce((a,b)=>a+(+b.duration||0),0);
  const intake = meals.reduce((a,b)=>a+(+b.calories||0),0);
  const burned = exercises.reduce((a,b)=>a+(+b.calories||0),0);
  let pts = meals.length + exercises.length + Math.floor(steps/500) + Math.floor(water/500);
  if(protein >= 100) pts += 2;
  if(exmin >= 30) pts += 2;
  if(meals.length>0 || exercises.length>0 || steps>0 || water>0) pts += 5;
  return { pts, exmin, protein, caloriesNet:intake-burned };
}

$('#recalc').addEventListener('click', recalcBoard);
async function recalcBoard(){
  if(!state.group) return;
  const range = $('#range').value; const sortBy = $('#sortBy').value;
  const snap = await getDocs(logsCol(state.group.id));
  const logs = snap.docs.map(d=>d.data());
  const rows = {};
  logs.forEach(l=>{
    if(!dateInRange(l.day, range)) return;
    if(!rows[l.uid]) rows[l.uid] = { points:0, exMins:0, protein:0, caloriesNet:0, days:new Set() };
    const r = calcDayPoints(l);
    rows[l.uid].points += r.pts;
    rows[l.uid].exMins += r.exmin;
    rows[l.uid].protein += r.protein;
    rows[l.uid].caloriesNet += r.caloriesNet;
    rows[l.uid].days.add(l.day);
  });
  const membersById = Object.fromEntries(state.members.map(m=>[m.uid, m]));
  const data = Object.entries(rows).map(([uid,v])=>{
    return { uid, name: (membersById[uid]?.name)||uid.slice(0,6), ...v, streak: 0, days: v.days.size };
  });
  data.sort((a,b)=> (b[sortBy]??0) - (a[sortBy]??0));
  const root = $('#board'); root.innerHTML='';
  data.forEach((r,i)=>{
    const el = document.createElement('div'); el.className='item';
    el.innerHTML = `<div><span>#${i+1}</span> <strong>${r.name}</strong></div>
      <div class="kpi">${r.points} pts • ${r.exMins} min • ${r.protein} g P • ${r.caloriesNet} net</div>`;
    root.appendChild(el);
  });
}

// ---------- Chat ----------
let chatUnsub = null;
async function subscribeChat(){
  if(chatUnsub) chatUnsub();
  if(!state.group) return;
  const q = query(chatCol(state.group.id), orderBy('ts','asc'));
  chatUnsub = onSnapshot(q, (snap)=>{
    const root = $('#chat'); root.innerHTML='';
    snap.forEach(doc=>{
      const m = doc.data();
      const mine = m.uid === (state.user?.uid);
      const el = document.createElement('div'); el.className = 'msg ' + (mine? 'me':'them');
      el.innerHTML = `<div style="font-size:12px"><strong>${m.name||'Anon'}</strong></div><div>${m.text}</div><div class="muted" style="font-size:11px">${new Date(m.ts).toLocaleString()}</div>`;
      root.appendChild(el);
    });
    root.scrollTop = root.scrollHeight;
  });
}
$('#sendChat').addEventListener('click', async ()=>{
  if(!state.group || !auth.currentUser) return alert('Join a group first.');
  const text = $('#chatText').value.trim(); if(!text) return;
  await addDoc(chatCol(state.group.id), { text, uid: auth.currentUser.uid, name: state.displayName||'Anon', ts: Date.now() });
  $('#chatText').value='';
});
$('#clearChat').addEventListener('click', async ()=>{
  alert('For safety, chat cannot be bulk-deleted by clients in this prototype. Use Firestore console if needed.');
});

// ---------- Settings & Export ----------
$('#exportJSON').addEventListener('click', async ()=>{
  // Export all logs for current group
  if(!state.group) return;
  const snap = await getDocs(logsCol(state.group.id));
  const out = snap.docs.map(d=>d.data());
  const blob = new Blob([JSON.stringify(out,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`fitpals_${state.group.id}.json`; a.click(); URL.revokeObjectURL(a.href);
});
$('#importJSON').addEventListener('click', ()=> $('#importFile').click());
$('#importFile').addEventListener('change', async (e)=>{
  const file = e.target.files[0]; if(!file) return;
  const text = await file.text();
  try{
    const items = JSON.parse(text);
    if(!Array.isArray(items)) throw new Error('Invalid format');
    for(const it of items){
      if(!it.uid || !it.day) continue;
      await setDoc(doc(logsCol(state.group.id), dayKey(it.uid, it.day)), it, { merge:true });
    }
    alert('Imported!');
  }catch(err){
    alert('Import failed: ' + err.message);
  }
});
$('#resetLocal').addEventListener('click', ()=>{
  localStorage.clear();
  alert('Local cache cleared.');
});

// ---------- Tabs ----------
$$('.tabs .tab').forEach(btn=> btn.addEventListener('click', ()=> switchTab(btn.dataset.tab)));
// default tab
switchTab('auth');

// After join, render screens
window.addEventListener('load', ()=>{
  // noop; live as user interacts
});

// When switching into certain tabs, refresh data
['summary','graphs','leaderboard','chat','log'].forEach(tab=>{
  document.querySelector(`[data-tab="${tab}"]`).addEventListener('click', async ()=>{
    if(tab==='summary') await buildWeekTable();
    if(tab==='graphs') await subscribeMembers();
    if(tab==='leaderboard') await recalcBoard();
    if(tab==='log') await renderDay($('#dayDate').value||todayISO());
    if(tab==='chat') await subscribeChat();
  });
});
