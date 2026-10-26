# content_gen

Генерация изображений и видео через GitHub Actions: `.github/workflows/generate-content.yml`.
Провайдеры: **Replicate** (изображения и видео) и **OpenAI** (только изображения).

## Настройка (один раз)

**Settings → Secrets and variables → Actions → New repository secret**:
- `REPLICATE_API_TOKEN` — с replicate.com (нужен для видео);
- `OPENAI_API_KEY` — если хотите изображения от OpenAI.

## Запуск

- **Вручную:** Actions → «Генерация изображений и видео» → Run workflow. Впишите промпт и выберите тип,
  провайдера и формат. Если оставить промпт пустым, выполнятся задания из `jobs_file`.
- **Пакетом:** положите или измените JSON в `content_gen/jobs/` и запушьте. Запустятся только изменённые файлы.

Результат появится в артефакте `content-run-N` на странице запуска: файлы и `manifest.json`.
Таблица с итогами выводится в Summary запуска.

## Формат заданий

```json
{
  "defaults": {"provider": "replicate", "aspect_ratio": "9:16"},
  "jobs": [
    {"name": "cover", "kind": "image", "count": 2, "prompt": "..."},
    {"name": "clip", "kind": "video", "model": "minimax/video-01", "prompt": "...",
     "input": {"prompt_optimizer": true}}
  ]
}
```

`model` — любая модель Replicate в виде `owner/name` (без версии). По умолчанию используются `black-forest-labs/flux-schnell`
и `minimax/video-01`, для OpenAI — `gpt-image-1`. В `input` можно передать дополнительные параметры
модели (например, `first_frame_image` для image-to-video). Они передаются как есть.

## Локально

```
python content_gen/generate.py content_gen/jobs/example.json          # нужны ключи в env
python content_gen/generate.py --prompt "..." --kind video --dry-run   # проверка без API
```
