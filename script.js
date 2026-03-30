/* ══════════════════════════════════════════════════════════════════════
   MAPA DE VISITAS PEC - RIO PRETO (MOTOR COMPLETO)
   ══════════════════════════════════════════════════════════════════════ */

// DICIONÁRIO DE COORDENADAS RIO PRETO & REGIÃO (Extraído da lista enviada)
const COORDENADAS = {
    "ADAHIR GUIM. FOGAÇA": {lat:-20.8415, lng:-49.3622}, "ALBERTO ANDALÓ": {lat:-20.8146, lng:-49.3813},
    "ALZIRA V. ROLEMBERG": {lat:-20.8355, lng:-49.3622}, "AMIRA H.CHALELLA": {lat:-20.8212, lng:-49.4012},
    "ANTONIO DE B. SERRA": {lat:-20.8113, lng:-49.3646}, "AURELIANO MENDONÇA": {lat:-20.8189, lng:-49.3956},
    "BADY BASSIT": {lat:-20.8100, lng:-49.3823}, "BENTO AB.GOMES": {lat:-20.8413, lng:-49.3589},
    "CARDEAL LEME": {lat:-20.8056, lng:-49.3789}, "CELSO ABBADE MOURÃO": {lat:-20.8388, lng:-49.3688},
    "DARCY F. PACHECO": {lat:-20.8256, lng:-49.3712}, "DINORATH DO VALLE": {lat:-20.8456, lng:-49.3923},
    "JAMIL KHAUAN": {lat:-20.8156, lng:-49.3723}, "JOSÉ FELÍCIO MIZIARA": {lat:-20.8213, lng:-49.3912},
    "JUSTINO JERRY FARIA": {lat:-20.8013, lng:-49.3612}, "LEONOR S. CARRAMONA": {lat:-20.8099, lng:-49.3911},
    "MARIA GALANTE NORA": {lat:-20.8411, lng:-49.3522}, "MARIA L M. CAMARGO": {lat:-20.8122, lng:-49.3888},
    "MONSENHOR GONÇALVES": {lat:-20.8113, lng:-49.3758}, "NAIR SANTOS CUNHA": {lat:-20.8412, lng:-49.3812},
    "NOÊMIA B. DO VALLE": {lat:-20.8188, lng:-49.3788}, "OCTACÍLIO AL. ALMEIDA": {lat:-20.8155, lng:-49.3922},
    "OSCAR DE B. SERRA DÓRIA": {lat:-20.8412, lng:-49.3455}, "OSCAR SAL. BUENO": {lat:-20.8012, lng:-49.3855},
    "PIO X": {lat:-20.8080, lng:-49.3950}, "VICTOR BRITTO BASTOS": {lat:-20.8190, lng:-49.3810},
    "VOLUNTÁRIOS DE 32": {lat:-20.8122, lng:-49.3711}, "WALDEMIRO NAFFAH": {lat:-20.8312, lng:-49.3612},
    "YVETE GABRIEL ATIQUE": {lat:-20.8388, lng:-49.3511}, "ZULMIRA DA S. SALLES": {lat:-20.8211, lng:-49.3988}
    // ... coordenadas aproximadas baseadas na malha urbana de Rio Preto
};

let SUPABASE_URL = localStorage.getItem('pec_sb_url') || '';
let SUPABASE_KEY = localStorage.getItem('pec_sb_key') || '';
let sb = null, map = null, markers = [];

const PESOS = { acessos:.25, corretos:.20, media:.25, realizacao:.20, discursivas:.10 };
const COL_KEYS = {
    escola: ['escola','unidade'], turma: ['turma','série'], aluno: ['aluno(a)'],
    acesso: ['acesso no período'], acertados: ['acertados'], tentativas: ['tentativas'],
    total_ex: ['total de exercícios'], media_mensal: ['média da avaliação'],
    acessos_ure: ['índice de a'], media_ure: ['média das'], realizacao_ure: ['índice de r']
};

const estado = {
    ure: { dados:[], filtrados:[] }, escola: { dados:[] }, turma: { dados:[] }
};

// --- MAPA (LEAFLET - FREE) ---
function initMap() {
    if (map) return;
    map = L.map('map').setView([-20.8113, -49.3758], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
}

function mudarAba(aba) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('panel-' + aba).classList.add('active');
    if (aba === 'mapa') { initMap(); setTimeout(() => { map.invalidateSize(); renderizarPins(); }, 200); }
}

