# VESTIGE

▶ **바로 보기: https://daforce1984.github.io/vestige/** (Chrome 등 WebGPU 지원 브라우저, 소리 켜기)

HTML5와 **raw WebGPU**로 만든 실시간 SF 단편 영화입니다(약 6분 32초, 24 fps). 게임 엔진이나 3D 프레임워크 없이
WGSL 셰이더와 자바스크립트만으로 렌더러, 연출, 사운드 믹싱을 브라우저에서 실시간으로 돌립니다.

> 고향을 찾아 41년을 떠돌던 함대가 중력 우물 함정에 갇히고, 단 한 기의 메카 **시그마(Sigma)** 가 우물을 부숴
> 함대를 지구로 돌려보낸다.

## 실행

```bash
python3 tools/serve.py 8791
# Chrome(WebGPU 지원)에서 http://localhost:8791/ 열기 → ▶ 재생 (소리 켜기)
```

- 조작: `Space` 재생/일시정지 · `Esc` 일시정지 · `←/→` 5초 이동 · `F` 전체화면 · `H` UI 숨기기
- URL 파라미터: `?t=120` 시작 시각 · `&scale=0.75` 렌더 해상도 배율 · `&debug=1` HUD · `&shutter=N` 모션 블러 샘플 수
- 재생 중에는 마우스 커서가 숨겨집니다.

## 어떻게 만들었나

- **AI 협업 제작**: 감독(사용자)이 한국어로 장면과 연출 피드백을 주고, **Claude Code (Claude Opus 5.5)** 가 코드, 셰이더,
  모델 생성 스크립트, 사운드 구성을 모두 작성하고 고쳤습니다. 피드백 → 수정 → 확인을 수십 번 반복했습니다.
- **검증 방식**: 사용자가 보고 있는 Chrome 탭 하나에 Chrome DevTools Protocol(CDP)로 붙어서(`tools/cdp.py`)
  원하는 시각으로 이동해 스크린샷을 찍고, 프레임 시간과 메모리를 확인했습니다. headless 브라우저나 새 탭은 쓰지 않았습니다.
- **결정론적 타임라인**: 함선, 카메라, 파편, 폭발 등 모든 움직임이 영상 시각 `t`의 순수 함수라서 어느 시각으로
  이동해도 같은 화면이 나옵니다. 영상 시계는 1/24초 단위로 끊어서 24 fps 영화처럼 보입니다.
- **모델링**: 함선, 모함 내부, 격납고, 회수기, 메이스, 메카 손은 **Blender Python 스크립트**(`blender/`, `tools/make_*.py`)로
  절차적으로 생성해 glTF(GLB)로 내보냈습니다. 메카 두 기는 CC0 모델을 부품 단위로 분리하고 UV를 다시 펴서 4K/2K 텍스처를 구웠습니다.

## 사용 기술

**엔진**
- HTML5 + raw WebGPU + WGSL (엔진/프레임워크 없음), 자체 glTF 로더
- 1/24초 단위의 결정론적 타임라인, 어느 시각으로 이동해도 결과가 같은 연출(seek-safe)
- 초기화나 리사이즈 때만 GPU 리소스를 만들고 매 프레임 할당은 하지 않음(메모리 일정 유지)

**렌더링**
- 4× MSAA HDR(rgba16float), reversed-Z 깊이, 섀도 맵
- PBR(metal/roughness) + 박스 투영 실내 반사, GPU 인스턴싱
- 복잡한 모델은 depth prepass로 overdraw를 줄임
- 절차적 행성(주야/구름/대기), 별, 중력 렌즈 왜곡

**셰이더 효과**
- 버텍스 셰이더에서 녹아내림, 파쇄, 메이스 타격 찌그러짐 변형
- 파쇄 조각의 찢어진 가장자리만 검붉게 달아오르는 표현
- 육각 보호막과 붕괴 파동, 격납고 반투명 에너지 장막
- 십자 빌보드 추진기 불꽃(노즐 크기와 속도에 따라 변함)
- 하이퍼스페이스 창과 워프 늘어짐(도착은 함수, 출발은 함미를 기준으로 고정)
- 볼류메트릭처럼 보이도록 만든 폭발 빌보드(domain warp, 자기 그림자, 흑체 코어)

**후처리**
- 블룸, 피사계 심도, 재투영 모션 블러
- 아나모픽 스트릭, 갓레이, 셰이더로 만든 태양 렌즈 플레어(고스트, 헤일로)
- 방사형 블러, 통신 간섭 효과, 필름 그레이드

**애니메이션과 물리**
- 메카 FK 포즈 트랙, 무기 접촉을 맞추는 contact solver
- 스프링 감쇠 기반의 묵직한 관성과 레그돌 같은 드리프트
- 결정론적 파편/분해 물리, 스플라인 카메라

**오디오**
- Web Audio API로 음악 스템, 효과음, 대사를 스케줄링하고 덕킹과 믹싱
- 일부 효과음은 합성 엔진(`js/audio-synth.js`)으로 생성

## 사용한 도구와 에셋

| 분야 | 사용 |
|---|---|
| 코드 작성 | Claude Code (Claude Opus 5.5) |
| 3D 모델 | Blender 5.2 (Python 스크립트로 절차 생성) |
| 메카 원본 | ATLAS/09(시그마), RONIN/04(적 메카), Ramon Linares, **CC0** |
| 지구 텍스처 | © Solar System Scope, **CC BY 4.0** |
| 대사 음성 | ElevenLabs v3 (영어 대사, 한국어 자막) |
| 음악 | MiniMax Music 3 (ComfyUI로 생성) |
| 효과음 | Pixabay (Pixabay Content License), 목록은 `assets/sfx/CREDITS.md` |
| 폰트 | Google Fonts: Rajdhani, Noto Serif KR, Share Tech Mono |
| 테스트 | Chrome DevTools Protocol (보이는 Chrome 탭 하나만 사용) |

팬 트리뷰트 작품이며, 디자인은 모두 이 프로젝트용으로 새로 만들었습니다.

## 폴더 구조

- `index.html`: 화면, 자막, 타이틀 오버레이
- `js/renderer.js`, `js/shaders.js`: WebGPU 렌더러와 WGSL 셰이더
- `js/world.js`, `js/shots.js`, `js/fx.js`, `js/duel.js`: 함대, 샷, 이펙트, 메카 결투 연출(모두 시각 `t`의 함수)
- `js/audio*.js`: 음악, 효과음, 대사 믹싱
- `js/timemap.js`: 스토리 시각과 영상 시각 매핑
- `assets/`: GLB 모델, 텍스처, 행성 맵, 음악, 효과음, 대사(`assets/voice/lines.json` = 대본, 타이밍, 한국어 자막)
- `blender/`: 모델 생성 스크립트와 디자인 노트
- `tools/`: 개발 서버, CDP 테스트, 효과음 빌드(`build_sfx.py`), 메카 부품 생성, 음악 생성 스크립트
- `SCRIPT*.md`, `TODO.md`: 대본, 샷 리스트, 작업 기록
