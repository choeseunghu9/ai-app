const content = document.getElementById('page-content');
const titles = { chat: '대화', calendar: '일정', shortcuts: '앱 바로가기', settings: '설정' };
let currentPage = 'chat';
let data = { conversations: [], events: [], shortcuts: [], settings: { voiceOutput: true, microphone: true, notified: [], aiProvider: 'openai', aiBaseUrl: 'https://api.openai.com/v1' } };
let aiStatus = { configured: false, model: 'gpt-4.1-mini', provider: 'openai', destination: 'OpenAI · api.openai.com' };
let recognition = null;

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const persist = async () => { try { await window.personalAI.saveData(data); } catch { toast('저장에 실패했습니다. 저장 공간을 확인해 주세요.'); } };
function toast(message) { const el = document.getElementById('toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 3000); }
function confirmAction(title, detail, actionLabel = '승인하고 실행') {
  return new Promise(resolve => {
    const overlay = document.createElement('div'); overlay.className = 'confirm-box';
    overlay.innerHTML = `<div class="confirm-card"><h2>${esc(title)}</h2><p>${esc(detail)}</p><div class="confirm-actions"><button class="secondary" data-cancel>취소</button><button class="primary" data-confirm>${esc(actionLabel)}</button></div></div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('[data-cancel]').onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('[data-confirm]').onclick = () => { overlay.remove(); resolve(true); };
  });
}
function formatDate(value) { const date = new Date(value); return isNaN(date) ? value : date.toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }); }
function render() {
  document.getElementById('page-title').textContent = titles[currentPage];
  document.querySelectorAll('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.page === currentPage));
  const states = { chat: renderChat, calendar: renderCalendar, shortcuts: renderShortcuts, settings: renderSettings };
  states[currentPage]();
}
function renderChat() {
  content.innerHTML = `<section class="panel chat-layout"><div class="chat-heading"><div><h2>한국어 대화</h2><span class="subtle">${aiStatus.configured ? `AI 연결 설정됨 · ${esc(aiStatus.model)}` : 'AI 연결을 설정하면 실제 AI 답변을 받을 수 있습니다.'}</span></div><button class="text-button" id="clear-chat">기록 지우기</button></div><div id="messages" class="messages"></div><div class="composer"><div class="composer-row"><button class="icon-button ${recognition?'recording':''}" id="mic" title="음성 입력" ${data.settings.microphone ? '' : 'disabled'}>${recognition ? '⏹' : '🎙'}</button><input id="prompt" placeholder="무엇을 도와드릴까요?" autocomplete="off"><button id="send" class="primary">보내기</button></div><div id="voice-status" class="voice-status">${data.settings.voiceOutput ? '음성 출력 켜짐' : '음성 출력 꺼짐'} · 마이크 버튼을 눌러 시작하고 다시 눌러 중지할 수 있습니다.</div></div></section>`;
  renderMessages();
  document.getElementById('send').onclick = sendMessage;
  document.getElementById('prompt').onkeydown = event => { if (event.key === 'Enter') sendMessage(); };
  document.getElementById('clear-chat').onclick = async () => { if (await confirmAction('대화 기록 지우기', '이 PC에 저장된 대화 내용을 모두 삭제합니다. 이 작업은 되돌릴 수 없습니다.', '기록 삭제')) { data.conversations = []; await persist(); renderMessages(); } };
  document.getElementById('mic').onclick = () => recognition ? recognition.stop() : startRecognition();
}
function renderMessages() {
  const box = document.getElementById('messages'); if (!box) return;
  box.innerHTML = data.conversations.length ? '' : '<div class="empty-state"><div class="empty-icon">✳</div><strong>대화를 시작해 보세요</strong><br>메시지는 기본적으로 이 PC에 저장됩니다.</div>';
  for (const message of data.conversations) { const el = document.createElement('div'); el.className = `message ${message.role}`; el.textContent = message.text; box.appendChild(el); }
  box.scrollTop = box.scrollHeight;
}
async function sendMessage() {
  const input = document.getElementById('prompt'), text = input.value.trim(); if (!text) return;
  if (!aiStatus.configured) { toast('AI 연결이 설정되지 않았습니다. 설정 화면의 안내를 확인해 주세요.'); return; }
  const prior = data.conversations.filter(m => m.role === 'user' || m.role === 'assistant').slice(-19);
  const outgoing = [...prior, { role: 'user', text }];
  const detail = `제공자: ${aiStatus.destination}\n모델: ${aiStatus.model}\n\n다음 대화 내용이 이 제공자에게 전송됩니다.\n\n${outgoing.map(m => `${m.role === 'user' ? '나' : '비서'}: ${m.text}`).join('\n\n')}\n\n동의하면 위 내용이 답변 생성을 위해 전송됩니다.`;
  if (!await confirmAction('AI 서비스로 대화 보내기', detail, '동의하고 보내기')) return;
  data.conversations.push({ role: 'user', text }); await persist(); input.value = ''; renderMessages();
  document.getElementById('send').disabled = true; document.getElementById('voice-status').textContent = 'AI 응답을 기다리는 중…';
  try {
    const answer = await window.personalAI.getAIReply({ provider: data.settings.aiProvider, baseUrl: data.settings.aiBaseUrl }, outgoing);
    data.conversations.push({ role: 'assistant', text: answer }); await persist(); renderMessages();
    if (data.settings.voiceOutput) speak(answer);
  } catch (error) { toast(error.message || 'AI 응답을 받지 못했습니다.'); }
  finally { const send = document.getElementById('send'); if (send) send.disabled = false; const status = document.getElementById('voice-status'); if (status) status.textContent = data.settings.voiceOutput ? '음성 출력 켜짐' : '음성 출력 꺼짐'; }
}
function startRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { setVoiceStatus('이 앱 환경은 음성 인식 서비스를 지원하지 않습니다.'); toast('음성 인식 서비스 미지원: 텍스트 입력을 이용해 주세요.'); return; }
  confirmAction('마이크와 음성 인식 사용', '마이크 오디오를 음성 인식 처리기에 전달해 한국어 텍스트로 변환합니다. 음성 처리 경로는 Windows와 Chromium 설정에 따라 외부 서비스일 수 있습니다. 시작하면 마이크 사용 표시가 나타납니다.', '동의하고 마이크 켜기').then(async ok => {
    if (!ok) return;
    try {
      await window.personalAI.authorizeMicrophone();
      recognition = new Recognition(); recognition.lang = 'ko-KR'; recognition.interimResults = false; recognition.continuous = false;
      setVoiceStatus('마이크 권한을 확인하고 음성 인식 서비스를 시작하는 중…');
      recognition.onstart = () => { const button = document.getElementById('mic'); if (button) { button.textContent = '⏹'; button.classList.add('recording'); } setVoiceStatus('🔴 마이크 사용 중 · 다시 누르면 중지합니다.'); };
      recognition.onresult = event => { const input = document.getElementById('prompt'); if (input) input.value = event.results[0][0].transcript; setVoiceStatus('인식 결과를 입력창에 넣었습니다. 내용을 확인한 뒤 보내기를 누르세요.'); };
      recognition.onerror = event => {
        const messages = {
          'not-allowed': '마이크 권한이 거부되었습니다. Windows 개인정보 설정에서 데스크톱 앱의 마이크 접근을 허용해 주세요.',
          'service-not-allowed': '음성 인식 서비스가 차단되었습니다. Chromium 음성 서비스 설정을 확인해 주세요.',
          'audio-capture': '마이크 장치를 찾을 수 없습니다. 마이크 연결과 Windows 입력 장치를 확인해 주세요.',
          'network': '음성 인식 서비스의 네트워크 연결에 실패했습니다. 인터넷 연결을 확인해 주세요.',
          'no-speech': '음성이 감지되지 않았습니다. 마이크를 확인하고 다시 말해 주세요.',
          'language-not-supported': '한국어 음성 인식을 지원하지 않는 환경입니다.',
          'aborted': '음성 입력을 중지했습니다.'
        };
        const message = messages[event.error] || '음성 인식 중 오류가 발생했습니다. 입력창을 이용하거나 다시 시도해 주세요.';
        setVoiceStatus(message); if (event.error !== 'aborted') toast(message);
      };
      recognition.onend = () => { recognition = null; const button = document.getElementById('mic'); if (button) { button.textContent = '🎙'; button.classList.remove('recording'); } const status = document.getElementById('voice-status'); if (status?.textContent.includes('마이크 사용 중')) status.textContent = '음성 입력이 종료되었습니다. 인식된 내용이 있으면 확인 후 보내세요.'; };
      recognition.start();
    } catch { recognition = null; setVoiceStatus('마이크를 시작하지 못했습니다. 권한과 장치를 확인해 주세요.'); toast('마이크를 시작하지 못했습니다. Windows 권한과 입력 장치를 확인해 주세요.'); }
  });
}
function setVoiceStatus(message) { const status = document.getElementById('voice-status'); if (status) status.textContent = message; }
function speak(text) {
  if (!('speechSynthesis' in window)) { toast('이 환경에서 음성 출력을 사용할 수 없습니다.'); return; }
  window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'ko-KR';
  utterance.onstart = () => { const status = document.getElementById('voice-status'); if (status) status.textContent = '🔊 답변을 읽는 중…'; };
  utterance.onend = () => { const status = document.getElementById('voice-status'); if (status) status.textContent = '음성 출력이 끝났습니다.'; };
  utterance.onerror = () => toast('음성 출력에 실패했습니다. Windows 음성 설정을 확인해 주세요.');
  window.speechSynthesis.speak(utterance);
}
function renderCalendar() {
  const events = [...data.events].sort((a,b) => a.start.localeCompare(b.start));
  content.innerHTML = `<div class="grid"><section class="panel"><div class="panel-header"><h2>일정 목록</h2><span class="subtle">로컬 저장</span></div>${events.length ? `<div class="list">${events.map(e => `<div class="list-item"><div><strong>${esc(e.title)}</strong><small>${esc(formatDate(e.start))}${e.reminder ? ' · 알림 켜짐' : ''}</small></div><div><button class="text-button" data-edit="${esc(e.id)}">수정</button> <button class="text-button" data-delete="${esc(e.id)}">삭제</button></div></div>`).join('')}</div>` : '<div class="empty-state">등록된 일정이 없습니다.</div>'}</section><section class="panel"><h2 id="event-form-title">일정 추가</h2><form id="event-form"><input type="hidden" id="event-id"><div class="field"><label>일정 이름</label><input id="event-title" maxlength="120" required placeholder="예: 치과 예약"></div><div class="field"><label>날짜와 시간</label><input id="event-start" type="datetime-local" required></div><label class="toggle-row"><span>일정 시간에 로컬 알림 표시</span><input id="event-reminder" type="checkbox" checked></label><button class="primary" type="submit">저장</button><button class="secondary" type="reset">새 일정</button></form><p class="hint">알림은 앱이 실행 중일 때 이 PC에서 표시됩니다.</p></section></div>`;
  document.getElementById('event-form').onsubmit = async e => { e.preventDefault(); const id = document.getElementById('event-id').value; const event = { id: id || crypto.randomUUID(), title: document.getElementById('event-title').value.trim(), start: new Date(document.getElementById('event-start').value).toISOString(), reminder: document.getElementById('event-reminder').checked, notified: false }; if (!event.title) return; if (id) data.events = data.events.map(item => item.id === id ? event : item); else data.events.push(event); await persist(); renderCalendar(); toast('일정을 저장했습니다.'); };
  document.querySelectorAll('[data-edit]').forEach(button => button.onclick = () => { const e = events.find(item => item.id === button.dataset.edit); document.getElementById('event-id').value=e.id; document.getElementById('event-title').value=e.title; const d=new Date(e.start); document.getElementById('event-start').value=new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); document.getElementById('event-reminder').checked=e.reminder; document.getElementById('event-form-title').textContent='일정 수정'; });
  document.querySelectorAll('[data-delete]').forEach(button => button.onclick = async () => { const e=events.find(item=>item.id===button.dataset.delete); if (await confirmAction('일정 삭제', `“${e.title}” 일정을 삭제합니다.`, '삭제')) { data.events=data.events.filter(item=>item.id!==e.id); await persist(); renderCalendar(); } });
}
function renderShortcuts() {
  content.innerHTML = `<div class="grid"><section class="panel"><div class="panel-header"><h2>허용된 바로가기</h2><span class="subtle">등록한 항목만 실행</span></div>${data.shortcuts.length ? `<div class="list">${data.shortcuts.map(s=>`<div class="list-item"><div><strong>${esc(s.name)}</strong><small>${s.kind==='website'?'웹사이트':'Windows 앱'} · ${esc(s.target)}</small></div><div><button class="secondary" data-open="${esc(s.id)}">열기</button> <button class="text-button" data-remove="${esc(s.id)}">삭제</button></div></div>`).join('')}</div>` : '<div class="empty-state">등록된 앱이나 웹사이트가 없습니다.</div>'}</section><section class="panel"><h2>바로가기 등록</h2><form id="shortcut-form"><div class="field"><label>표시 이름</label><input id="shortcut-name" required maxlength="60" placeholder="예: 메모장"></div><div class="field"><label>종류</label><select id="shortcut-kind"><option value="website">웹사이트</option><option value="app">Windows 앱 파일</option></select></div><div class="field"><label>주소 또는 앱 경로</label><input id="shortcut-target" required placeholder="https://example.com 또는 앱 경로"></div><button class="primary">등록</button></form><p class="hint">실행은 매번 작업 이름을 확인한 뒤 승인해야 합니다. 앱은 사용자가 선택한 실행 파일 경로만 허용됩니다.</p></section></div>`;
  document.getElementById('shortcut-form').onsubmit=async e=>{e.preventDefault(); const kind=document.getElementById('shortcut-kind').value; let target=document.getElementById('shortcut-target').value.trim(); if(kind==='website'){try{const url=new URL(target); if(!['http:','https:'].includes(url.protocol)) throw Error(); target=url.toString();}catch{toast('http 또는 https 웹 주소를 입력해 주세요.');return;}} else if(!/^[A-Za-z]:\\/.test(target)){toast('C:\\ 형식의 Windows 앱 경로를 입력해 주세요.');return;} data.shortcuts.push({id:crypto.randomUUID(),kind,target,name:document.getElementById('shortcut-name').value.trim()}); await persist(); renderShortcuts(); toast('바로가기를 등록했습니다.');};
  document.querySelectorAll('[data-open]').forEach(button=>button.onclick=async()=>{const item=data.shortcuts.find(s=>s.id===button.dataset.open); if(!await confirmAction('바로가기 실행 확인', `“${item.name}”을 엽니다.\n\n대상: ${item.target}`, '승인하고 열기'))return; try{await window.personalAI.openShortcut(item.id);}catch(error){toast(`열지 못했습니다: ${error.message}`);}});
  document.querySelectorAll('[data-remove]').forEach(button=>button.onclick=async()=>{const item=data.shortcuts.find(s=>s.id===button.dataset.remove); if(await confirmAction('바로가기 삭제',`“${item.name}”을 허용 목록에서 제거합니다.`,'삭제')){data.shortcuts=data.shortcuts.filter(s=>s.id!==item.id);await persist();renderShortcuts();}});
}
async function renderSettings() {
  const path = await window.personalAI.getDataPath().catch(()=>'(확인할 수 없음)');
  const compatible = data.settings.aiProvider === 'compatible';
  content.innerHTML = `<div class="grid"><section class="panel"><h2>AI 연결</h2>
    <div class="notice">${aiStatus.error ? esc(aiStatus.error) : aiStatus.configured ? `연결 설정됨 · ${esc(aiStatus.destination)} · ${esc(aiStatus.model)}` : `키 설정 필요 · ${compatible ? 'AI_API_KEY' : 'OPENAI_API_KEY'} 환경 변수`}</div>
    <div class="field"><label for="ai-provider">AI 제공자</label><select id="ai-provider"><option value="openai" ${compatible?'':'selected'}>OpenAI</option><option value="compatible" ${compatible?'selected':''}>OpenAI 호환 API</option></select></div>
    <div class="field" id="ai-url-field" ${compatible?'':'hidden'}><label for="ai-base-url">호환 API 기본 주소</label><input id="ai-base-url" value="${esc(data.settings.aiBaseUrl || '')}" placeholder="https://서버주소/v1"><small>주소가 확인 창에 표시되며, HTTPS 또는 localhost만 허용합니다.</small></div>
    <p class="hint">API 키는 코드나 이 PC의 데이터 파일에 저장하지 않습니다. PowerShell에서 환경 변수로 직접 입력하고 앱을 다시 실행하세요. 메시지를 보낼 때마다 제공자, 모델, 전송할 대화 내용을 표시하고 동의를 요청합니다.</p>
    <h2 class="section-heading">음성</h2><label class="toggle-row"><span>마이크 사용 허용</span><input id="setting-mic" type="checkbox" ${data.settings.microphone?'checked':''}></label>
    <label class="toggle-row"><span>답변을 소리 내어 읽기</span><input id="setting-voice" type="checkbox" ${data.settings.voiceOutput?'checked':''}></label>
    <p class="hint">현재 Chromium Web Speech Recognition API를 사용합니다. 서비스 제공과 음성 데이터 처리 위치는 Windows/Chromium 설정에 따라 다를 수 있으며, 마이크 시작 전에 안내와 동의를 요청합니다. 인식 결과는 자동 전송하지 않습니다.</p>
    </section><section class="panel"><h2>저장 및 데이터</h2><div class="field"><label>로컬 저장 위치</label><small>${esc(path)}</small></div>
    <p class="hint">대화, 일정, 바로가기, 설정은 이 PC의 앱 데이터 파일에 저장됩니다.</p><button id="delete-data" class="danger">모든 로컬 데이터 삭제</button>
    <h2 class="section-heading">구현 상태</h2><div class="list"><div class="list-item"><div><strong>한국어 텍스트 대화</strong><small>${aiStatus.configured?'연결 설정됨 · 실제 응답 검증 필요':'API 키 필요'}</small></div></div>
    <div class="list-item"><div><strong>음성 입력 / 출력</strong><small>Speech Recognition 지원 여부와 이 PC의 음성 장치 검증 필요</small></div></div>
    <div class="list-item"><div><strong>일정 및 로컬 알림</strong><small>구현됨 · 실제 알림 동작 검증 필요</small></div></div>
    <div class="list-item"><div><strong>앱 / 웹사이트 열기</strong><small>구현됨 · 등록 대상 실행 검증 필요</small></div></div></div></section></div>`;
  document.getElementById('ai-provider').onchange = async e => {
    data.settings.aiProvider = e.target.value; await persist(); aiStatus = await window.personalAI.getAIStatus(data.settings.aiProvider, data.settings.aiBaseUrl); renderSettings();
  };
  document.getElementById('ai-base-url').onchange = async e => {
    data.settings.aiBaseUrl = e.target.value.trim(); await persist(); aiStatus = await window.personalAI.getAIStatus(data.settings.aiProvider, data.settings.aiBaseUrl); renderSettings();
  };
  document.getElementById('setting-mic').onchange=async e=>{data.settings.microphone=e.target.checked;await persist();};
  document.getElementById('setting-voice').onchange=async e=>{data.settings.voiceOutput=e.target.checked;await persist();};
  document.getElementById('delete-data').onclick=async()=>{if(!await confirmAction('모든 로컬 데이터 삭제','대화, 일정, 앱 바로가기, 설정을 이 PC에서 삭제하고 기본 설정으로 되돌립니다. 되돌릴 수 없습니다.','모두 삭제'))return; await window.personalAI.clearData(); data=await window.personalAI.loadData(); toast('로컬 데이터를 삭제했습니다.'); render();};
}
document.querySelectorAll('.nav-item').forEach(button=>button.addEventListener('click',()=>{currentPage=button.dataset.page;render();}));
window.addEventListener('DOMContentLoaded',async()=>{
  try{data=await window.personalAI.loadData(); if(!data.settings) data.settings={}; data.settings={voiceOutput:true,microphone:true,notified:[],aiProvider:'openai',aiBaseUrl:'https://api.openai.com/v1',...data.settings}; if(!Array.isArray(data.settings.notified)) data.settings.notified=[];}catch{toast('저장된 정보를 불러오지 못했습니다.');}
  try{aiStatus=await window.personalAI.getAIStatus(data.settings.aiProvider, data.settings.aiBaseUrl);}catch{}
  document.getElementById('status-pill').textContent=aiStatus.configured?'AI 연결 설정됨':'AI 연결 설정 필요'; render();
  setInterval(checkReminders,30000); checkReminders();
});
function checkReminders(){const now=Date.now(); let changed=false; for(const e of data.events){if(e.reminder&&!e.notified&&new Date(e.start).getTime()<=now){e.notified=true;changed=true;try{new Notification(e.title,{body:`일정 시간입니다 · ${formatDate(e.start)}`});}catch{toast(`일정 알림: ${e.title}`);}}}if(changed)persist();}
