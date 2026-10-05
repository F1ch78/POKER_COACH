# crowd_story_video

Пайплайн: `input/video.mp4` → YOLO (люди) → ByteTrack (ID) → сшивка потерянных ID → отбор лучших людей → 39 подписей из `stories.json` → Pillow-текст над головой → FFmpeg → `output/final.mp4`.

```
pip install -r requirements.txt   # нужен ffmpeg в PATH
# 1. сгенерируй исходник по prompts/source_video_prompt.md, положи в input/video.mp4
python main.py                    # настройки в config.json
```

- Результат трекинга кэшируется в `output/tracks.json` (удали, чтобы пересчитать).
- Подписи: `stories.json` (порядок = приоритет; самым хорошо отслеживаемым людям достаются первые).
- Подписи появляются с 0.5 до 11 с, с 14 с всё исчезает и появляется «Everyone has a story.»
- Если людей находится мало или много: `conf`, `imgsz`, `min_box_h`, `min_spacing_px` в `config.json`.
