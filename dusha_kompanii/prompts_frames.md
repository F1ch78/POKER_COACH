# ДУША КОМПАНИИ — промты для генерации кадров

По раскадровке [storyboard_motion.md](storyboard_motion.md). Номера кадров совпадают с раскадровкой.

**Модель: Nano Banana Pro.** Держит одного персонажа по референсам (до 14 картинок) и строгий стиль на длинной серии. Кадры станут исходниками для анимации, поэтому качество важнее скорости.

## Как работать

1. **Референсы.** К каждому промту с Тузиком прикладывай лист стикеров и кадр из анимационного теста. Когда утвердишь модель-лист 0.1, прикладывай и его — это главный якорь.
2. **Порядок.** Сначала 0.1 → 0.4 (персонаж, позы, люди, участок), потом кадры по порядку. Если персонаж поплыл, заново приложи 0.1 и сгенерируй ещё раз, а не правь промт.
3. **Текст.** Кадры генерируются без надписей. Где по раскадровке будет табличка или слово, в промте стоит пустая табличка или свободное место. Кириллицу и её анимацию делаем в моушне — так буквы будут чистыми и живыми.
4. **Движение.** Motion blur, тряску и пролёты камеры в промты не пишем: в статичной картинке они только портят кадр. Всё это добавляется при анимации.
5. **Слои для параллакса.** Утвердил кадр — сгенерируй к нему чистый фон: тот же промт, но вместо абзаца про Тузика и людей допиши `The same scene and framing as an empty environment plate, only the set and props.` Персонажа для анимации берём из листа поз 0.2.

Каждый промт самодостаточный: копируешь блок целиком.

---

## 0. Подготовка

### 0.1 Модель-лист Тузика
Тузик в векторном стиле фильма: 4 ракурса и 6 эмоций со стикеров.

```
Character model sheet of Tuzik the dog from the attached reference images, redrawn as a flat 2.5D vector character for a motion-design short film. Tuzik is a small short-haired cream-white dog with a compact bean-shaped body, an oversized glossy black nose with a white highlight, big round dark eyes with two catchlights and pinkish eyelids, large pointed upright ears with brown edges and pink insides, a thin white tail and expressive eyebrows. Layout on a plain warm cream background: the top row shows him standing on four legs in front view, three-quarter view, side view and back view; the bottom row shows six head close-ups with expressions: curious head tilt, smug half-closed eyes, happy with tongue out, deadpan side-eye, shocked with mouth wide open, teary sad eyes with flattened ears. Crisp flat colour shapes, fine paper grain, a soft drop shadow under each pose, identical proportions in every pose. Horizontal 16:9 format.
```

### 0.2 Лист поз Тузика
Все позы фильма на однотонном фоне — исходники для вырезки и анимации.

```
Pose sheet of Tuzik the dog from the attached reference sheet, flat 2.5D vector style with fine paper grain, every pose separate with generous spacing on a solid flat medium blue background (#2F6BFF) for easy cut-out. Tuzik is a small short-haired cream-white dog with a compact bean-shaped body, an oversized glossy black nose with a white highlight, big round dark eyes with two catchlights and pinkish eyelids, large pointed upright ears with brown edges and pink insides, and a thin white tail. Nine poses in a 3x3 grid: sleeping curled up with a round belly; sneaking low on bent legs with a plain amber bottle in his teeth and tail tucked; strutting proudly with chest puffed, ears spread wide and smug squint; lying on his back with paws in the air; sitting and begging with one front paw raised; standing on hind legs reaching up; lying with chin on paws and flattened ears; sitting upright on his haunches holding an acoustic guitar twice his size across his lap; close-up winking with one eye. Identical proportions and colours in every pose. Square 1:1 format.
```

### 0.3 Люди
Валера, Оля и Димон целиком (для финала) и их «опознавательные» ноги (для всего дня).

