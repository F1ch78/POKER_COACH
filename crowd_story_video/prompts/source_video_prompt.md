# Промпт для исходного видео (этап 1)

Модель: FastVideo, VSA DataFree, 1300-step / 4-step, int8 convrot (image-to-video).
Дистиллированная 4-шаговая модель лучше всего работает с коротким, плотным описанием
на естественном английском, без тегов `@Image` и без длинных списков запретов.
Загрузи фотографию как первый кадр (conditioning image).

## Prompt

```
Photorealistic real camera footage, high vertical view from a high-rise window looking down a long city avenue at early evening, blue-pink sky, warm street lights and car headlights. Camera is locked off with only a very slow, smooth forward drift. Cars drive steadily along the avenue in both directions with glowing headlights and taillights. Many small groups of pedestrians walk along both sidewalks and cross side streets at a calm natural pace. Buildings, road markings and architecture stay perfectly stable and identical to the first frame. Documentary look, natural motion blur, 24fps.
```

## Negative prompt (если поле есть)

```
text, captions, logos, watermark, camera shake, zoom, rotation, cut, transition, time-lapse, morphing buildings, melting people, extra limbs, flicker, blur, low quality
```

## Параметры

- 9:16, 720x1280, 15 с (если модель держит меньше — генерируй 2 клипа по 7–8 с и склей ffmpeg `concat`, камера с одинаковым дрейфом).
- Фиксированный seed, потом сравни 2–3 seed: ищем ровно стоящие здания и непрерывный поток людей.
- Люди должны быть различимыми и не сливаться: чем крупнее и чётче фигуры, тем лучше трекинг.
- Сохрани результат как `input/video.mp4`.
