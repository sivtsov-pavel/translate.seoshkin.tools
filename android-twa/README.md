# Android TWA — Deutsch Lernen

Обёртка PWA в Android-приложение (Trusted Web Activity, Bubblewrap).
Пакет: `tools.seoshkin.translate`. В git — только `twa-manifest.json` (проект генерируется).

## Ключ подписи
`/Users/pabloseoshkin/Klients/Projects/translate.seoshkin.tools-android-keys/` (ВНЕ git):
`android.keystore` + `keystore-password.txt`. ⚠️ Сделай резервную копию — без ключа
нельзя обновлять приложение (ни APK на сайте, ни в Google Play).

## Требования (уже стоят на маке Павла)
- JDK 17: `brew install openjdk@17`
- Android SDK: `brew install --cask android-commandlinetools` + platform-36/build-tools
- `~/.bubblewrap/config.json` → jdkPath + androidSdkPath (`/opt/homebrew/share/android-commandlinetools`,
  внутри созданы симлинки `bin`/`lib` → `cmdline-tools/latest/{bin,lib}` — так bubblewrap принимает путь)

## Пересборка новой версии
1. В `twa-manifest.json` поднять `appVersionCode` (+1) и `appVersionName`.
2. ```bash
   cd android-twa
   npx @bubblewrap/cli update --skipVersionUpgrade   # регенерирует проект из twa-manifest.json
   ./apply-widget.sh                                 # ⚠️ ОБЯЗАТЕЛЬНО: вживляет виджет
   export BUBBLEWRAP_KEYSTORE_PASSWORD="$(cat ../../translate.seoshkin.tools-android-keys/keystore-password.txt)"
   export BUBBLEWRAP_KEY_PASSWORD="$BUBBLEWRAP_KEYSTORE_PASSWORD"
   npx @bubblewrap/cli build
   ```

   ⚠️ **Шаг `./apply-widget.sh` пропускать нельзя.** `update` создаёт Android-проект заново,
   и виджет домашнего экрана в нём исчезает. Пропустив шаг, вы соберёте рабочий APK
   БЕЗ виджета — сборка не упадёт и ничего не скажет, а у людей виджет просто перестанет
   обновляться. Исходники виджета лежат в `widget/` (в git), скрипт идемпотентный.
3. `cp app-release-signed.apk ../frontend/public/downloads/deutsch-lernen.apk` → коммит → деплой.
4. Для Google Play — загрузить `app-release-bundle.aab` в Play Console.

## Digital Asset Links
`frontend/public/.well-known/assetlinks.json` содержит SHA-256 отпечаток ключа —
это убирает адресную строку браузера в приложении. При смене ключа обновить отпечаток:
`keytool -list -v -keystore android.keystore -alias android | grep SHA256`.

## Виджет домашнего экрана

`widget/` — исходники (Java + ресурсы на 10 локалей), `apply-widget.sh` — скрипт, который
копирует их в сгенерированный проект, добавляет зависимость WorkManager и дописывает
манифест. Данные виджет берёт с сервера: `GET /api/widget/state` по узкому токену
устройства, который выдаётся в настройках приложения (`frontend/src/components/WidgetBlock.jsx`).
Логика того, что показывать, живёт на бэкенде (`backend/src/services/widgetState.js`) —
поэтому подписи и правила можно менять обычным деплоем, без нового APK.

## Обновления контента
TWA показывает живой сайт: деплой фронта = обновление приложения у всех.
Пересборка APK нужна только при смене иконки/цветов/имени/ключа.
