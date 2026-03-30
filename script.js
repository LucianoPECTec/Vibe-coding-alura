/* ══════════════════════════════════════════════════════════════════════
   MAPA DE VISITAS PEC - VERSÃO FINAL COM SORT, CARDS E FILTROS
   ══════════════════════════════════════════════════════════════════════ */

let SUPABASE_URL = localStorage.getItem('pec_sb_url') || '';
let SUPABASE_KEY = localStorage.getItem('pec_sb_key') || '';
let sb = null;

const PESOS = { acessos:.25, corretos:.20, media:.25, realizacao:.20, discursivas:.10 };
const COL_KEYS = {
  escola:     ['escola','unidade escolar','nome da escola'],
  turma:      ['série','serie','classe','turma'],
  acessos:    ['índice de a','acessos','% de acessos'],
  corretos:   ['correto','2ª tentativa','alunos cor'],
  media:      ['média das','média de acertos','média geral'],
  realizacao: ['índice de r','realização','% realização'],
  aluno:      ['nome do aluno','aluno','nome'],
  ra:         ['r.a.','ra ','registro do aluno'],
};

const estado = {
  ure:    { dados:[], filtrados:[], filtro:'todos', colOrdem:'score', desc:false, nomeEscola:'' },
  escola: { dados:[], filtrados:[], filtro:'todos', colOrdem:'score', desc:false, nomeEscola:'' },
  turma:  { dados:[], filtrados:[], filtro:'todos', colOrdem:'score', desc:false, nomeEscola:'' },
};

// --- PROCESSAMENTO ---
function processarArquivo(file, nivel) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: 'array' });
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });

      const headIdx = raw.findIndex(r => r.join('').toLowerCase().includes('turma') || r.join('').toLowerCase().includes('escola') || r.join('').toLowerCase().includes('aluno'));
      if (headIdx === -1) return alert('⚠️ Cabeçalho não encontrado.');

      const headers = raw[headIdx];
      const linhasRaw = raw.slice(headIdx + 1).filter(r => {
        const txt = String(r[0] || '').toLowerCase();
        return r[0] && !txt.includes('filtros aplicados') && !txt.includes('nmdiretoria') && !txt.includes('total');
      });

      const cols = {};
      const baseObj = {};
      headers.forEach((h, i) => { if (h) baseObj[h] = linhasRaw[0][i]; });
      for (const k in COL_KEYS) cols[k] = encontrarCol(baseObj, COL_KEYS[k]);

      estado[nivel].dados = linhasRaw.map(r => {
        const obj = {};
        headers.forEach((h, i) => { if (h) obj[h] = r[i]; });
        const s = calcScore(obj, cols);
        return {
          nome: String(obj[cols.escola] || obj[cols.turma] || obj[cols.aluno] || 'Indefinido').trim(),
          score: s,
          acessos: toNum(obj[cols.acessos]),
          media: toNum(obj[cols.media]),
          realizacao: toNum(obj[cols.realizacao]),
          cls: s < 40 ? 'alta' : s < 65 ? 'media' : 'baixa',
          label: s < 40 ? 'ALTA' : s < 65 ? 'MÉDIA' : 'BAIXA'
        };
      });

      renderizarNivel(nivel);
    } catch (err) { alert('❌ Erro no arquivo.'); }
  };
  reader.readAsArrayBuffer(file);
}

// --- INTERFACE (CARDS, FILTROS E CABEÇALHOS) ---
function renderizarNivel(nivel) {
  const st = estado[nivel];
  document.getElementById('results-' + nivel).style.display = 'block';

  const total = st.dados.length;
  const alta  = st.dados.filter(r => r.cls === 'alta').length;
  const media = st.dados.filter(r => r.cls === 'media').length;
  const baixa = st.dados.filter(r => r.cls === 'baixa').length;

  document.getElementById('strip-' + nivel).innerHTML = `
    <div class="score-card ${st.filtro === 'todos' ? 'active-filter' : ''}" onclick="filtrar('${nivel}','todos')">
      <div class="score-val">${total}</div><div class="score-lbl">Total</div></div>
    <div class="score-card ${st.filtro === 'alta' ? 'active-filter' : ''}" style="color:var(--red)" onclick="filtrar('${nivel}','alta')">
      <div class="score-val">${alta}</div><div class="score-lbl">Alta</div></div>
    <div class="score-card ${st.filtro === 'media' ? 'active-filter' : ''}" style="color:var(--amber)" onclick="filtrar('${nivel}','media')">
      <div class="score-val">${media}</div><div class="score-lbl">Média</div></div>
    <div class="score-card ${st.filtro === 'baixa' ? 'active-filter' : ''}" style="color:var(--emerald)" onclick="filtrar('${nivel}','baixa')">
      <div class="score-val">${baixa}</div><div class="score-lbl">Baixa</div></div>
  `;

  aplicarFiltroOrdem(nivel);
}

