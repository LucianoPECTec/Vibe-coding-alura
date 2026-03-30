/* ══════════════════════════════════════════════════════════════════════
   MAPA DE VISITAS PEC - VERSÃO FINAL CONSOLIDADA (DASHBOARD + HISTÓRICO)
   ══════════════════════════════════════════════════════════════════════ */

let SUPABASE_URL = localStorage.getItem('pec_sb_url') || '';
let SUPABASE_KEY = localStorage.getItem('pec_sb_key') || '';
let sb = null;
let charts = {};

const PESOS = { acessos:.25, corretos:.20, media:.25, realizacao:.20, discursivas:.10 };
const COL_KEYS = {
  escola:     ['escola','unidade escolar','nome da escola'],
  turma:      ['série','serie','classe','turma'],
  acessos:    ['índice de a','acessos','% de acessos'],
  corretos:   ['correto','2ª tentativa','alunos cor'],
  media:      ['média das','média de acertos','média geral'],
  realizacao: ['índice de r','realização','% realização'],
  aluno:      ['nome do aluno','aluno','nome'],
};

const estado = {
  ure:    { dados:[], filtrados:[], filtro:'todos', colOrdem:'score', desc:true, nomeEscola:'URE Rio Preto' },
  escola: { dados:[], filtrados:[], filtro:'todos', colOrdem:'score', desc:true, nomeEscola:'' },
  turma:  { dados:[], filtrados:[], filtro:'todos', colOrdem:'score', desc:true, nomeEscola:'' },
};

// --- 1. NAVEGAÇÃO (FIX) ---
function mudarAba(aba) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  
  const painel = document.getElementById('panel-' + aba);
  const botao = document.getElementById('tab-' + aba);
  
  if (painel && botao) {
    painel.classList.add('active');
    botao.classList.add('active');
  }

  if (aba === 'comparativo') carregarComparativo();
}

// --- 2. PROCESSAMENTO E LIMPEZA DE XLS ---
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
      
      // LIMPEZA: Ignora "Filtros aplicados", "NmDiretoria", "Total", etc.
      const linhasRaw = raw.slice(headIdx + 1).filter(r => {
        const txt = String(r[0] || '').toLowerCase();
        return r[0] && !txt.includes('filtros aplicados') && !txt.includes('nmdiretoria') && !txt.includes('total');
      });

      const mockObj = {}; headers.forEach((h, i) => { if (h) mockObj[h] = linhasRaw[0][i]; });
      const cols = {};
      for (const k in COL_KEYS) cols[k] = encontrarCol(mockObj, COL_KEYS[k]);

      // Identificar a escola para a base de dados
      if (nivel !== 'ure' && cols.escola) {
          estado[nivel].nomeEscola = String(linhasRaw[0][encontrarCol(mockObj, COL_KEYS.escola)]).trim();
      }

      estado[nivel].dados = linhasRaw.map(r => {
        const obj = {}; headers.forEach((h, i) => { if (h) obj[h] = r[i]; });
        const s = calcScore(obj, cols);
        return {
          nome: String(obj[cols.escola] || obj[cols.turma] || obj[cols.aluno] || 'Indefinido').trim(),
          score: s, acessos: toNum(obj[cols.acessos]), media: toNum(obj[cols.media]), realizacao: toNum(obj[cols.realizacao]),
          cls: s < 40 ? 'alta' : s < 65 ? 'media' : 'baixa', label: s < 40 ? 'ALTA' : s < 65 ? 'MÉDIA' : 'BAIXA'
        };
      });

      estado[nivel].nomeArquivo = file.name;
      renderizarNivel(nivel);
    } catch (err) { alert('❌ Erro no processamento.'); }
  };
  reader.readAsArrayBuffer(file);
}

// --- 3. INTERFACE (CARDS, SORT E TABELA) ---
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

function filtrar(nivel, cls) {
  estado[nivel].filtro = (estado[nivel].filtro === cls && cls !== 'todos') ? 'todos' : cls;
  renderizarNivel(nivel);
}

function ordenarPor(nivel, col) {
  const st = estado[nivel];
  if (st.colOrdem === col) st.desc = !st.desc;
  else { st.colOrdem = col; st.desc = true; }
  aplicarFiltroOrdem(nivel);
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
  const colLabels = { 
    nome: nivel === 'ure' ? 'Escola' : nivel === 'escola' ? 'Turma' : 'Aluno',
    cls: 'Prioridade', score: 'Score', acessos: 'Acessos', media: 'Média', realizacao: 'Realiz.' 
  };
  document.getElementById('head-' + nivel).innerHTML = `<th>#</th>` + Object.entries(colLabels).map(([key, label]) => `
    <th class="${st.colOrdem === key ? (st.desc ? 'sorted desc' : 'sorted') : ''}" onclick="ordenarPor('${nivel}','${key}')">${label}</th>
  `).join('');
}