```
Cast sheet for a flat 2.5D vector motion-design short film, fine paper grain, soft drop shadows, plain warm cream background. Three characters standing full-body in a row, each with a simple round head, dot eyes and minimal features: Valera, a man about 50 with a round belly, grey moustache, white panama hat, faded blue polo shirt, khaki shorts, grey socks in brown leather sandals, hairy forearms and an old steel wristwatch; Olya, a young woman about 25 with a chestnut ponytail, a yellow sundress, white canvas sneakers and a thin silver bracelet; Dimon, a man about 30 with a short dark beard, a backward black cap, a black t-shirt, rolled-up dark jeans, barefoot with a small anchor tattoo on his left ankle. Below each character, a close-up of their feet and lower legs from knee level, exactly as they will appear in the film. Horizontal 16:9 format.
```

### 0.4 Карта участка
Весь участок одним кадром: где стол, кусты, мангал, кострище. В фильме такого плана нет, это схема для раскладки сцен.

```
Wide elevated three-quarter view of a Russian dacha garden plot in late July at midday, flat 2.5D vector illustration built like a layered paper diorama with fine paper grain and soft drop shadows between layers. A long wooden table with a red-and-white checked tablecloth and benches under a big apple tree, unlit string lights hanging from the tree to a small wooden house, a small brick barbecue grill, a lawn with daisies, dense blackcurrant bushes along a weathered wooden plank fence at the far side, and a fire pit ring of logs near the house. The plot is empty, ready for the party. Hard midday sun, 5600K, short crisp shadows. Palette: cream #F4E9D8, grass #7FB069, tablecloth red #D6453D, sky #BFE0EE. Horizontal 16:9 format.
```

---

## Сцена 1. Следуем за бутылкой

### 1.1 Стол сверху
Строго сверху: скатерть, еда, руки; рука Валеры уносит бутылку вниз.

```
Strict top-down flat-lay view of a long garden table covered with a red-and-white checked tablecloth at midday. On the table: paper plates with grilled shashlik skewers, sliced cucumbers and tomatoes, bread, glasses and four plain amber glass bottles with blank cream labels. Several hands reach in from the frame edges; a hairy man's hand with an old steel wristwatch lifts one bottle toward the bottom edge of the frame. Out-of-focus apple leaves float over the top corners as the nearest layer. Hard midday sun, 5600K, short crisp shadows, dappled leaf-shaped light spots on the tablecloth. Palette: cream #F4E9D8, tablecloth red #D6453D, leaf green #7FB069, amber #C9861A. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows separating the depth layers. Warm, witty, contemporary editorial look with clean readable silhouettes. Vertical 9:16 format.
```

### 1.2 Под скатертью
Спящий Тузик, рука ставит бутылку у носа, лес ног.

```
Worm's-eye view from 40 cm above the grass under a long garden table. The red-and-white checked tablecloth hangs along the top of the frame and glows warmly like a softbox. Foreground: a soft-focus wooden bench leg on the left. Midground: Tuzik sleeps curled up in the grass with a round full belly beside a gnawed bone and an empty paper plate, while a hairy man's hand with an old steel wristwatch sets a plain amber bottle with a blank label right next to his nose. Tuzik is the dog from the attached reference sheet: a small short-haired cream-white dog with a compact bean-shaped body, an oversized glossy black nose with a white highlight, big round dark eyes with pinkish eyelids, large pointed upright ears with brown edges and pink insides, and a thin white tail; his face and proportions stay identical to the reference, translated into flat vector shapes. Background: a forest of legs cropped at the knees by the tablecloth — grey socks in brown sandals, white canvas sneakers, bare feet with a small anchor tattoo on the ankle — and a bright sunny opening of lawn at the far end. Warm diffused light under the cloth, cool bright daylight in the opening behind. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows separating the depth layers. Vertical 9:16 format.
```

### 1.3 Капля
Макро: капля висит на стекле, в ней отражается спящий Тузик, внизу его нос.