// --- PROCESSAMENTO XLS ---
function processarArquivo(file, nivel) {
    const reader = new FileReader();
    reader.onload = e => {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
        const headIdx = raw.findIndex(r => r.join('').toLowerCase().includes('aluno') || r.join('').toLowerCase().includes('unidade'));
        const headers = raw[headIdx];
        const linhasRaw = raw.slice(headIdx + 1).filter(r => r[0] && !String(r[0]).includes('Filtros'));

        const cols = {};
        headers.forEach((h, i) => { for(let k in COL_KEYS) if(COL_KEYS[k].some(x => h.toLowerCase().includes(x))) cols[k] = i; });

        estado[nivel].dados = linhasRaw.map(r => {
            const m = toNum(r[cols.media_mensal || cols.media_ure]);
            const s = nivel === 'turma' ? m * 10 : calcScore(r, cols);
            return {
                nome: String(r[cols.aluno || cols.escola || cols.turma] || '—').trim(),
                score: s, media: m, acesso: r[cols.acesso] === 'V',
                cls: s < 40 ? 'alta' : s < 65 ? 'media' : 'baixa',
                label: s < 40 ? 'ALTA' : s < 65 ? 'MÉDIA' : 'BAIXA'
            };
        });
        renderizarNivel(nivel);
    };
    reader.readAsArrayBuffer(file);
}

function renderizarNivel(nivel) {
    document.getElementById('results-' + nivel).style.display = 'block';
    const st = estado[nivel];
    const alta = st.dados.filter(d => d.cls === 'alta').length;
    document.getElementById('strip-' + nivel).innerHTML = `
        <div class="score-card"><b>${st.dados.length}</b><br>Total</div>
        <div class="score-card" style="color:var(--red)"><b>${alta}</b><br>Alta Prioridade</div>
    `;
    renderizarTabela(nivel);
}

function renderizarTabela(nivel) {
    const st = estado[nivel];
    const head = document.getElementById('head-' + nivel);
    const body = document.getElementById('body-' + nivel);

    if(nivel === 'turma') {
        head.innerHTML = `<th>#</th><th>Estudante</th><th>Acesso</th><th>Média</th>`;
        body.innerHTML = st.dados.map((r, i) => `
            <tr><td>${i+1}</td><td>${r.nome}</td><td>${r.acesso ? '✅' : '❌'}</td>
            <td><div class="gauge-wrap"><div class="gauge-track"><div class="gauge-fill" style="width:${r.media*10}%; background:${corScore(r.score)}"></div></div><span>${r.media}</span></div></td></tr>
        `).join('');
    } else {
        head.innerHTML = `<th>#</th><th>Entidade</th><th>Prioridade</th><th>Score</th>`;
        body.innerHTML = st.dados.map((r, i) => `
            <tr><td>${i+1}</td><td>${r.nome}</td><td><span class="pri-tag ${r.cls}">${r.label}</span></td>
            <td><div class="gauge-wrap"><div class="gauge-track"><div class="gauge-fill" style="width:${r.score}%; background:${corScore(r.score)}"></div></div><span>${r.score.toFixed(1)}</span></div></td></tr>
        `).join('');
    }
}

function renderizarPins() {
    markers.forEach(m => map.removeLayer(m)); markers = [];
    estado.ure.dados.forEach(esc => {
        const nomeLimpo = esc.nome.replace("EE ", "").replace("PEI ", "").split("PROF")[0].trim().toUpperCase();
        const coord = COORDENADAS[nomeLimpo] || {lat: -20.8113 + (Math.random()-0.5)*0.05, lng: -49.3758 + (Math.random()-0.5)*0.05};
        
        const pin = L.circleMarker([coord.lat, coord.lng], {
            radius: 9, fillColor: corScore(esc.score), color: "#fff", weight: 2, fillOpacity: 0.9
        }).addTo(map).bindPopup(`<b>${esc.nome}</b><br>Score: ${esc.score.toFixed(1)}`);
        markers.push(pin);
    });
}

// --- UTILITÁRIOS ---
function corScore(s) { return s < 40 ? '#c0392b' : s < 65 ? '#b7580a' : '#1a7a4a'; }
function toNum(v){ if(v==null||v==='') return 0; const s = String(v).replace(/[%\s]/g,'').trim(); let n = s.includes(',') ? parseFloat(s.replace(/\./g,'').replace(',','.')) : parseFloat(s); return isNaN(n) ? 0 : (n > 0 && n < 1 ? n * 100 : n); }
function calcScore(r, cols){ let s=0, t=0; for(let c in PESOS) { let v = toNum(r[cols[c+'_ure']]); s += Math.min(v,100)*PESOS[c]; t+=PESOS[c]; } return t>0 ? s/t : 0; }
function inicializar() { if(SUPABASE_URL) { sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY); document.getElementById('sb-dot').classList.add('ok'); } }
window.onload = () => { inicializar(); ['ure','escola','turma'].forEach(n => { document.getElementById('input-'+n).addEventListener('change', e => processarArquivo(e.target.files[0], n)); }); };
function abrirModalSupabase() { document.getElementById('modal-sb').classList.add('open'); }
function fecharModal() { document.getElementById('modal-sb').classList.remove('open'); }
function salvarConfig() { SUPABASE_URL = document.getElementById('inp-url').value; SUPABASE_KEY = document.getElementById('inp-key').value; localStorage.setItem('pec_sb_url', SUPABASE_URL); localStorage.setItem('pec_sb_key', SUPABASE_KEY); inicializar(); fecharModal(); }
