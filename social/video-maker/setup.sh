#!/usr/bin/env bash
# One-time setup in a fresh container. Run from social/video-maker/.
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm install --silent
python3 -c "import kokoro_onnx, soundfile" 2>/dev/null || python3 -m pip install -q kokoro-onnx soundfile
mkdir -p tts
for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  [ -f tts/$f ] || curl -sSL -o tts/$f https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$f
done
echo "ready: KOKORO_DIR=$(pwd)/tts python3 make.py videos/<id>.json"