```
Extreme close-up macro shot: the curved surface of a cold amber glass bottle fills most of the frame, covered in condensation. One big water drop hangs at the lower edge of the glass, and inside the drop an upside-down reflection of a sleeping little white dog is visible. In the lower part of the frame waits the tip of an oversized glossy black dog nose with a white highlight, belonging to Tuzik, the small cream-white dog from the attached reference sheet, eyes still closed. Very shallow depth of field: the drop is in sharp focus, the glass edges and grass dissolve into soft blur. Warm diffused light filtered through a red-and-white checked cloth above, amber glow through the glass. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

### 1.3б Глаз
Капля разбилась о нос, один глаз открылся.

```
Extreme close-up of Tuzik's face in profile at grass level under a table: a water drop has just splashed on his oversized glossy black nose, tiny droplets flying, and one big round dark eye snaps open with a bright catchlight while the other stays closed. Tuzik is the small short-haired cream-white dog from the attached reference sheet, with pinkish eyelids and large pointed ears with brown edges and pink insides; his face stays identical to the reference, translated into flat vector shapes. Warm diffused light glowing through a red-and-white checked tablecloth above, soft blurred grass. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

---

## Сцена 2. Операция

### 2.1 Колонна
POV Тузика: бутылка как колонна храма, сияет.

```
Extreme low angle from grass level, worm's-eye view looking up: a plain amber glass bottle with a blank label towers in the center of the frame like a temple column, foam bubbling over its neck and a star-shaped highlight on the glass. Behind it, out of focus, a man's feet in grey socks and brown sandals tap on the grass. The edge of a red-and-white checked tablecloth glows warm above. The bottle catches a strong amber backlight from a bright lawn opening behind it, while the rest of the frame sits darker inside a soft vignette, so the bottle glows like a treasure. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows separating the depth layers. Vertical 9:16 format.
```

### 2.2 Брови
Крупно: Тузик принюхался, брови вверх — решение принято.

```
Close-up of Tuzik in three-quarter view under a garden table, nostrils flared mid-sniff, eyebrows raised high in a sly moment of realisation, eyes glancing sideways at a plain amber bottle standing right beside his muzzle. Tuzik is the dog from the attached reference sheet: a small short-haired cream-white dog with an oversized glossy black nose with a white highlight, big round dark eyes with two catchlights and pinkish eyelids, large pointed upright ears with brown edges and pink insides; his face stays identical to the reference, translated into flat vector shapes. Background: out-of-focus legs cropped at the knees and the glowing hem of a red-and-white checked tablecloth. Warm diffused light, shallow depth of field. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

### 2.3 Маршрут
Газон как карта спецоперации: пунктир к кустам, Тузик крадётся, мимо идут ноги с шампурами.

```
High angle looking down the length of a sunny lawn in deep perspective: in the bottom foreground hangs the edge of a red-and-white checked tablecloth, and in the far background stands a weathered wooden plank fence with dense blackcurrant bushes. A hand-drawn white dotted route line runs across the grass from the table to the bushes and ends in a white X target mark beside them. Halfway along the line, Tuzik sneaks low on bent legs with a plain amber bottle in his teeth, tail tucked, one front paw frozen in the air, while a guest's legs cropped at the knees walk past him carrying metal shashlik skewers. Tuzik is the small short-haired cream-white dog from the attached reference sheet, with an oversized glossy black nose, big round dark eyes and large pointed ears with brown edges; his proportions stay identical to the reference, translated into flat vector shapes. Hard midday sun, 5600K, short shadows directly under the figures. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows separating the depth layers. Vertical 9:16 format.
```

---

## Сцена 3. Буль и титр

### 3.1 Буль
Кусты, из листвы поднимаются янтарные пузыри; верх кадра свободен под буквы «БУЛЬ».

```
Frontal medium view of a dense blackcurrant bush in the center of the frame, with clusters of glossy black berries and trembling leaves, a weathered wooden plank fence behind it and soft clouds in a pale blue sky above. Amber-gold bubbles of different sizes float up out of the leaves into the sky, glowing in the backlight. The leaves are lit from behind by the midday sun, translucent green with visible veins. The upper half of the frame is clear open sky, reserved for animated typography. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows separating the depth layers. Vertical 9:16 format.
```

### 3.2 Титр
Пузыри собрались над кустами в пенную полосу — место под название.

```
The same blackcurrant bush and weathered plank fence at midday, viewed frontally. In the upper half of the frame, above the bush, a large cluster of foamy white-and-amber bubbles has gathered into a wide horizontal band like beer foam floating in the sky, with soft foam drips running down from it. A single black berry falls from a branch. Backlit translucent leaves, pale blue sky with soft clouds. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

