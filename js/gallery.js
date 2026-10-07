// REFERENCE GALLERY (2026-10-07): the AI-generated reference images the film's designs were built from (the Codex image
// tool), browsable from the main menu — a thumbnail grid, click for the full image, ←/→ to step, Esc to close.
const REFS = [
  { src: 'assets/tex/src/hangar_concept_v1.png', title: '격납고 콘셉트', note: '6번씬 구도, 빈 격납고 — blender/hangar_v2.py로 재구성' },
  { src: 'assets/tex/src/shield_drone_concept_v2.png', title: '방패 드론 디자인 시트 v2 (채택)', note: '곡면 · 절반 두께 · 전방향 추진기 · 데칼 없음 — blender/shield_drone.py' },
  { src: 'assets/tex/src/shield_drone_concept_v1.png', title: '방패 드론 디자인 시트 v1', note: '정면 · 후면 · 측면 · 3/4' },
  { src: 'assets/ref/vanguard_scheme_a.png', title: 'VANGUARD 도장 A안 (채택)', note: "'ace custom' — 옥스블러드 · 차콜 · 건메탈" },
  { src: 'assets/ref/vanguard_scheme_b.png', title: 'VANGUARD 도장 B안', note: '네이비 지휘관기' },
  { src: 'assets/tex/src/sigma_suncult_emblem.png', title: '시그마 엠블럼 (원본)', note: '태양 숭배 교단 — 가슴 · 백팩 데칼' },
  { src: 'assets/tex/src/sigma_suncult_shoulder.png', title: '시그마 어깨 배지 (원본)', note: '양 어깨 데칼' },
  { src: 'assets/tex/src/vestige_mech_white_armor_albedo_v1.png', title: '메카 텍스처 — 흰 장갑', note: 'PBR 알베도' },
  { src: 'assets/tex/src/vestige_mech_dark_frame_albedo_v1.png', title: '메카 텍스처 — 어두운 프레임', note: 'PBR 알베도' },
  { src: 'assets/tex/src/vestige_mech_metal_detail_albedo_v1.png', title: '메카 텍스처 — 금속 디테일', note: 'PBR 알베도' },
  { src: 'assets/tex/src/vestige_mech_panel_height_v1.png', title: '메카 텍스처 — 패널 높이', note: '높이 맵' },
  { src: 'assets/tex/src/vestige_mech_wear_grime_mask_v1.png', title: '메카 텍스처 — 마모 · 때', note: '마스크' },
];
let root = null, big = null, cur = -1;
export const galleryOpen = () => !!root && root.classList.contains('on');
function show(i) {
  cur = (i + REFS.length) % REFS.length;
  const r = REFS[cur];
  big.querySelector('img').src = r.src;
  big.querySelector('.cap').innerHTML = `<b>${r.title}</b><span>${r.note}</span><em>${cur + 1} / ${REFS.length}</em>`;
  big.classList.add('on');
}
function build() {
  root = document.createElement('div'); root.id = 'gallery';
  root.innerHTML = `<div class="head"><b>참조 이미지</b><span>Codex 이미지 도구로 생성 · 클릭하면 크게</span><button class="x" title="닫기 (Esc)">✕</button></div><div class="grid"></div>
    <div class="big"><button class="nav prev" title="이전 (←)">‹</button><img alt=""><button class="nav next" title="다음 (→)">›</button><div class="cap"></div><button class="x" title="닫기 (Esc)">✕</button></div>`;
  const grid = root.querySelector('.grid');
  REFS.forEach((r, i) => {
    const c = document.createElement('figure');
    c.innerHTML = `<img loading="lazy" src="${r.src}" alt=""><figcaption><b>${r.title}</b><span>${r.note}</span></figcaption>`;
    c.onclick = () => show(i);
    grid.appendChild(c);
  });
  big = root.querySelector('.big');
  root.querySelector('.head .x').onclick = closeGallery;
  big.querySelector('.x').onclick = (e) => { e.stopPropagation(); big.classList.remove('on'); };
  big.querySelector('.prev').onclick = (e) => { e.stopPropagation(); show(cur - 1); };
  big.querySelector('.next').onclick = (e) => { e.stopPropagation(); show(cur + 1); };
  big.onclick = () => big.classList.remove('on');
  big.querySelector('img').onclick = (e) => e.stopPropagation();
  document.body.appendChild(root);
}
export function openGallery() { if (!root) build(); root.classList.add('on'); }
export function closeGallery() { if (!root) return; big.classList.remove('on'); root.classList.remove('on'); }
/** keyboard while it is open: Esc closes (the big view first), ←/→ step through the big view */
export function galleryKey(e) {
  if (e.code === 'Escape') { if (big.classList.contains('on')) big.classList.remove('on'); else closeGallery(); }
  else if (big.classList.contains('on') && e.code === 'ArrowRight') show(cur + 1);
  else if (big.classList.contains('on') && e.code === 'ArrowLeft') show(cur - 1);
  e.preventDefault();
}