function renderizarLinhas(nivel) {
  document.getElementById('body-' + nivel).innerHTML = estado[nivel].filtrados.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><div class="row-main">${r.nome}</div></td>
      <td><span class="pri-tag ${r.cls}">${r.label}</span></td>
      <td><div class="gauge-wrap">
        <div class="gauge-track"><div class="gauge-fill" style="width:${Math.min(r.score,100)}%; background:${corScore(r.score)}"></div></div>
        <span class="gauge-num">${r.score.toFixed(1)}</span>
      </div></td>
      <td>${r.acessos.toFixed(1)}%</td><td>${r.media.toFixed(1)}</td><td>${r.realizacao.toFixed(1)}%</td>
    </tr>
  `).join('');
}

// --- 4. BASE DE DADOS E COMPARATIVO (SUPABASE) ---
async function salvarSupabase(nivel) {
  const st = estado[nivel];
  if (!st.dados.length || !sb) return alert('⚠️ Verifique os dados ou conexão.');

  const periodo = document.getElementById('ptext-' + nivel).textContent;
  if (periodo.includes('Selecionar')) return alert('⚠️ Selecione o período!');

  const scoreMedio = st.dados.reduce((a, r) => a + r.score, 0) / st.dados.length;
  const payload = {
    nivel, nome_escola: st.nomeEscola, nome_arquivo: st.nomeArquivo, periodo, dados: st.dados,
    resumo: { total: st.dados.length, score_medio: +scoreMedio.toFixed(1), alta: st.dados.filter(r=>r.cls==='alta').length }
  };

  const { error } = await sb.from('relatorios').insert([payload]);
  if (error) alert('❌ Erro: ' + error.message);
  else alert('✅ Salvo na base de dados!');
}

async function carregarComparativo() {
  if (!sb) return;
  const { data, error } = await sb.from('relatorios').select('*').order('criado_em', { ascending: true });
  if (data) desenharGraficos(data);
}

function desenharGraficos(dados) {
  // Exemplo simplificado de gráfico de evolução
  const ctx = document.getElementById('chart-evolucao');
  if (!ctx) return;
  if (charts.evolucao) charts.evolucao.destroy();
  
  const labels = [...new Set(dados.map(d => d.periodo))];
  const scores = labels.map(l => {
    const d = dados.filter(x => x.periodo === l);
    return d.reduce((a, b) => a + b.resumo.score_medio, 0) / d.length;
  });

  charts.evolucao = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Score Médio Geral', data: scores, borderColor: '#1a5fd4', tension: 0.3 }] },
    options: { responsive: true, maintainAspectRatio: false }
  });
}

// --- UTILITÁRIOS ---
function corScore(s) { return s < 40 ? '#c0392b' : s < 65 ? '#b7580a' : '#1a7a4a'; }
function toNum(v){ if(v==null||v==='') return 0; const s = String(v).replace(/[%\s]/g,'').trim(); let n = s.includes(',') ? parseFloat(s.replace(/\./g,'').replace(',','.')) : parseFloat(s); return isNaN(n) ? 0 : (n > 0 && n < 1 ? n * 100 : n); }
function encontrarCol(obj, kws){ const keys = Object.keys(obj); for(const kw of kws){ const f = keys.find(k => k.toLowerCase().includes(kw.toLowerCase())); if(f) return f; } return null; }
function calcScore(linha, cols){ let soma=0, tp=0; for(const [c,p] of Object.entries(PESOS)){ if(!cols[c]) continue; let v = toNum(linha[cols[c]]); if(c==='media') v = (v/10)*100; soma += Math.min(v,100)*p; tp += p; } return tp>0 ? soma/tp : 0; }
function inicializarSupabase() { if (SUPABASE_URL && SUPABASE_KEY) { try { sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); atualizarIndicador('ok'); } catch (e) { atualizarIndicador('err'); } } }
function atualizarIndicador(estado) { const dot = document.getElementById('sb-dot'); if (dot) { dot.className = 'sb-dot ' + (estado === 'ok' ? 'ok' : 'err'); document.getElementById('sb-lbl').textContent = estado === 'ok' ? 'Online' : 'Erro'; } }
function abrirModalSupabase() { document.getElementById('modal-sb').classList.add('open'); }
function fecharModal() { document.getElementById('modal-sb').classList.remove('open'); }
function salvarConfig() { SUPABASE_URL = document.getElementById('inp-url').value; SUPABASE_KEY = document.getElementById('inp-key').value; localStorage.setItem('pec_sb_url', SUPABASE_URL); localStorage.setItem('pec_sb_key', SUPABASE_KEY); inicializarSupabase(); fecharModal(); }

window.onload = () => { inicializarSupabase(); ['ure', 'escola', 'turma'].forEach(n => { const inp = document.getElementById('input-' + n); if (inp) inp.addEventListener('change', e => processarArquivo(e.target.files[0], n)); }); };