Если хочешь увидеть стиль титра прямо в кадре, допиши в конец: `add Russian text: ДУША КОМПАНИИ made of foamy white-and-amber bubble letters in the upper half`. Для финального ролика титр всё равно собираем шрифтом в моушне.

---

## Сцена 4. Вернулся

### 4.1 Походка
Тузик выходит из кустов навеселе: грудь колесом, уши врозь, пустая бутылка в зубах.

```
Low angle from grass level: Tuzik struts out of a blackcurrant bush toward the camera across a sunny lawn, chest puffed out, ears spread wide to the sides, eyes in a smug half-closed squint, tail wagging, an empty amber bottle swinging in his teeth. The horizon is tilted by 5 degrees. Tuzik is the dog from the attached reference sheet: a small short-haired cream-white dog with a compact bean-shaped body, an oversized glossy black nose with a white highlight, big round dark eyes with pinkish eyelids, large pointed ears with brown edges and pink insides, and a thin white tail; his face and proportions stay identical to the reference, translated into flat vector shapes. Background, slightly out of focus: the long garden table with a red-and-white checked tablecloth and unlit string lights hanging above it. Warm midday sun at 1 pm, short shadows. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows separating the depth layers. Vertical 9:16 format.
```

### 4.2 Последняя капля
Под столом: рука переворачивает пустую бутылку, падает одна капля; сверху пустая табличка.

```
Worm's-eye view from 40 cm above the grass under a long garden table, the red-and-white checked tablecloth glowing warmly above. A hairy man's hand with an old steel wristwatch reaches down from the top edge holding an empty amber bottle upside down, and one last drop falls from its neck toward a small dent in the grass where the bottle stood. A blank wooden sign hangs from two strings at the top of the frame, reserved for a line of dialogue. Background: legs cropped at the knees — grey socks in brown sandals, white canvas sneakers — and a bright sunny opening of lawn at the far end. Warm diffused light under the cloth. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows separating the depth layers. Vertical 9:16 format.
```

### 4.3 Косточка
Рука нашла под столом только кость; в глубине Тузик валяется на спине.

```
Worm's-eye view under a long garden table: the hem of the red-and-white checked tablecloth is lifted on the right, letting a warm beam of sunlight full of floating dust into the shade. In the soft-focus foreground, a hairy man's hand with an old steel wristwatch holds up a gnawed bone in confusion. Far in the background, framed by the bright opening of the lawn and in sharp focus, Tuzik rolls happily on his back in the grass with all four paws in the air. Tuzik is the small short-haired cream-white dog from the attached reference sheet, with an oversized glossy black nose and large pointed ears with brown edges; his proportions stay identical to the reference, translated into flat vector shapes. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows separating the depth layers. Vertical 9:16 format.
```

---

## Сцена 5. Весь день

### 5.1 Кайф
Сверху: Тузик на спине в ромашках, язык наружу, сердечки.

