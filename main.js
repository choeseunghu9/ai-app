const { app, BrowserWindow, ipcMain, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const http = require('node:http');
const https = require('node:https');

const DATA_FILE = () => path.join(app.getPath('userData'), 'personal-ai-data.json');
const emptyData = () => ({ conversations: [], events: [], shortcuts: [], settings: { voiceOutput: true, microphone: true } });
let microphoneApprovalPending = false;

async function readData() {
  try { return JSON.parse(await fs.readFile(DATA_FILE(), 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') console.error('데이터 읽기 오류:', error);
    return emptyData();
  }
}

async function writeData(data) {
  await fs.mkdir(path.dirname(DATA_FILE()), { recursive: true });
  await fs.writeFile(DATA_FILE(), JSON.stringify(data, null, 2), 'utf8');
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1180, height: 820, minWidth: 760, minHeight: 620,
    backgroundColor: '#f5f6f8',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
  });
  window.loadFile(path.join(__dirname, 'src', 'index.html'));
}

ipcMain.handle('data:load', readData);
ipcMain.handle('data:save', async (_event, data) => { await writeData(data); return true; });
ipcMain.handle('data:clear', async () => { await writeData(emptyData()); return true; });
ipcMain.handle('data:path', () => DATA_FILE());
ipcMain.handle('mic:authorize', () => { microphoneApprovalPending = true; return true; });
const SYSTEM_PROMPT = '당신은 한국어 개인 비서입니다. 한국어로 간결하고 친절하게 답하고, PC 작업은 수행하지 말고 안내만 하세요.';
function aiConfig(provider, baseUrl) {
  if (provider === 'openai') {
    return { provider, key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', url: new URL('https://api.openai.com/v1/responses'), display: 'OpenAI · api.openai.com' };
  }
  if (provider !== 'compatible') throw new Error('설정에서 지원되는 AI 제공자를 선택해 주세요.');
  let base;
  try { base = new URL(baseUrl); } catch { throw new Error('AI 호환 API 주소를 확인해 주세요.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(base.hostname);
  if (!['https:', ...(local ? ['http:'] : [])].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('AI 주소는 HTTPS를 사용해야 합니다. HTTP는 localhost 주소에서만 허용됩니다.');
  if (base.pathname.endsWith('/chat/completions')) { /* A complete endpoint was supplied. */ }
  else base.pathname = `${base.pathname.replace(/\/$/, '')}/chat/completions`;
  return { provider, key: process.env.AI_API_KEY, model: process.env.AI_MODEL || 'gpt-4o-mini', url: base, display: `호환 API · ${base.host}` };
}
ipcMain.handle('ai:status', (_event, provider, baseUrl) => {
  try { const config = aiConfig(provider || 'openai', baseUrl || 'https://api.openai.com/v1'); return { configured: Boolean(config.key), model: config.model, provider: config.provider, destination: config.display }; }
  catch (error) { return { configured: false, model: '', provider, destination: '', error: error.message }; }
});
ipcMain.handle('ai:reply', async (_event, options, messages) => {
  const config = aiConfig(options?.provider, options?.baseUrl);
  if (!config.key) throw new Error(config.provider === 'openai' ? 'OPENAI_API_KEY 환경 변수가 없습니다. 설정 방법은 README를 확인해 주세요.' : 'AI_API_KEY 환경 변수가 없습니다. 설정 방법은 README를 확인해 주세요.');
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30 || messages.some(m => !['user', 'assistant'].includes(m.role) || typeof m.text !== 'string' || m.text.length > 8000)) throw new Error('대화 내용 형식을 확인해 주세요.');
  const payload = config.provider === 'openai'
    ? JSON.stringify({ model: config.model, instructions: SYSTEM_PROMPT, input: messages.map(m => ({ role: m.role, content: [{ type: 'input_text', text: m.text }] })) })
    : JSON.stringify({ model: config.model, messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages.map(m => ({ role: m.role, content: m.text }))] });
  const transport = config.url.protocol === 'https:' ? https : http;
  return await new Promise((resolve, reject) => {
    const request = transport.request(config.url, { method: 'POST', headers: { Authorization: `Bearer ${config.key}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, timeout: 45000 }, response => {
      let body = ''; response.setEncoding('utf8'); response.on('data', chunk => { if (body.length < 1_000_000) body += chunk; }); response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          if (response.statusCode === 401 || response.statusCode === 403) return reject(new Error('AI 인증에 실패했습니다. 선택한 제공자의 환경 변수 키를 확인해 주세요.'));
          if (response.statusCode === 429) return reject(new Error('AI 요청 한도에 도달했습니다. 계정 한도나 결제 설정을 확인해 주세요.'));
          if (response.statusCode >= 500) return reject(new Error('AI 서비스에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주세요.'));
          return reject(new Error(`AI 요청 설정을 확인해 주세요. (HTTP ${response.statusCode})`));
        }
        try {
          const result = JSON.parse(body);
          const answer = config.provider === 'openai'
            ? result.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text
            : result.choices?.[0]?.message?.content;
          const text = Array.isArray(answer) ? answer.map(part => part.text || '').join('') : answer;
          if (typeof text !== 'string' || !text.trim()) return reject(new Error('AI가 답변을 반환하지 않았습니다. 모델과 API 주소를 확인해 주세요.'));
          resolve(text.trim());
        } catch { reject(new Error('AI 응답을 읽지 못했습니다. 제공자와 모델 설정을 확인해 주세요.')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('timeout')));
    request.on('error', error => reject(error.message === 'timeout' ? new Error('AI 응답 시간이 초과되었습니다. 네트워크를 확인해 주세요.') : new Error('AI 서비스에 연결하지 못했습니다. 주소와 네트워크를 확인해 주세요.')));
    request.write(payload); request.end();
  });
});
ipcMain.handle('shortcut:open', async (_event, shortcutId) => {
  const data = await readData();
  const shortcut = data.shortcuts.find(item => item.id === shortcutId);
  if (!shortcut) throw new Error('등록된 바로가기를 찾을 수 없습니다.');
  if (shortcut.kind === 'website') {
    const url = new URL(shortcut.target);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HTTP 또는 HTTPS 웹사이트만 열 수 있습니다.');
    await shell.openExternal(url.toString());
  } else {
    const resolved = path.resolve(shortcut.target);
    if (resolved !== shortcut.target) throw new Error('앱 경로를 확인해 주세요.');
    const error = await shell.openPath(resolved);
    if (error) throw new Error(error);
  }
  return true;
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const approvedAudio = permission === 'media' && details.mediaTypes?.includes('audio') && microphoneApprovalPending;
    microphoneApprovalPending = false;
    callback(Boolean(approvedAudio));
  });
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
