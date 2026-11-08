# ai-app

## 퍼스널 ai

한국어 대화, 음성 입력·출력, 로컬 일정, 사용자가 직접 등록한 Windows 앱과 웹사이트 바로가기를 제공하는 데스크톱 시제품입니다.

## 설치 및 실행

1. Windows에 Node.js LTS를 설치합니다. pnpm이 없다면 PowerShell에서 설치합니다.
   ```powershell
   npm install --global pnpm
   ```
2. PowerShell을 프로젝트 폴더에서 엽니다.
   ```powershell
   cd "$HOME\Documents\Codex\2026-11-08\ai-haru-ai-pc-windows-1"
   ```
3. 의존성을 설치합니다.
   ```powershell
   pnpm install
   ```
   패키지 설치 도구가 Electron 설치 스크립트 승인을 물으면 Electron 항목만 승인합니다.
4. 앱을 시작합니다.
   ```powershell
   pnpm start
   ```

## AI 제공자

설정 화면에서 제공자를 선택할 수 있습니다.

- **OpenAI:** OpenAI Responses API를 사용합니다. 모델 기본값은 `gpt-4.1-mini`이며 `OPENAI_MODEL`로 바꿀 수 있습니다.
- **OpenAI 호환 API:** Chat Completions 형식과 호환되는 서버를 사용합니다. 주소는 설정에 입력하며, HTTPS만 허용합니다. 예외적으로 HTTP는 `localhost`에만 허용합니다. 기본 모델은 `gpt-4o-mini`이며 `AI_MODEL`로 바꿀 수 있습니다.

API 키는 PowerShell에서 직접 입력합니다. 입력값은 화면에 표시될 수 있지만 명령 기록에는 키 문자열을 남기지 않으며, 이 PowerShell 세션에서 시작한 앱에만 적용됩니다.

OpenAI:

```powershell
$env:OPENAI_API_KEY = Read-Host 'OpenAI API 키'
$env:OPENAI_MODEL = 'gpt-4.1-mini' # 선택 사항
pnpm start
```

호환 API:

```powershell
$env:AI_API_KEY = Read-Host 'AI API 키'
$env:AI_MODEL = '모델 이름' # 선택 사항
pnpm start
```

키를 설정하지 않았거나 인증에 실패하면 앱은 한국어 안내를 표시합니다. 키, 요청 본문, 서버 오류의 원문은 앱 로그나 화면에 출력하지 않습니다. 메시지 전송 전에는 제공자, 모델, 전송 대상과 대화 내용을 확인하고 동의해야 합니다. API 사용 요금은 제공자 계정에 청구될 수 있습니다.

## 음성 입력 사용법

1. 대화 화면에서 마이크 버튼을 누릅니다.
2. 앱의 안내를 확인한 뒤 **동의하고 마이크 켜기**를 누릅니다. 그때만 앱이 오디오 입력 권한을 요청합니다.
3. 화면의 빨간 표시가 켜지면 말합니다. 다시 마이크 버튼을 눌러 중지할 수 있습니다.
4. 인식된 문장이 입력창에 나타나면 직접 확인하고 **보내기**를 눌러 전송합니다. 인식 결과를 자동 전송하지 않습니다.

음성 입력은 Chromium `SpeechRecognition`/`webkitSpeechRecognition` Web Speech Recognition API를 사용합니다. 이 API는 실행 환경에 따라 제공되지 않을 수 있고, 음성 인식을 외부 네트워크 서비스에서 처리할 수 있습니다. 정확한 서비스 제공자와 데이터 처리 위치는 이 앱에서 제어하거나 검증하지 못합니다. 마이크 사용 전에 이 제한과 동의 화면을 표시합니다. 오류는 권한 거부, 입력 장치 없음, 네트워크 문제, 무음, 서비스 미지원 등으로 나누어 안내합니다.

음성 출력은 Web Speech `speechSynthesis`와 Windows의 한국어 음성 설치에 따라 달라집니다.

## 데이터와 PC 제어

대화, 일정, 바로가기와 설정은 Electron 사용자 데이터 폴더의 `personal-ai-data.json`에 저장합니다. 정확한 위치는 설정 화면에 표시됩니다. 앱에서 대화 기록 또는 모든 로컬 데이터를 삭제할 수 있습니다. `.gitignore`는 환경 설정 파일, 로컬 데이터, 로그, 빌드 결과와 의존성 폴더를 제외합니다.

AI는 명령어를 실행하거나 파일을 읽고 수정하지 않습니다. 앱/웹사이트는 사용자가 등록한 대상만 열 수 있고, 매번 대상 이름과 주소를 표시한 뒤 승인받습니다. 브라우저 프로필·쿠키·로그인 정보에 접근하지 않습니다. 외부 계정 연동, 파일 업로드, 결제, 이메일·메시지 전송은 없습니다.

## 확인 상태와 제한 사항

- 문법 검사는 `pnpm check`로 실행합니다.
- 실제 OpenAI 응답은 유효한 API 키, 계정 권한, 인터넷 연결이 있어야 확인할 수 있습니다.
- 실제 마이크 인식은 이 Windows PC의 마이크, 개인정보 권한, Web Speech 서비스 제공 여부에 따라 달라집니다.
- 로컬 일정 알림은 앱이 실행 중일 때만 표시됩니다.
- 설치용 EXE/MSI 패키지는 아직 구성하지 않았습니다.