```
Top-down view straight down onto a sunny lawn dotted with daisies: Tuzik lies on his back in the grass, tongue out, eyes squinting with joy, small pink heart shapes floating above him, a white butterfly fluttering away from his nose. Tuzik is the dog from the attached reference sheet: a small short-haired cream-white dog with a compact bean-shaped body, an oversized glossy black nose with a white highlight, big round dark eyes, large pointed ears with brown edges and pink insides, and a thin white tail; his face stays identical to the reference, translated into flat vector shapes. Dappled apple-tree shadows on the grass. Bright midday light, 5600K. Palette: cream, fresh green #7FB069, soft pink accents. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

### 5.2 Гипноз
У мангала: Тузик не сводит глаз с бутылки в руке Валеры.

```
Low angle beside a small brick barbecue grill with smoking shashlik skewers: Tuzik sits upright staring intently up at a plain amber bottle held in a man's hairy hand with an old steel wristwatch; the man is visible only from the waist down, in khaki shorts, grey socks and brown sandals. Tuzik's head is tilted to follow the bottle, his big dark eyes locked on it, and a faint white dotted arc traces the bottle's path through the air. Tuzik is the small short-haired cream-white dog from the attached reference sheet, with an oversized glossy black nose and large pointed ears with brown edges and pink insides; his face stays identical to the reference, translated into flat vector shapes. Early afternoon sun, 5000K, grill smoke drifting across the frame. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows separating the depth layers. Vertical 9:16 format.
```

### 5.3 Сосиска
Лапа на колене у Оли, вместо пива сосиска; Тузик с каменной мордой кладёт её на траву.

```
Medium close-up at dog height on a lawn: Tuzik, with a deadpan side-eye expression, places a sausage onto the grass with his mouth, one front paw still resting on a young woman's knee. She is visible from the knees down — bare shins, the hem of a yellow sundress, white canvas sneakers — and her slim hand with a thin silver bracelet holds a plain amber bottle up and away. A blank pastel sign with a small heart hangs from two strings at the top of the frame, reserved for dialogue. Tuzik is the small short-haired cream-white dog from the attached reference sheet, with an oversized glossy black nose, big round dark eyes and large pointed ears with brown edges; his face stays identical to the reference, translated into flat vector shapes. Afternoon sun, 4800K, slightly longer shadows. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

### 5.4 Тара
Тузик сидит у босых ног Димона как у барной стойки; сад на секунду превращается в бар.

```
Tuzik sits upright and patient like a regular at a bar counter, an empty amber bottle placed on the grass in front of a man's bare feet with a small anchor tattoo on the left ankle and rolled-up dark jeans; the man is visible from the knees down. Behind them the garden has turned into a cosy bar for a moment: a dark wall with wooden shelves of glowing bottles and a blank glowing neon sign frame, reserved for a word. Tuzik is the small short-haired cream-white dog from the attached reference sheet, with an oversized glossy black nose, big round dark eyes and large pointed ears with brown edges; his face stays identical to the reference, translated into flat vector shapes. Warm afternoon sunlight from the left mixes with pink and blue neon glow from behind. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

### 5.5 Штурм
Тузик на задних лапах у стола, рука в последний миг выдёргивает бутылку; сверху падает пустая табличка.

```
Side view at tabletop height: Tuzik stands on his hind legs with his front paws on the edge of a red-and-white checked tablecloth, stretching his neck toward a plain amber bottle, his teeth almost touching the label, while a hairy man's hand with an old steel wristwatch snatches the bottle away at the very last moment. Plates with cucumbers and bread blur in the foreground. A heavy blank wooden sign drops from the top edge like a barrier gate, reserved for text. Tuzik is the small short-haired cream-white dog from the attached reference sheet, with an oversized glossy black nose, big round dark eyes and large pointed ears with brown edges; his face stays identical to the reference, translated into flat vector shapes. Late afternoon sun, 4500K. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows separating the depth layers. Vertical 9:16 format.
```

### 5.6 Холодильник
Крышка сумки-холодильника захлопнулась перед носом; ошарашенная морда.

```
Close-up at grass level next to a garden bench: a soft cooler bag with its lid just slammed shut, a thin line of icy blue light and frost still glowing along the seam. Tuzik jerks back in shock right in front of it, eyes wide, mouth wide open, ears straight up. A foot in a white canvas sneaker nudges the cooler bag away. Tuzik is the small short-haired cream-white dog from the attached reference sheet, with an oversized glossy black nose, big round dark eyes with two catchlights and large pointed ears with brown edges and pink insides; his face stays identical to the reference, translated into flat vector shapes. Contrast of icy blue light from the cooler seam against warm golden afternoon light, 4000K. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

### 5.7 Палка
Палка улетает к низкому солнцу, Тузик даже не шевелится.

```
Wide view of the garden at golden hour: in the bottom foreground Tuzik sits completely still with a flat unimpressed expression next to a man's legs in grey socks and brown sandals, while high in the sky a thrown wooden stick flies along a huge arc toward the low sun, leaving a thin white dashed trail. Tuzik is the small short-haired cream-white dog from the attached reference sheet, with an oversized glossy black nose and large pointed ears with brown edges; his proportions stay identical to the reference, translated into flat vector shapes. Long warm shadows stretch across the lawn, the low sun at 3500K backlights the scene, the apple tree turns into a dark silhouette. Palette: amber #F2A541, warm grass, shadows #6B4E71. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows separating the depth layers. Vertical 9:16 format.
```

