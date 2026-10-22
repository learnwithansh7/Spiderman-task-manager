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


# Dismiss phrases constant - editable to change phrase in future
DISMISS_PHRASES = ["okay spider", "ok spider"]

audio_queue = queue.Queue()
running = True
is_paused = False
current_mode = "idle"  # "idle" or "active"
current_threshold = 0.70
current_device = None
restart_stream_flag = False

# Recognizer references accessible globally for resets
idle_recognizer = None
active_recognizer = None


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
        # Prevent audio buffer accumulation drift: keep at most ~1 second (4 blocks)
        while audio_queue.qsize() > 4:
            try:
                audio_queue.get_nowait()
            except queue.Empty:
                break
        # indata is a memoryview of int16 bytes
        audio_queue.put(bytes(indata))


def parse_word_confidence(result_dict, target_words, threshold):
    """
    Examines the 'result' list in result_dict (from SetWords(True)).
    target_words is a tuple/list of words e.g. ['hey', 'spider'] or ['spider'].
    Verifies word matching, confidence threshold, speech duration, and inter-word timing.
    Returns (True, avg_confidence, phrase) if matches and meets criteria.
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

            # Two-word phrases: "hey spider", "okay spider", "ok spider"
            if n == 2:
                w1, w2 = window[0], window[1]
                w1_dur = float(w1.get("end", 0)) - float(w1.get("start", 0))
                w2_dur = float(w2.get("end", 0)) - float(w2.get("start", 0))
                gap = float(w2.get("start", 0)) - float(w1.get("end", 0))

                # Durations must be realistic human speech (not momentary click/pop)
                # and inter-word gap must be natural for a spoken phrase (< 0.65s)
                if w1_dur < 0.10 or w2_dur < 0.20 or gap > 0.65 or gap < -0.15:
                    continue

                # Both words must have genuine confidence
                if min(confs) < 0.60 or avg_conf < threshold:
                    continue

                phrase = " ".join(target_words)
                return True, avg_conf, phrase

            # Single-word phrase: "spider"
            elif n == 1:
                w1 = window[0]
                w1_dur = float(w1.get("end", 0)) - float(w1.get("start", 0))
                # Single-word requires at least 0.30s spoken length and stricter confidence (>= 0.85)
                # to prevent room noise, desk knocks, or breaths from causing false triggers
                single_threshold = max(0.85, threshold + 0.10)
                if w1_dur < 0.30 or avg_conf < single_threshold:
                    continue

                phrase = " ".join(target_words)
                return True, avg_conf, phrase

            else:
                if avg_conf >= threshold:
                    phrase = " ".join(target_words)
                    return True, avg_conf, phrase

    return False, 0.0, ""


def stdin_reader():
    global running, is_paused, current_mode, current_threshold, current_device, restart_stream_flag
    global idle_recognizer, active_recognizer
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
                if idle_recognizer:
                    idle_recognizer.Reset()
                if active_recognizer:
                    active_recognizer.Reset()
                # Clear queue so backlog during pause doesn't trigger
                with audio_queue.mutex:
                    audio_queue.queue.clear()
            elif action == "mode":
                if len(parts) > 1:
                    m = parts[1].strip().lower()
                    if m in ("idle", "active"):
                        current_mode = m
                        if idle_recognizer:
                            idle_recognizer.Reset()
                        if active_recognizer:
                            active_recognizer.Reset()
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
                        new_dev = int(dev_val) if (dev_val.isdigit() or (dev_val.startswith('-') and dev_val[1:].isdigit())) else None
                        if new_dev != current_device:
                            current_device = new_dev
                            restart_stream_flag = True
                    except Exception:
                        pass
            elif action == "get_devices":
                emit({"type": "devices", "list": get_available_devices()})
        except Exception:
            running = False
            break


def main():
    global running, is_paused, current_mode, current_threshold, current_device, restart_stream_flag
    global idle_recognizer, active_recognizer

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

    # Construct restricted idle grammar
    if args.also_spider:
        idle_grammar = ["hey spider", "spider", "[unk]"]
    else:
        idle_grammar = ["hey spider", "[unk]"]

    idle_recognizer = KaldiRecognizer(model, 16000, json.dumps(idle_grammar))
    idle_recognizer.SetWords(True)

    # Construct active mode grammar (dismiss phrases + hey spider so it's not marked unk)
    active_grammar = list(DISMISS_PHRASES) + ["hey spider", "[unk]"]
    active_recognizer = KaldiRecognizer(model, 16000, json.dumps(active_grammar))
    active_recognizer.SetWords(True)

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
        target_dev = current_device
        # Validate that target_dev actually supports input channels
        if target_dev is not None:
            try:
                dev_info = sd.query_devices(target_dev)
                if dev_info.get("max_input_channels", 0) <= 0:
                    emit({"type": "error", "code": "INVALID_DEVICE", "message": f"Device {target_dev} has 0 input channels, falling back to default mic."})
                    target_dev = None
                    current_device = None
            except Exception as dev_err:
                emit({"type": "error", "code": "INVALID_DEVICE", "message": f"Error querying device {target_dev}: {str(dev_err)}, falling back to default mic."})
                target_dev = None
                current_device = None

        restart_stream_flag = False
        try:
            stream = sd.RawInputStream(
                samplerate=16000,
                blocksize=4000,
                device=target_dev,
                dtype="int16",
                channels=1,
                callback=audio_callback
            )
            with stream:
                emit({"type": "ready", "device": target_dev})
                while running and not restart_stream_flag:
                    # Check for data
                    try:
                        data = audio_queue.get(timeout=0.2)
                    except queue.Empty:
                        continue

                    if is_paused:
                        continue

                    rec = active_recognizer if current_mode == "active" else idle_recognizer

                    if rec.AcceptWaveform(data):
                        res_str = rec.Result()
                        try:
                            res_dict = json.loads(res_str)
                            if current_mode == "active":
                                # Check dismiss phrases
                                for phrase in DISMISS_PHRASES:
                                    target_words = phrase.split()
                                    matched, conf, matched_phrase = parse_word_confidence(res_dict, target_words, current_threshold)
                                    if matched:
                                        emit({
                                            "type": "command",
                                            "name": "dismiss",
                                            "phrase": matched_phrase,
                                            "conf": round(conf, 3),
                                            "ts": time.time()
                                        })
                                        rec.Reset()
                                        with audio_queue.mutex:
                                            audio_queue.queue.clear()
                                        break
                                # In active mode, recognized "hey spider" or others are ignored
                            else:
                                # IDLE mode: exact existing wake word logic
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
                                    rec.Reset()
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
            elif "device unavailable" in err_msg or "invalid device" in err_msg or "unplug" in err_msg or "channel" in err_msg:
                emit({"type": "error", "code": "NO_MIC", "message": "Microphone was disconnected or invalid device selected. Falling back to default."})
                current_device = None
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
