"""한자별 훈음 읽기 mp3 생성. 사용: python tools/make_audio.py  (edge-tts 필요: pip install edge-tts)
hanja.js 목록을 읽어 "학교 교, 학교 교. 학교." 처럼 훈음 두 번과 예시 단어를 읽는다.
파일 이름은 한자 코드(16진, 예: 校 → 6821.mp3). 이미 있는 파일은 건너뛴다."""
import asyncio, os, re, edge_tts

VOICE = "ko-KR-SunHiNeural"
ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "audio")


def items():
    src = open(os.path.join(ROOT, "hanja.js"), encoding="utf-8").read()
    return re.findall(r'\["(.)", "([^"]+)", "([^"]+)", "[^"]+", "([^"]+)"\]', src)


async def main():
    os.makedirs(OUT, exist_ok=True)
    for ch, hun, eum, word_ko in items():
        path = os.path.join(OUT, f"{ord(ch):x}.mp3")
        if os.path.exists(path):
            continue
        text = f"{hun} {eum}. {hun} {eum}. {word_ko}."
        await edge_tts.Communicate(text, VOICE, rate="-20%").save(path)
        print(ch, text, os.path.getsize(path), "bytes")


asyncio.run(main())