---

## Сцена 6. Дно

### 6.1 Закат
Тузик один посреди лужайки, длинная тень через весь кадр, загораются гирлянды.

```
Wide high view of an empty lawn at sunset: Tuzik lies alone, small, in the lower part of the frame with his chin on his paws, ears flattened, eyes glistening. His very long violet shadow stretches up across the whole lawn toward the top of the frame. In the background, guests' legs carry folded blankets and chairs toward a fire pit, and warm string lights above the long table begin to glow one by one. Tuzik is the small short-haired cream-white dog from the attached reference sheet, with an oversized glossy black nose and large pointed ears with brown edges; his proportions stay identical to the reference, translated into flat vector shapes. The low sun sits on the horizon; the sky moves from peach #F6B48F to lilac, shadows #4B3A5E, string lights #FFD27A. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows separating the depth layers. Vertical 9:16 format.
```

---

## Сцена 7. Костёр

### 7.1 Искры
Ночь, костёр на уровне колен, Димон достаёт гитару из чехла.

```
Night, low angle at knee height beside a campfire: a ring of logs around a fire pit, flames and rising orange sparks against a deep indigo sky. Guests are visible from the knees down, sitting on logs and blankets, and one hand holds a marshmallow on a stick over the flames. A man's hands open a guitar case and lift out an acoustic guitar. Warm string-light bokeh dots glow in the far background. The campfire is the only key light, from below, 1900K; indigo ambient fill #1E2240, fire #FF7A1A and #FFC24B. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows separating the depth layers. Vertical 9:16 format.
```

### 7.2 Дрынь
Димон неумело бьёт по струнам; из гитары сыплются осколки (в моушне станут буквами «ДРЫНЬ»).

```
Night close-up at knee height by a campfire: a man's hands strum an acoustic guitar clumsily, fingers tangled awkwardly on the strings, and a few jagged broken shard shapes tumble out of the guitar into the grass like pieces of a cracked sign. Guests' legs sit around in the dark. Firelight from below, 1900K, deep indigo shadows, sparks in the air. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

### 7.3 Выход
Тузик выходит из темноты в круг света и смотрит на гитару.

```
Night, dog-height view across a campfire: Tuzik steps out of the darkness into the warm circle of firelight, two tiny reflections of the flames in his big dark eyes, looking at an acoustic guitar lying on a log. Tuzik is the dog from the attached reference sheet: a small short-haired cream-white dog with a compact bean-shaped body, an oversized glossy black nose with a white highlight, big round dark eyes, large pointed ears with brown edges and pink insides, and a thin white tail; his face and proportions stay identical to the reference, translated into flat vector shapes. Out-of-focus flames in the foreground, guests' legs at the edges of the frame. Firelight 1900K as the key light, deep indigo darkness behind. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows separating the depth layers. Vertical 9:16 format.
```

### 7.4 Подъём
Впервые уровень глаз и лица людей; Тузик на бревне с клетчатым пледом, гитара вдвое больше него.

```
Eye-level view at night by a campfire, the first time the guests' faces appear: simple round heads with dot eyes and minimal features, all turned toward the center in surprise. In the center, Tuzik sits upright on a log covered with a red-and-white checked plaid blanket, an acoustic guitar twice his size across his lap so that only his ears and nose rise above the guitar body, one paw pressing the strings on the fretboard. Beside him Valera — a man about 50 with a round face, grey moustache, white panama hat and faded blue polo shirt — slowly lowers his bottle. Tuzik is the small short-haired cream-white dog from the attached reference sheet, with an oversized glossy black nose, big round dark eyes and large pointed ears with brown edges and pink insides; his face stays identical to the reference, translated into flat vector shapes. The campfire in the foreground lights everyone from below, 1900K, sparks rising into the indigo sky. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows separating the depth layers. Vertical 9:16 format.
```

---

## Сцена 8. Песня

### 8.1 «Но я играю эту роль»
Тузик играет, пламя за ним встаёт, как софит; верх кадра свободен под слова из искр.

```
Night, close-up: Tuzik sits on a log with a red-and-white checked plaid and plays an acoustic guitar, his paw on the strings, the campfire flames reflected in the glossy guitar body. Behind him the flames flare up tall and bright like a theatre spotlight and sparks swirl upward into the indigo sky; the upper part of the frame stays open for floating spark-letters. Tuzik is the small short-haired cream-white dog from the attached reference sheet, with an oversized glossy black nose with a white highlight, big round dark eyes and large pointed ears with brown edges and pink insides; his face stays identical to the reference, translated into flat vector shapes. Firelight 1900K from below. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

