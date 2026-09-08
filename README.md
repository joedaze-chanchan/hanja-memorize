# 한자 배우기 (Hanja Memorize)

모바일 브라우저에서 혼자 한자를 외우는 교육 웹앱. `영어 교육`(알파벳 따라쓰기) 앱과 같은 구조로, 빌드 도구 없이 정적 파일만으로 동작한다.

메뉴: 1 한자 따라쓰기(획순 시범·따라쓰기) · 2 한자 외우기(훈음 고르기 → 따라 쓰기 → 한자 고르기) · 3 한자 시험(20문제, 기록판)

범위: 한자능력검정시험 8급 50자 + 7급Ⅱ 50자 = 100자.

배포: https://joedaze-chanchan.github.io/hanja-memorize/

## 실행
```
python -m http.server 8767
```
후 폰 또는 브라우저에서 `http://localhost:8767` 접속. (ES 모듈을 쓰므로 file:// 로는 열리지 않는다.)

## 테스트
```
npm test
```

## 구조
| 파일 | 역할 |
|---|---|
| `index.html`, `style.css` | 참여자/대문/한자 고르기/연습/외우기/시험 화면 |
| `hanja.js` | 한자 목록(훈·음·급수·예시 단어) + 획 데이터 결합 |
| `strokes.js` | 획 중심선 데이터 (자동 생성, 100×100 좌표) |
| `tracer.js` | 획 판정 엔진 (영어 앱과 동일, 순수 함수) |
| `pad.js` | 외우기 화면의 쓰기 판 |
| `app.js` | 화면 전환, 연습 캔버스 렌더링, 시범 애니메이션, 터치 처리, 발음 |
| `quiz-logic.js` | 4지선다 보기, 외우기 순서, 시험 문제·점수 (순수 함수) |
| `memorize.js`, `exam.js` | 외우기·시험 진행과 화면 |
| `progress.js` | 학습 기록·설정·최고 점수·외우기 기록·기록판 (localStorage) |
| `profiles.js` | 참여자 프로필, 참여자별 저장소, 이어하기 |
| `tests/*.test.js` | 데이터·판정·문제 생성 테스트 (node:test) |
| `audio/<코드>.mp3` | 훈음 읽기 (tools/make_audio.py, edge-tts 한국어) |

설계 문서: `docs/superpowers/specs/2026-09-08-hanja-memorize-design.md`

## 한자 추가
1. `hanja.js`의 `RAW`에 `[한자, 훈, 음, 예시 단어, 예시 단어 읽기]`를 넣는다.
2. `PYTHONIOENCODING=utf-8 python tools/fetch_strokes.py` — 획 데이터를 받아 `strokes.js`를 갱신한다.
3. `PYTHONIOENCODING=utf-8 python tools/make_audio.py` — 훈음 mp3를 만든다 (`pip install edge-tts`).
4. `npm test`로 빠진 것이 없는지 확인한다.

## 획 데이터 출처
[hanzi-writer-data](https://github.com/chanind/hanzi-writer-data) (Make Me a Hanzi 기반, Arphic Public License)의 획 중심선(medians)을 변환해 쓴다.
중국식 자형·획순 기준이라 한국 교과서와 조금 다를 수 있다. 敎는 데이터에 한국식 자형이 없어 教로 표기한다.
