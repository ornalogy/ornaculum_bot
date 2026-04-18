# Бот Орнакул

Telegram бот Орны (`@ornaculum_bot`)

> Исходники сайта с картой живут отдельно - [github.com/ornalogy/ornalogy.ru](https://github.com/ornalogy/ornalogy.ru/tree/main/docs)

### Инструкции

> Для работы бота нужно установить [Node.js](https://nodejs.org/en/download)

0. Пишем [@BotFather](https://t.me/BotFather), и регистрируем бота в ТГ

1. Создаем файл конфигурации `.local-env.json` в корне проекта (см. все настройки в [./app/env.js](./app/env.js))

   * Формат для запуска на своем ПК

   ```json
   {
     "botToken": "BOT_TOKEN",
     "botAdmins": [ "username", "username" ]
   }
   ```

   * Формат для запуска на сервисе в облаке (production)

   ```json
   {
     "botHost": "sample.com",
     "botToken": "BOT_TOKEN",
     "botAdmins": [ "username", "username" ]
   }
   ```

2. Устанавливаем зависимости командой `npm i`

3. Запускаем бот:

   * на своем ПК `npm run test`

   * в облаке (production) `npm start`
