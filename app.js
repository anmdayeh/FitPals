// app.js for FitTogether GitHub Pages package (Utterances integration + local chat + entries)
(function(){
  const STORAGE = 'fit_pages_v2';
  let state = JSON.parse(localStorage.getItem(STORAGE) || '{}');
  state.profile = state.profile || {};
  state.entries = state.entries || [];
  state.groups = state.groups || {};
  state.currentGroup = state.currentGroup || null;
  // DOM refs
  const $ = id => document.getElementById(id);
  const displayName = $('displayName'), saveProfile = $('saveProfile'), clearProfile = $('clearProfile'), profileMsg = $('profileMsg');
  const groupName = $('groupName'), joinGroup = $('joinGroup'), leaveGroup = $('leaveGroup'), groupMsgEl = $('groupMsg');
  const ghRepo = $('ghRepo'), enableGh = $('enableGh'), disableGh = $('disableGh'), ghStatus = $('ghStatus'), githubComments = $('githubComments');
  const widgetsArea = $('widgetsArea'), avgBmrEl = $('avgBmr'), recommIntakeEl = $('recommIntake'), weeklyLossEl = $('weeklyLoss');
  const entryDate = $('entryDate'), meal1 = $('meal1'), meal2 = $('meal2'), snacks = $('snacks'), protein = $('protein'), cardioCals = $('cardioCals'), dailyWeight = $('dailyWeight'), bpSys = $('bpSys'), bpDia = $('bpDia'), water = $('water'), note = $('note');
  const saveEntry = $('saveEntry'), exportCSV = $('exportCSV'), recentList = $('recentList');
  const chatBox = $('chatBox'), chatTxt = $('chatTxt'), sendChat = $('sendChat');
  const aggFrom = $('aggFrom'), aggTo = $('aggTo'), applyRange = $('applyRange'), aggResults = $('aggResults');
  const weightCtx = document.getElementById('weightChart').getContext('2d');
  let chart = null;

  // calculation helpers
  function mifflinBMR(weight,height,age,gender){ const s = gender==='male'?5:-161; return Math.round(10*weight + 6.25*height - 5*age + s); }
  function totalCaloriesIn(e){ return (e.meal1||0)+(e.meal2||0)+(e.snacks||0); }
  function totalExercise(e){ return (e.cardioCals||0); }
  function save(){ localStorage.setItem(STORAGE, JSON.stringify(state)); }
  function loadProfileToUI(){ displayName.value = state.profile.name || ''; }
  function todayISO(){ return new Date().toISOString().slice(0,10); }

  // Utterances integration (embed)
  function initUtterances(repo){
    githubComments.innerHTML = '';
    if(!repo){ ghStatus.textContent = 'No repo configured'; return; }
    const s = document.createElement('script');
    s.src = 'https://utteranc.es/client.js';
    s.async = true;
    s.setAttribute('repo', repo);
    s.setAttribute('issue-term', 'title');
    s.setAttribute('label','chat');
    s.setAttribute('theme','github-light');
    s.setAttribute('crossorigin','anonymous');
    githubComments.appendChild(s);
    ghStatus.textContent = 'Utterances loaded for ' + repo + ' — first comment will create an issue.';
  }

  // profile handlers
  saveProfile.addEventListener('click', ()=>{
    state.profile.name = displayName.value.trim() || 'Guest';
    save();
    profileMsg.textContent = 'Saved as ' + state.profile.name;
    setTimeout(()=> profileMsg.textContent = '', 2500);
  });
  clearProfile.addEventListener('click', ()=>{ state.profile = {}; save(); loadProfileToUI(); profileMsg.textContent='Cleared'; setTimeout(()=>profileMsg.textContent='',1500); });

  // group handlers
  joinGroup.addEventListener('click', ()=>{
    const g = groupName.value.trim(); if(!g) return alert('Enter group name');
    state.groups[g] = state.groups[g] || { messages: [] };
    state.currentGroup = g;
    save();
    document.title = 'FitTogether — ' + g;
    groupMsgEl.textContent = 'Joined ' + g;
    // auto load Utterances if enabled
    const repo = state.gh_repo || ghRepo.value.trim();
    if(state.gh_enabled && repo) initUtterances(repo);
    renderChat();
  });
  leaveGroup.addEventListener('click', ()=>{ state.currentGroup = null; save(); groupMsgEl.textContent='Left group'; renderChat(); document.title='FitTogether'; });

  enableGh.addEventListener('click', ()=>{ const repo = ghRepo.value.trim(); if(!repo) return alert('Enter repo'); state.gh_repo = repo; state.gh_enabled = true; save(); initUtterances(repo); });
  disableGh.addEventListener('click', ()=>{ state.gh_enabled = false; state.gh_repo = ''; save(); githubComments.innerHTML=''; ghStatus.textContent='Disabled'; });

  // entries handling
  entryDate.value = todayISO();
  saveEntry.addEventListener('click', ()=>{
    const e = {
      date: entryDate.value,
      meal1: Number(meal1.value)||0, meal2: Number(meal2.value)||0, snacks: Number(snacks.value)||0,
      protein: Number(protein.value)||0, cardioCals: Number(cardioCals.value)||0, weight: dailyWeight.value?Number(dailyWeight.value):null,
      bp_sys: Number(bpSys.value)||null, bp_dia: Number(bpDia.value)||null, water: Number(water.value)||0, note: note.value||''
    };
    const idx = state.entries.findIndex(x=>x.date===e.date);
    if(idx>=0) state.entries[idx] = e; else state.entries.push(e);
    state.entries.sort((a,b)=>a.date.localeCompare(b.date));
    save(); renderAll(); alert('Entry saved');
  });

  exportCSV.addEventListener('click', ()=>{
    const rows = state.entries.map(e=>[e.date,e.meal1,e.meal2,e.snacks,e.protein,e.cardioCals,e.weight,e.bp_sys,e.bp_dia,e.water,JSON.stringify(e.note||'')].map(v=>`"${v||''}"`).join(','));
    const csv = 'date,meal1,meal2,snacks,protein,cardioCals,weight,bp_sys,bp_dia,water,note\n' + rows.join('\n');
    const blob = new Blob([csv],{type:'text/csv'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='fit_entries.csv'; a.click(); URL.revokeObjectURL(url);
  });

  // recent list
  function renderRecent(){
    recentList.innerHTML = '';
    state.entries.slice().reverse().slice(0,40).forEach(e=>{
      const div = document.createElement('div'); div.className='recent-item';
      div.innerHTML = `<strong>${e.date}</strong> — ${totalCaloriesIn(e)} kcal • ${e.protein||0} g protein ${e.weight? ' • ' + e.weight + ' kg':''}`;
      recentList.appendChild(div);
    });
  }

  // chart
  function renderChart(entries){
    const data = entries || state.entries;
    const labels = data.map(d=>d.date);
    const values = data.map(d=> d.weight ? Number(d.weight) : null);
    if(chart) chart.destroy();
    chart = new Chart(weightCtx, { type:'line', data:{ labels, datasets:[{ label:'Weight (kg)', data: values, fill:false, tension:0.2 }] }, options:{ responsive:true, plugins:{legend:{display:false}} } });
  }

  // widgets (simple)
  function renderWidgets(){
    widgetsArea.innerHTML = '';
    const widgets = state.profile.widgets || ['Start weight','Current weight','Total calories'];
    widgets.forEach(w=>{
      const el = document.createElement('div'); el.className='widget';
      el.innerHTML = '<strong>'+w+'</strong><div class="muted small" id="w-'+w.replace(/\s+/g,'_')+'">…</div>';
      widgetsArea.appendChild(el);
    });
    // populate values
    const start = state.entries[0]?.weight || state.profile.startWeight || '—';
    const current = state.entries.slice(-1)[0]?.weight || state.profile.weight || '—';
    document.getElementById('w-Start_weight') && (document.getElementById('w-Start_weight').textContent = start + ' kg');
    document.getElementById('w-Current_weight') && (document.getElementById('w-Current_weight').textContent = current + ' kg');
    document.getElementById('w-Total_calories') && (document.getElementById('w-Total_calories').textContent = state.entries.reduce((s,e)=>s+totalCaloriesIn(e),0) + ' kcal');
  }

  // aggregations
  applyRange.addEventListener('click', ()=>{
    const from = aggFrom.value || null, to = aggTo.value || null;
    const filtered = state.entries.filter(e=> {
      if(from && e.date < from) return false;
      if(to && e.date > to) return false;
      return true;
    });
    const totals = { calories:0, protein:0, exercise:0, water:0, count: filtered.length };
    filtered.forEach(e=>{ totals.calories += totalCaloriesIn(e); totals.protein += e.protein||0; totals.exercise += e.cardioCals||0; totals.water += e.water||0; });
    aggResults.innerHTML = `Entries: ${totals.count} — Total cals: ${Math.round(totals.calories)} kcal • Protein: ${Math.round(totals.protein)} g • Exercise cals: ${Math.round(totals.exercise)} kcal • Water: ${Math.round(totals.water)} cups`;
    renderChart(filtered);
  });

  // chat (local + Utterances embeddable)
  function renderChat(){
    chatBox.innerHTML = '';
    const g = state.currentGroup || Object.keys(state.groups)[0];
    if(!g) return;
    const msgs = (state.groups[g] && state.groups[g].messages) || [];
    msgs.slice(-200).forEach(m=>{
      const el = document.createElement('div');
      el.innerHTML = `<strong>${escapeHtml(m.user)}</strong> <span class="muted small">${new Date(m.ts).toLocaleString()}</span><div>${escapeHtml(m.text)}</div>`;
      chatBox.appendChild(el);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
  }
  function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  sendChat.addEventListener('click', ()=>{
    const g = state.currentGroup || groupName.value.trim(); if(!g) return alert('Join a group first');
    const user = state.profile.name || 'Guest'; const txt = chatTxt.value.trim(); if(!txt) return;
    state.groups[g] = state.groups[g] || { messages: [] };
    state.groups[g].messages.push({ user, text: txt, ts: Date.now() });
    save(); renderChat();
    chatTxt.value = '';
    // Note: persistent cross-device chat requires Utterances (use embedded widget)
  });

  // render all
  function renderAll(){
    loadProfileToUI();
    renderRecent();
    renderChart();
    renderWidgets();
    renderChat();
    // show bmr demo if profile has weight/height/age
    if(state.profile.weight && state.profile.height && state.profile.age){
      const bmr = mifflinBMR(state.profile.weight, state.profile.height, state.profile.age, state.profile.gender||'male');
      avgBmrEl.textContent = bmr + ' kcal';
    }
  }

  // startup
  if(!state.profile.name){ state.profile.name = 'Guest'; }
  if(!state.entries.length){ // create small demo entries
    const now = new Date(); for(let i=10;i>=0;i--){ const d=new Date(now); d.setDate(now.getDate()-i); state.entries.push({ date: d.toISOString().slice(0,10), meal1:400, meal2:500, snacks:150, protein:80, cardioCals:200, weight: 80 - (i*0.1), bp_sys:120, bp_dia:78, water:8, note: '' }); }
    save();
  }
  // auto load utterances if previously enabled
  if(state.gh_enabled && state.gh_repo) initUtterances(state.gh_repo);

  // initial UI wiring
  loadProfileToUI();
  renderAll();

  // expose for debugging
  window.__FIT_STATE = state;

})();