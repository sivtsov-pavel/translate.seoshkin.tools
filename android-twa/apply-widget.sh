#!/usr/bin/env bash
#
# Вживляет виджет домашнего экрана в сгенерированный проект TWA.
#
# ЗАЧЕМ ЭТОТ СКРИПТ. `bubblewrap update` создаёт Android-проект заново из twa-manifest.json,
# и всё, что лежало в сгенерированных каталогах, пропадает. В git у нас только исходники
# виджета (widget/) — этот скрипт кладёт их на место и дописывает манифест с зависимостями.
#
# ПОРЯДОК СБОРКИ РЕЛИЗА:
#   npx @bubblewrap/cli update --skipVersionUpgrade
#   ./apply-widget.sh          <-- обязательно между update и build
#   npx @bubblewrap/cli build
#
# Скрипт идемпотентный: повторный запуск ничего не портит и не дублирует.

set -euo pipefail
cd "$(dirname "$0")"

APP=app/src/main
MANIFEST="$APP/AndroidManifest.xml"
GRADLE=app/build.gradle

# Версия WorkManager. Единственная новая зависимость: androidx.security (шифрованные
# префы) сюда не годится — она требует minSdk 23, а у приложения 21.
WORK_VERSION="2.9.1"

[ -d "$APP" ] || { echo "❌ Проект не сгенерирован. Сначала: npx @bubblewrap/cli update"; exit 1; }

# ── 1. Исходники и ресурсы ───────────────────────────────────────────────────
mkdir -p "$APP/java" "$APP/res"
cp -R widget/java/. "$APP/java/"
cp -R widget/res/.  "$APP/res/"
echo "✅ Файлы виджета скопированы"

# ── 2. Зависимость WorkManager ───────────────────────────────────────────────
if grep -q "androidx.work:work-runtime" "$GRADLE"; then
  echo "• WorkManager уже подключён"