### 8.2 «Как будто бросил алкоголь»
Тузик с постной мордой «завязал»; Валера прячет бутылку за спину, Оля снимает на телефон.

```
Night, medium shot by a campfire: Tuzik plays the guitar with his eyes closed and his nose raised in a pious, holier-than-thou expression. Next to him, Valera — a man about 50 with a round face, dot eyes, grey moustache and white panama hat — slowly hides his bottle behind his back with a suspicious sideways glance, while Olya — a young woman with a round face, dot eyes, chestnut ponytail and yellow sundress — raises her phone to film, the phone screen showing Tuzik. Tuzik is the small short-haired cream-white dog from the attached reference sheet, with an oversized glossy black nose and large pointed ears with brown edges; his face stays identical to the reference, translated into flat vector shapes. Firelight 1900K from below, indigo night. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

### 8.3 «Но тянет так необъяснимо»
Нос сам поворачивается за бутылкой; дым над костром рисует воспоминания дня.

```
Night, medium shot: Tuzik keeps strumming the guitar while his head and nose turn sideways on their own, eyes locked on the amber bottle hidden behind Valera's back. Above the campfire, the rising smoke forms thin glowing white line drawings of the day: a falling water drop, a tall bottle, a blackcurrant bush. Tuzik is the small short-haired cream-white dog from the attached reference sheet, with an oversized glossy black nose, big round dark eyes and large pointed ears with brown edges; his face stays identical to the reference, translated into flat vector shapes. Firelight 1900K, indigo sky. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

### 8 · пауза — Димон роняет дрова
Димон выходит из темноты с охапкой дров и застывает, поленья выскальзывают.

```
Night, medium-wide shot at the edge of the firelight: Dimon — a man about 30 with a round face, dot eyes, short dark beard, backward black cap, black t-shirt and rolled-up dark jeans, barefoot with a small anchor tattoo on his ankle — steps out of the darkness with an armful of firewood and freezes in amazement, logs slipping out of his arms in mid-air. Firelight from the right, deep indigo darkness behind him. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

### 8.4 «Совсем не пить не по плечу»
Строго сверху: круг людей у костра качается и хлопает, мелом проступают засечки.

```
Strict top-down view at night onto a circle of people around a campfire, mirroring the top-down table shot from the opening: the fire burns in the very center, Tuzik with his guitar sits on a log with a red-and-white checked plaid at the bottom of the circle, and the guests on logs and blankets sway together, clapping their hands on the logs with small bursts of sparks. White chalk tally marks are drawn on the dark grass around the circle. Tuzik is the small cream-white dog from the attached reference sheet, with an oversized black nose and large pointed ears with brown edges, seen from above. Warm firelight fades into indigo toward the frame edges. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

### 8.5 «А я жить трезво не хочу»
Снизу: Тузик запрокинул голову к полной луне; Димон и Валера поют в обнимку.

