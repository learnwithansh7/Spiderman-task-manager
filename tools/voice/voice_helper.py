#!/usr/bin/env python3
"""
voice_helper.py - Vosk-based offline wake-word detector for SpiderReminder.

Requirements:
- Python packages allowed: vosk and sounddevice only.
- 100% offline, zero cloud, zero audio recorded or logged to disk.
- Talks to Electron over JSON-lines on stdout.
- Accepts stdin commands: pause, resume, quit, threshold <n>, device <index>.
- Exits cleanly when stdin closes or parent dies.
"""

import sys
import os
import json
import time
import queue
import argparse
import threading

# Suppress Vosk Kaldi logs to stderr if desired, but keep stderr clean
try:
    from vosk import Model, KaldiRecognizer, SetLogLevel
    SetLogLevel(-1)  # Quiet down Kaldi C++ engine logs
except Exception as e:
    sys.stdout.write(json.dumps({
        "type": "error",
        "code": "OTHER",
        "message": f"Failed to import Vosk: {str(e)}"
    }) + "\n")
    sys.stdout.flush()
    sys.exit(1)

try:
    import sounddevice as sd
except Exception as e:
    sys.stdout.write(json.dumps({
        "type": "error",
        "code": "OTHER",
        "message": f"Failed to import sounddevice: {str(e)}"
    }) + "\n")
    sys.stdout.flush()
    sys.exit(1)


audio_queue = queue.Queue()
running = True
is_paused = False
current_threshold = 0.70
current_device = None


def emit(obj):
    try:
        sys.stdout.write(json.dumps(obj) + "\n")
        sys.stdout.flush()
    except Exception:
        pass


def get_available_devices():
    devices = []
    try:
        all_devs = sd.query_devices()
        for idx, dev in enumerate(all_devs):
            if dev.get("max_input_channels", 0) > 0:
                devices.append({
                    "id": idx,
                    "name": dev.get("name", f"Microphone {idx}"),
                    "channels": dev.get("max_input_channels", 1),
                    "default": (idx == sd.default.device[0])
                })
    except Exception as e:
        emit({"type": "error", "code": "OTHER", "message": f"Failed querying audio devices: {str(e)}"})
    return devices


def audio_callback(indata, frames, time_info, status):
    if status and status.input_overflow:
        pass
    if running and not is_paused:
        # indata is a memoryview of int16 bytes
        audio_queue.put(bytes(indata))


def parse_word_confidence(result_dict, target_words, threshold):
    """
    Examines the 'result' list in result_dict (from SetWords(True)).
    target_words is a tuple/list of words e.g. ['hey', 'spider'] or ['spider'].
    Returns (True, avg_confidence, phrase) if matches and meets threshold.
    """
    words_info = result_dict.get("result", [])
    if not words_info:
        return False, 0.0, ""

    n = len(target_words)
    for i in range(len(words_info) - n + 1):
        window = words_info[i:i + n]
        window_words = [w.get("word", "").lower() for w in window]
        if window_words == target_words:
            confs = [float(w.get("conf", 1.0)) for w in window]
            avg_conf = sum(confs) / len(confs)
            if avg_conf >= threshold:
                phrase = " ".join(target_words)
                return True, avg_conf, phrase
    return False, 0.0, ""


def stdin_reader():
    global running, is_paused, current_threshold, current_device
    while running:
        try:
            line = sys.stdin.readline()
            if not line:
                # Stdin closed (parent exited or crashed)
                running = False
                break
            cmd = line.strip()
            if not cmd:
                continue

            parts = cmd.split(maxsplit=1)
            action = parts[0].lower()

            if action == "quit":
                running = False
                break
            elif action == "pause":
                is_paused = True
            elif action == "resume":
                is_paused = False
                # Clear queue so backlog during pause doesn't trigger
                with audio_queue.mutex:
                    audio_queue.queue.clear()
            elif action == "threshold":
                if len(parts) > 1:
                    try:
                        current_threshold = float(parts[1])
                    except ValueError:
                        pass
            elif action == "device":
                if len(parts) > 1:
                    try:
                        dev_val = parts[1].strip()
                        current_device = int(dev_val) if dev_val.isdigit() else None
                    except Exception:
                        pass
            elif action == "get_devices":
                emit({"type": "devices", "list": get_available_devices()})
        except Exception:
            running = False
            break