else
  # Вставляем внутрь блока dependencies, сразу после его открытия.
  awk -v ver="$WORK_VERSION" '
    /^dependencies \{/ && !done {
      print
      print "    // Обновления виджета домашнего экрана (см. android-twa/apply-widget.sh)"
      print "    implementation \"androidx.work:work-runtime:" ver "\""
      done = 1
      next
    }
    { print }
  ' "$GRADLE" > "$GRADLE.tmp" && mv "$GRADLE.tmp" "$GRADLE"
  echo "✅ WorkManager $WORK_VERSION добавлен в build.gradle"
fi

# ── 3. Манифест: приёмник виджета, приём токена, ранний старт ────────────────
# Патч запускаем ВСЕГДА: он сам идемпотентен — вырезает прежний блок и добавляет только
# недостающие разрешения. Внешняя проверка «уже пропатчено» однажды уже съела правку:
# блок стоял с прошлой версии, и новые разрешения сторожа молча не доехали.
python3 - "$MANIFEST" <<'PYEOF'
import sys

path = sys.argv[1]
src = open(path, encoding='utf-8').read()

# Разрешение на сеть. Bubblewrap его НЕ добавляет: самому TWA сеть не нужна, в интернет
# ходит браузер в своём процессе. А виджет ходит сам — и без этой строки любой его запрос
# падает с отказом в доступе, из-за чего виджет вечно показывает «Загрузка…».
# INTERNET — виджету, остальные — сторожу экрана блокировки (LockCardService):
# foreground-сервис и его уведомление, плюс возвращение сторожа после перезагрузки.
# Разрешения проверяем ПООТДЕЛЬНОСТИ. Раньше блок добавлялся целиком при отсутствии
# INTERNET — и когда INTERNET уже стоял с прошлого патча, новые разрешения сторожа
# молча не доезжали, а сервис падал на старте.
PERMS = [
    'android.permission.INTERNET',                        # виджет ходит в сеть сам
    'android.permission.FOREGROUND_SERVICE',              # сторож экрана блокировки
    'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',  # его тип на Android 14+
    'android.permission.POST_NOTIFICATIONS',              # уведомление сервиса и карточка
    'android.permission.RECEIVE_BOOT_COMPLETED',          # вернуть сторожа после перезагрузки
]
missing = [p for p in PERMS if 'android:name="%s"' % p not in src]
if missing:
    idx = src.index('>', src.index('<manifest ')) + 1
    lines = ''.join('    <uses-permission android:name="%s"/>\n' % p for p in missing)
    src = src[:idx] + '\n' + lines + src[idx:]

BLOCK = '''
        <!-- ▼▼▼ Виджет домашнего экрана (android-twa/apply-widget.sh) ▼▼▼ -->

        <!-- Сам виджет. exported=false: чужим приложениям он не нужен. -->
        <receiver
            android:name=".widget.DailyGoalWidgetProvider"
            android:exported="false">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
                <action android:name="tools.seoshkin.translate.ACTION_WIDGET_REFRESH" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/daily_goal_widget_info" />
        </receiver>

        <!-- Приём токена из веб-настроек: intent://widget-link?token=… -->
        <activity
            android:name=".widget.WidgetLinkActivity"
            android:exported="true"
            android:excludeFromRecents="true"
            android:noHistory="true"
            android:theme="@android:style/Theme.NoDisplay">
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="dlwidget" android:host="widget-link" />
            </intent-filter>
        </activity>

        <!-- Стартует вместе с процессом и подписывается на жизненный цикл: вышел из
             приложения — виджет обновляется. Это главный момент актуальности. -->
        <provider
            android:name=".widget.WidgetBootstrapProvider"
            android:authorities="tools.seoshkin.translate.widgetbootstrap"
            android:exported="false"
            android:initOrder="100" />

        <!-- Карточка ПОВЕРХ экрана блокировки. showWhenLocked/turnScreenOn — то, чем
             мы рисуемся над keyguard-ом; заменить саму разблокировку нельзя (см.
             LockCardActivity). excludeFromRecents — экрану замка не место в «недавних».
             Режим включается тумблером и по умолчанию выключен. -->
        <activity
            android:name=".widget.LockCardActivity"
            android:exported="false"
            android:showWhenLocked="true"
            android:turnScreenOn="true"
            android:excludeFromRecents="true"
            android:launchMode="singleTask"
            android:taskAffinity=".lockcard"
            android:theme="@android:style/Theme.Material.NoActionBar.Fullscreen" />

        <!-- Сторож экрана: ACTION_SCREEN_ON ловится только живым процессом, а запускать
             активность из фона можно лишь foreground-сервису (Android 10+). -->
        <service
            android:name=".widget.LockCardService"
            android:exported="false"
            android:foregroundServiceType="specialUse">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="Shows a learning card over the lock screen when the screen turns on" />
        </service>

        <!-- ▲▲▲ Виджет домашнего экрана ▲▲▲ -->

    </application>'''

if '</application>' not in src:
    sys.exit('❌ В манифесте нет </application> — структура изменилась, патч не применён')

# Манифест мог быть пропатчен ПРЕЖНЕЙ версией блока (без экрана блокировки). Тогда его
# надо заменить целиком, а не дописать второй: два одинаковых receiver-а в манифесте —
# это уже не идемпотентность, а поломка сборки.
HEAD = '<!-- ▼▼▼ Виджет домашнего экрана'
TAIL = '<!-- ▲▲▲ Виджет домашнего экрана ▲▲▲ -->'
if HEAD in src and TAIL in src:
    src = src[:src.index(HEAD)] + src[src.index(TAIL) + len(TAIL):]

src = src.replace('</application>', BLOCK.lstrip('\n'), 1)
open(path, 'w', encoding='utf-8').write(src)
print('✅ Манифест пропатчен')
PYEOF

echo
echo "Готово. Дальше: npx @bubblewrap/cli build"
