# VideoAsk Clone

Асинхронные видео-формы — упрощённый аналог [videoask.com](https://www.videoask.com/):
создатель записывает видео-вопросы, респонденты проходят форму по ссылке и отвечают
видео, аудио или текстом прямо в браузере (MediaRecorder). Ответы видны в «входящих»
создателя.

## Стек

- **Клиент:** React 18 + Vite + react-router
- **Сервер:** Node.js + Express
- **База:** JSON-хранилище (файл `server/data/db.json`), без нативных зависимостей
- **Медиа:** запись в браузере (webm), загрузка через multer, файлы в `server/uploads/`

## Запуск

```bash
cd videoask
npm run install:all   # установить зависимости сервера и клиента

# режим разработки (API на :4000, Vite на :5173 с прокси)
npm run dev

# продакшен: собрать клиент и поднять один сервер на :4000
npm run build
npm start
```

Откройте `http://localhost:5173` (dev) или `http://localhost:4000` (после build).

## Как пользоваться

1. **Создайте форму** на главной странице.
2. Откройте форму и добавьте вопросы: запишите видео-вопрос (🔴 в браузере)
   или загрузите файл, укажите допустимые типы ответов (видео/аудио/текст).
3. Скопируйте ссылку `/f/<form_id>` и отправьте респондентам.
4. Респондент проходит вопросы, отвечает видео/аудио/текстом, оставляет контакты.
5. Смотрите ответы на странице **📥 Ответы**: статусы (`completed` / `dropped_out` / `in_progress`),
   воспроизведение медиа, текстовые ответы, контакты.

## API

| Метод и путь | Назначение |
|---|---|
| `GET/POST /api/forms` | список / создание форм |
| `GET/DELETE /api/forms/:id` | форма с вопросами / удаление |
| `POST /api/forms/:id/questions` | добавить вопрос (multipart, поле `media`) |
| `DELETE /api/questions/:id` | удалить вопрос |
| `POST /api/forms/:id/responses` | начать прохождение (как у VideoAsk — response создаётся на старте) |
| `POST /api/responses/:id/answers` | отправить ответ (multipart: `question_id`, `kind`, `media`/`text`) |
| `PATCH /api/responses/:id` | статусы `completed`/`dropped_out` + контакты |
| `GET /api/forms/:id/responses` | все ответы формы (inbox) |

Медиа-файлы раздаются статикой из `/media/<file>`, в БД хранится путь `uploads/<file>`.

## Структура

```
videoask/
├── server/          # Express API + JSON-store
│   ├── index.js     # все роуты
│   └── store.js     # JSON-хранилище (forms, questions, responses, answers)
└── client/          # React SPA
    └── src/pages/   # Dashboard, FormEditor, Respond, Inbox
```