def main():
    global running, is_paused, current_threshold, current_device

    parser = argparse.ArgumentParser(description="Vosk wake word helper for SpiderReminder")
    parser.add_argument("--model", type=str, required=True, help="Path to unpacked Vosk model directory")
    parser.add_argument("--threshold", type=float, default=0.70, help="Confidence threshold (0.0 to 1.0)")
    parser.add_argument("--also-spider", action="store_true", help="Also trigger on single word 'spider'")
    parser.add_argument("--device", type=int, default=None, help="Audio input device index")
    args = parser.parse_args()

    current_threshold = args.threshold
    current_device = args.device

    # Check model path
    if not os.path.exists(args.model):
        emit({"type": "error", "code": "MODEL_MISSING", "message": f"Vosk model path not found: {args.model}"})
        sys.exit(1)

    # Initialize Vosk model
    try:
        model = Model(args.model)
    except Exception as e:
        emit({"type": "error", "code": "MODEL_MISSING", "message": f"Failed to load Vosk model: {str(e)}"})
        sys.exit(1)

    # Construct restricted grammar
    if args.also_spider:
        grammar = ["hey spider", "spider", "[unk]"]
    else:
        grammar = ["hey spider", "[unk]"]

    recognizer = KaldiRecognizer(model, 16000, json.dumps(grammar))
    recognizer.SetWords(True)

    # Report available audio devices first
    devices = get_available_devices()
    emit({"type": "devices", "list": devices})

    if not devices:
        emit({"type": "error", "code": "NO_MIC", "message": "No microphone found on system."})

    # Start stdin reader thread
    t = threading.Thread(target=stdin_reader, daemon=True)
    t.start()

    # Audio input stream loop with auto-reconnection for device changes
    while running:
        stream = None
        try:
            stream = sd.RawInputStream(
                samplerate=16000,
                blocksize=4000,
                device=current_device,
                dtype="int16",
                channels=1,
                callback=audio_callback
            )
            with stream:
                emit({"type": "ready"})
                while running:
                    # Check for data
                    try:
                        data = audio_queue.get(timeout=0.2)
                    except queue.Empty:
                        continue

                    if is_paused:
                        continue

                    if recognizer.AcceptWaveform(data):
                        res_str = recognizer.Result()
                        try:
                            res_dict = json.loads(res_str)
                            # Check "hey spider"
                            matched, conf, phrase = parse_word_confidence(res_dict, ["hey", "spider"], current_threshold)
                            if not matched and args.also_spider:
                                matched, conf, phrase = parse_word_confidence(res_dict, ["spider"], current_threshold)

                            if matched:
                                emit({
                                    "type": "detected",
                                    "phrase": phrase,
                                    "conf": round(conf, 3),
                                    "ts": time.time()
                                })
                                # Clear audio queue after trigger to avoid double hits
                                with audio_queue.mutex:
                                    audio_queue.queue.clear()
                        except Exception:
                            pass
                    else:
                        # Partial result (optional to inspect if needed)
                        pass

        except sd.PortAudioError as pa_err:
            err_msg = str(pa_err).lower()
            if "permission" in err_msg or "access" in err_msg:
                emit({"type": "error", "code": "MIC_BLOCKED", "message": "Microphone blocked by Windows privacy settings."})
            elif "device unavailable" in err_msg or "invalid device" in err_msg or "unplug" in err_msg:
                emit({"type": "error", "code": "NO_MIC", "message": "Microphone was disconnected or unavailable."})
            else:
                emit({"type": "error", "code": "OTHER", "message": f"Audio stream error: {str(pa_err)}"})
            
            # Wait 2 seconds before trying to recover/reopen stream
            for _ in range(4):
                if not running:
                    break
                time.sleep(0.5)
        except Exception as e:
            emit({"type": "error", "code": "OTHER", "message": f"Unexpected error in audio loop: {str(e)}"})
            for _ in range(4):
                if not running:
                    break
                time.sleep(0.5)

    # Clean exit
    sys.exit(0)


if __name__ == "__main__":
    main()
