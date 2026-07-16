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
   export BUBBLEWRAP_KEYSTORE_PASSWORD="$(cat ../../translate.seoshkin.tools-android-keys/keystore-password.txt)"
   export BUBBLEWRAP_KEY_PASSWORD="$BUBBLEWRAP_KEYSTORE_PASSWORD"
   npx @bubblewrap/cli build
   ```
3. `cp app-release-signed.apk ../frontend/public/downloads/deutsch-lernen.apk` → коммит → деплой.
4. Для Google Play — загрузить `app-release-bundle.aab` в Play Console.

## Digital Asset Links
`frontend/public/.well-known/assetlinks.json` содержит SHA-256 отпечаток ключа —
это убирает адресную строку браузера в приложении. При смене ключа обновить отпечаток:
`keytool -list -v -keystore android.keystore -alias android | grep SHA256`.

## Обновления контента
TWA показывает живой сайт: деплой фронта = обновление приложения у всех.
Пересборка APK нужна только при смене иконки/цветов/имени/ключа.
