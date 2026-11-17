"""Build flight effects from credited recordings, with no generated oscillators.

Usage: python3 tools/prepare-flight-audio.py rocket.wav jet.wav warp.wav
See sfx/pack/engine/CREDITS.txt for source URLs and edits.
"""
import array
import math
from pathlib import Path
import sys
import wave


def read(path):
    with wave.open(path) as w:
        channels, width, rate = w.getnchannels(), w.getsampwidth(), w.getframerate()
        data = w.readframes(w.getnframes())
    samples = [int.from_bytes(data[i:i + width], 'little', signed=True) / 2 ** (width * 8 - 1)
               for i in range(0, len(data), width)]
    return rate, [samples[c::channels] for c in range(channels)]


def loop(data, count):
    return [a[count:-count] + [a[-count + i] * (1 - i / count) + a[i] * i / count
                              for i in range(count)] for a in data]


def save(name, channels, rate=48000):
    scale = min(1, 0.9 / max(abs(v) for c in channels for v in c))
    pcm = array.array('h', (round(v * scale * 32767) for frame in zip(*channels) for v in frame))
    if sys.byteorder != 'little':
        pcm.byteswap()
    out = Path(__file__).resolve().parent.parent / 'sfx/pack/engine' / name
    with wave.open(str(out), 'wb') as w:
        w.setparams((len(channels), 2, rate, 0, 'NONE', 'not compressed'))
        w.writeframes(pcm.tobytes())


if __name__ == '__main__':
    rocket_rate, rocket = read(sys.argv[1])
    jet_rate, jet = read(sys.argv[2])
    warp_rate, warp = read(sys.argv[3])
    assert rocket_rate == warp_rate == 48000
    # Keep the six-second stereo rumble; add air from the stable takeoff section.
    jet = loop([jet[0][int(jet_rate * .4):int(jet_rate * 1.8)]], int(jet_rate * .12))[0]
    thrust = []
    for channel in rocket:
        mixed = []
        for i, value in enumerate(channel):
            pos = i * jet_rate / rocket_rate
            j, f = int(pos) % len(jet), pos % 1
            air = jet[j] * (1 - f) + jet[(j + 1) % len(jet)] * f
            mixed.append(value * .85 + air * .65)
        thrust.append(mixed)
    save('jet-thrust.wav', loop(thrust, 2400))
    # WarpDrive_02: immediate attack and a falling tail; remove the silent end.
    warp = [c[:int(warp_rate * 1.9)] for c in warp]
    for c in warp:
        for i in range(len(c)):
            c[i] *= min(1, i / 48, (len(c) - 1 - i) / 4800)
    save('warp-dash.wav', warp)