function ordenarPor(nivel, col) {
  const st = estado[nivel];
  if (st.colOrdem === col) st.desc = !st.desc;
  else { st.colOrdem = col; st.desc = false; }
  aplicarFiltroOrdem(nivel);
}

function filtrar(nivel, cls) {
  estado[nivel].filtro = (estado[nivel].filtro === cls && cls !== 'todos') ? 'todos' : cls;
  renderizarNivel(nivel);
}

function aplicarFiltroOrdem(nivel) {
  const st = estado[nivel];
  st.filtrados = st.filtro === 'todos' ? [...st.dados] : st.dados.filter(r => r.cls === st.filtro);

  st.filtrados.sort((a, b) => {
    let va = a[st.colOrdem], vb = b[st.colOrdem];
    return st.desc ? (vb > va ? 1 : -1) : (va > vb ? 1 : -1);
  });

  renderizarCabecalho(nivel);
  renderizarLinhas(nivel);
}

function renderizarCabecalho(nivel) {
  const st = estado[nivel];
  const labels = { 
      rank: '#', 
      nome: nivel === 'ure' ? 'Escola' : nivel === 'escola' ? 'Turma' : 'Aluno',
      cls: 'Prioridade', score: 'Score', acessos: 'Acessos', media: 'Média', realizacao: 'Realiz.'
  };

  document.getElementById('head-' + nivel).innerHTML = Object.entries(labels).map(([key, label]) => `
    <th class="${st.colOrdem === key ? (st.desc ? 'sorted desc' : 'sorted') : ''}" onclick="ordenarPor('${nivel}','${key}')">
      ${label}
    </th>
  `).join('');
}

function renderizarLinhas(nivel) {
  const st = estado[nivel];
  document.getElementById('body-' + nivel).innerHTML = st.filtrados.map((r, i) => `
    <tr>
      <td><span class="row-rank">${i + 1}</span></td>
      <td><div class="row-main">${r.nome}</div></td>
      <td><span class="pri-tag ${r.cls}">${r.label}</span></td>
      <td>
        <div class="gauge-wrap">
          <div class="gauge-track"><div class="gauge-fill" style="width:${r.score}%; background:${r.score < 40 ? '#c0392b' : r.score < 65 ? '#b7580a' : '#1a7a4a'}"></div></div>
          <span class="gauge-num">${r.score.toFixed(1)}</span>
        </div>
      </td>
      <td>${r.acessos.toFixed(1)}%</td>
      <td>${r.media.toFixed(1)}</td>
      <td>${r.realizacao.toFixed(1)}%</td>
    </tr>
  `).join('');
}

// --- UTILITÁRIOS ---
function toNum(v){ if(v==null||v==='') return 0; const s = String(v).replace(/[%\s]/g,'').trim(); let n = s.includes(',') ? parseFloat(s.replace(/\./g,'').replace(',','.')) : parseFloat(s); return isNaN(n) ? 0 : (n > 0 && n < 1 ? n * 100 : n); }
function encontrarCol(obj, kws){ const keys = Object.keys(obj); for(const kw of kws){ const f = keys.find(k => k.toLowerCase().includes(kw.toLowerCase())); if(f) return f; } return null; }
function calcScore(linha, cols){ let soma=0, tp=0; for(const [c,p] of Object.entries(PESOS)){ if(!cols[c]) continue; let v = toNum(linha[cols[c]]); if(c==='media') v = (v/10)*100; soma += Math.min(v,100)*p; tp += p; } return tp>0 ? soma/tp : 0; }
function inicializarSupabase() { if (SUPABASE_URL && SUPABASE_KEY) { try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); atualizarIndicador('ok'); } catch (e) { atualizarIndicador('err'); } } }
function atualizarIndicador(estado) { const dot = document.getElementById('sb-dot'); if (dot) { dot.className = 'sb-dot ' + (estado === 'ok' ? 'ok' : 'err'); document.getElementById('sb-lbl').textContent = estado === 'ok' ? 'Online' : 'Erro'; } }
function abrirModalSupabase() { document.getElementById('modal-sb').classList.add('open'); }
function fecharModal() { document.getElementById('modal-sb').classList.remove('open'); }
function salvarConfig() { SUPABASE_URL = document.getElementById('inp-url').value; SUPABASE_KEY = document.getElementById('inp-key').value; localStorage.setItem('pec_sb_url', SUPABASE_URL); localStorage.setItem('pec_sb_key', SUPABASE_KEY); inicializarSupabase(); fecharModal(); }

window.onload = () => { inicializarSupabase(); ['ure', 'escola', 'turma'].forEach(n => { const inp = document.getElementById('input-' + n); if (inp) inp.addEventListener('change', e => processarArquivo(e.target.files[0], n)); }); };
