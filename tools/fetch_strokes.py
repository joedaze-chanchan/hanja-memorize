"""hanja.js 목록의 한자 획 데이터를 받아 strokes.js를 만든다. 사용: python tools/fetch_strokes.py

출처: hanzi-writer-data (Make Me a Hanzi 기반, Arphic Public License). 각 획의 중심선(medians)을
0~100 좌표계(y 아래 방향)로 바꾼다. 원본 좌표는 x 0~1024, y -124~900(위 방향).
한자를 추가하면 hanja.js에 넣고 다시 실행한다. 이미 받은 글자는 건너뛴다(전부 다시 받으려면 strokes.js 삭제).
"""
import json, os, re, sys, urllib.parse, urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..")
CDN = "https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/{}.json"
OUT = os.path.join(ROOT, "strokes.js")


def chars_in_hanja_js():
    src = open(os.path.join(ROOT, "hanja.js"), encoding="utf-8").read()
    return re.findall(r'\["(.)", "[^"]+", "[^"]+", "[^"]+", "[^"]+"\]', src)


def existing():
    if not os.path.exists(OUT):
        return {}
    src = open(OUT, encoding="utf-8").read()
    m = re.search(r"export const STROKES = (\{.*\});", src, re.S)
    return json.loads(m.group(1)) if m else {}


def convert(medians):
    out = []
    for stroke in medians:
        pts = []
        for x, y in stroke:
            px = round(x / 1024 * 100, 1)
            py = round((900 - y) / 1024 * 100, 1)
            if not pts or pts[-1] != [px, py]:
                pts.append([px, py])
        if len(pts) < 2:
            pts.append([pts[0][0] + 0.5, pts[0][1]])
        out.append(pts)
    return out


def main():
    data = existing()
    missing = []
    for ch in chars_in_hanja_js():
        if ch in data:
            continue
        url = CDN.format(urllib.parse.quote(ch))
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                j = json.loads(r.read().decode("utf-8"))
        except Exception as e:  # noqa: BLE001
            print("없음:", ch, e, file=sys.stderr)
            missing.append(ch)
            continue
        data[ch] = convert(j["medians"])
        print(ch, len(data[ch]), "획")
    body = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    body = body.replace("],[[", "],\n  [[").replace('"],"', '"],\n  "')
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("// 자동 생성: tools/fetch_strokes.py (hanzi-writer-data, Make Me a Hanzi 기반). 직접 고치지 말 것.\n")
        f.write("// 획 = 중심선 점 목록, 좌표 0~100, y는 아래 방향. 획순은 배열 순서.\n")
        f.write("export const STROKES = " + body + ";\n")
    print("총", len(data), "자", "/ 없음:", "".join(missing) or "-")


main()
