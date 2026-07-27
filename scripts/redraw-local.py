#!/usr/bin/env python3
"""Перерисовка фото Unsplash в рисовашки локальной моделью (Draw Things).
Генерит PNG → жмёт в webp → кладёт рядом с исходником (файлы сервера подкладываем отдельно).
Использование: redraw.py words.tsv out_dir  (строки: id<TAB>слово<TAB>перевод<TAB>url)"""
import base64, json, subprocess, sys, urllib.request, os

DT = "http://127.0.0.1:7860/sdapi/v1/txt2img"
OLLAMA = "http://127.0.0.1:11434/api/generate"


def to_english(word_ru: str, word_es: str) -> str:
    """Локальная модель картинок понимает только английский: русское слово она
    просто НАПИШЕТ буквами. Поэтому сначала переводим понятие на английский
    через Ollama (бесплатно)."""
    body = json.dumps({
        "model": "llama3.1:8b",
        "prompt": (f'Translate this word to English. Answer with ONE English word only, nothing else. '
                   f'Russian: "{word_ru}" (Spanish: "{word_es}")'),
        "stream": False,
        "options": {"temperature": 0},
    }).encode()
    req = urllib.request.Request(OLLAMA, data=body, headers={"Content-Type": "application/json"})
    ans = json.load(urllib.request.urlopen(req, timeout=120))["response"].strip()
    return ans.strip(' ."\'').split("\n")[0].split()[0] if ans else word_es

def prompt_for(concept: str) -> str:
    return (f"Simple cheerful flat vector illustration for a children's flashcard. "
            f"Show clearly the concept: \"{concept}\". Cute minimalist cartoon, bright friendly colors, "
            f"plain light background, one centered object or simple scene, thick clean outlines, kindergarten style. "
            f"IMPORTANT: absolutely NO text, NO letters, NO words, NO signs, NO captions in any language — only the drawing.")

def generate(concept: str) -> bytes:
    body = json.dumps({
        "prompt": prompt_for(concept),
        "negative_prompt": "text, letters, words, watermark, signature, blurry, deformed, photo, photography",
        "width": 512, "height": 512, "steps": 4, "cfg_scale": 2,
    }).encode()
    req = urllib.request.Request(DT, data=body, headers={"Content-Type": "application/json"})
    data = json.load(urllib.request.urlopen(req, timeout=600))
    imgs = data.get("images") or []
    if not imgs:
        raise RuntimeError("пустой ответ Draw Things")
    return base64.b64decode(imgs[0].split(",")[-1])

def main():
    rows = [l.rstrip("\n").split("\t") for l in open(sys.argv[1]) if l.strip()]
    out_dir = sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    for wid, word, ru, url in rows:
        png = os.path.join(out_dir, f"word_{wid}.png")
        webp = os.path.join(out_dir, f"word_{wid}.webp")
        try:
            concept = to_english(ru, word)
            open(png, "wb").write(generate(concept))
            subprocess.run(["cwebp", "-quiet", "-q", "82", png, "-o", webp], check=True)
            os.remove(png)
            print(f"OK {wid} {word} ({ru} -> {concept}) -> {webp}", flush=True)
        except Exception as e:
            print(f"ERR {wid} {word}: {e}", flush=True)

if __name__ == "__main__":
    main()
