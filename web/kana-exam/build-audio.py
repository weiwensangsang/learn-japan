"""Generate offline Japanese pronunciation clips from the checked kana targets.

Requires pyopenjtalk-plus==0.4.1.post9 and soundfile==0.14.0.
The Mei voice attribution is retained in audio/LICENSE-Mei.txt.
"""
import hashlib
import json
from pathlib import Path
import shutil

import numpy as np
import pyopenjtalk
import soundfile as sf

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "audio"


def spoken_kana(text):
    # Katakana avoids reinterpreting hiragana は/へ as grammatical particles.
    return "".join(chr(ord(c) + 0x60) if "ぁ" <= c <= "ゖ" else c for c in text)


def write_pcm(source, target):
    samples, rate = sf.read(source)
    assert rate == 48000
    # Low-pass before 2:1 downsampling; PCM WAV avoids codec dependencies.
    positions = np.arange(-31, 32, dtype=float)
    kernel = np.sinc(0.45 * positions) * np.hamming(63)
    kernel /= kernel.sum()
    samples = np.convolve(samples, kernel, mode="same")[::2]
    sf.write(target, np.clip(samples, -1, 1), 24000, subtype="PCM_16")


def main():
    OUTPUT.mkdir(exist_ok=True)
    lessons = json.loads((ROOT / "yugioh-lessons.json").read_text(encoding="utf-8"))
    manifest_path = ROOT / "audio-manifest.json"
    previous = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"clips": []}
    cached = {entry["cid"]: entry for entry in previous["clips"]}
    clips = []
    for index, item in enumerate(lessons, 1):
        target = OUTPUT / f'{item["cid"]}.ogg'
        old = cached.get(item["cid"], {})
        if not (target.exists() and old.get("kana") == item["kana"] and hashlib.sha256(target.read_bytes()).hexdigest() == old.get("sha256")):
            samples, rate = pyopenjtalk.tts(
                spoken_kana(item["kana"]), speed=0.9,
                use_read_as_pron=True, use_sudachi_kanji_yomi=False, predict_nani=False,
            )
            # HTS returns PCM-scale floats; normalize peaks instead of clipping.
            samples = samples / max(32768.0, float(np.max(np.abs(samples))) / 0.95)
            sf.write(target, samples, rate, format="OGG", subtype="VORBIS")
        info = sf.info(target)
        assert info.duration > 0.2 and info.channels == 1, item["kana"]
        pcm = target.with_suffix('.wav')
        if not (pcm.exists() and old.get("kana") == item["kana"] and hashlib.sha256(pcm.read_bytes()).hexdigest() == old.get("pcmSha256")):
            write_pcm(target, pcm)
        clips.append({"cid": item["cid"], "kana": item["kana"], "spokenKana": spoken_kana(item["kana"]), "file": f'audio/{target.name}', "seconds": round(info.duration, 3), "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "pcmFile": f'audio/{pcm.name}', "pcmSha256": hashlib.sha256(pcm.read_bytes()).hexdigest()})
        if index % 50 == 0:
            print(f"Generated {index}/{len(lessons)}", flush=True)
    voice_license = Path(pyopenjtalk.__file__).parent / "htsvoice" / "LICENSE_mei_normal.htsvoice"
    shutil.copyfile(voice_license, OUTPUT / "LICENSE-Mei.txt")
    manifest_path.write_text(json.dumps({"engine": "pyopenjtalk-plus 0.4.1.post9", "voice": "Mei (MMDAgent Project Team / Nagoya Institute of Technology)", "license": "CC BY 3.0", "licenseUrl": "https://creativecommons.org/licenses/by/3.0/", "source": "https://github.com/tsukumijima/pyopenjtalk-plus", "speed": 0.9, "clips": clips}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Complete: {len(clips)} clips, {sum((OUTPUT / Path(c['file']).name).stat().st_size for c in clips) / 1024 / 1024:.1f} MiB", flush=True)


if __name__ == "__main__":
    main()