```
Night, low angle from below: Tuzik throws his head back on a long note, eyes closed, mouth open in song, holding the guitar, with a big pale full moon right behind his head in the indigo sky. In the background, Dimon and Valera sing with their arms around each other's shoulders. Tuzik is the small short-haired cream-white dog from the attached reference sheet, with an oversized glossy black nose and large pointed ears with brown edges and pink insides; his face stays identical to the reference, translated into flat vector shapes. A cool moonlight rim on his ears, warm firelight from below. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

### 8.6 «Не оставляй меня без пива!»
Валера ставит открытую бутылку рядом с Тузиком; верх кадра свободен под пенные буквы.

```
Night, medium shot by a campfire: Valera — a man about 50 with a round face, dot eyes, grey moustache, white panama hat and faded blue polo shirt — leans in and places an open amber bottle on the red-and-white checked plaid right next to Tuzik, foam rising out of its neck, while Tuzik looks up at him with huge glistening puppy eyes, still holding the guitar. The upper part of the frame stays open for a large foam-letter line of lyrics. Tuzik is the small short-haired cream-white dog from the attached reference sheet, with an oversized glossy black nose, big round dark eyes with two catchlights and large pointed ears with brown edges; his face stays identical to the reference, translated into flat vector shapes. Firelight 1900K, indigo night, rising sparks. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

### 8.7 Последний аккорд
Все аплодируют, на Тузика падает праздничный колпак.

```
Night, medium-wide shot by a campfire: everyone around the fire applauds with joyful round faces and dot eyes while a small golden party cone hat falls onto Tuzik's head as his paw mutes the guitar strings, and a burst of sparks flies up like confetti. Tuzik is the small short-haired cream-white dog from the attached reference sheet, with an oversized glossy black nose and large pointed ears with brown edges; his face stays identical to the reference, translated into flat vector shapes. Firelight from below, indigo sky full of stars. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

---

## Сцена 9. Подмигивание

### 9.1 Подмигивание
Тузик в колпаке рядом с бутылкой смотрит в камеру и подмигивает.

```
Night, close-up: Tuzik in a small golden party cone hat sits beside an open amber bottle on a red-and-white checked plaid, looking straight into the camera with a lazy half-closed smirk and winking with one eye. Tuzik is the dog from the attached reference sheet: a small short-haired cream-white dog with an oversized glossy black nose with a white highlight, big round dark eyes with pinkish eyelids, and large pointed ears with brown edges and pink insides; his face stays identical to the reference, translated into flat vector shapes. Warm firelight from below, sparks and stars in the indigo background, shallow depth of field. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows. Vertical 9:16 format.
```

### Титры — подложка
Клетчатая скатерть на весь кадр, центр свободен под название.

```
Full-frame red-and-white checked cotton tablecloth seen flat from directly above, gently wrinkled, softly lit by warm daylight, with a calm open area in the center reserved for a title. Flat vector illustration with fine paper grain and soft shadows in the fabric folds. Vertical 9:16 format.
```

---

## Сцена 10. Луп

### 10.1 Утро
Рассвет под столом: Тузик спит в обнимку с гитарой, рука ставит у носа запотевшую бутылку. Последний кадр лупа — снова 1.1.

```
Worm's-eye view under a long garden table at dawn: soft blue morning mist and dew on the grass. Tuzik sleeps curled up hugging an acoustic guitar, surrounded by sleeping bags and somebody's bare heels. A hairy man's hand with an old steel wristwatch sets a cold amber bottle covered in condensation right beside his nose, and in the background stand a pair of grey socks in brown sandals. The red-and-white checked tablecloth glows pale above. Tuzik is the dog from the attached reference sheet: a small short-haired cream-white dog with a compact bean-shaped body, an oversized glossy black nose with a white highlight, large pointed ears with brown edges and pink insides, and a thin white tail; his face and proportions stay identical to the reference, translated into flat vector shapes. Cool dawn light, 7000K, with the first warm sunbeam crossing the grass; palette misty blue #DDE8EE with warm accents. Flat 2.5D vector illustration for a motion-design short film, built like a layered paper diorama: crisp flat colour shapes, fine paper grain, soft drop shadows separating the depth layers. Vertical 9:16 format.
```

---

## Совет

Не начинай с сюжетных кадров. Сначала добейся идеального листа 0.1: если Тузик в нём «не тот», он будет плыть в каждом из 35 кадров, и правки обойдутся дороже. Черновые прогоны композиции можно гонять в Nano Banana 2 тем же промтом — это быстрее и дешевле, а в Pro доводить уже утверждённые кадры.
