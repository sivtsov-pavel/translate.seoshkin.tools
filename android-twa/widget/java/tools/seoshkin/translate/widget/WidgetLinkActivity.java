package tools.seoshkin.translate.widget;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;

/**
 * Мост между настройками в приложении и нативной частью.
 *
 * Настройки открывают intent://widget-link?token=…&notify=1 — это единственный способ
 * передать данные из сайта, открытого в Custom Tabs, нативному коду: общего хранилища
 * у них нет, куки сайта нативной части недоступны.
 *
 * Активность невидимая: сохранила настройки, запустила обновление и закрылась. Заодно
 * это единственное место, где можно спросить разрешение на уведомления — из виджета
 * системный диалог не показать.
 */
public class WidgetLinkActivity extends Activity {

    private static final int REQ_NOTIFICATIONS = 1;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);

        Uri data = getIntent() == null ? null : getIntent().getData();
        if (data == null) { finish(); return; }

        WidgetStore store = new WidgetStore(this);

        String token = data.getQueryParameter("token");
        if (token != null && !token.isEmpty()) {
            store.saveToken(token);
            WidgetSync.requestNow(this);
            WidgetSync.schedulePeriodic(this);
        }

        // Карточка на экране блокировки — отдельный тумблер в настройках.
        String notify = data.getQueryParameter("notify");
        if (notify != null) {
            boolean on = "1".equals(notify);
            store.setNotificationOn(on);
            if (!on) {
                WidgetNotification.hide(this);
            } else if (needsPermission()) {
                // Android 13+ требует явного разрешения. Спрашиваем и ждём ответа.
                requestPermissions(new String[]{ Manifest.permission.POST_NOTIFICATIONS }, REQ_NOTIFICATIONS);
                return;
            } else {
                WidgetNotification.update(this);
            }
        }

        // Карточка ПОВЕРХ замка — отдельный тумблер, по умолчанию выключен.
        //
        // Разрешение «поверх других окон» здесь не прихоть: с Android 14 система блокирует
        // запуск активности из фона (Background Activity Launch), и foreground-сервиса для
        // исключения НЕ ХВАТАЕТ — проверено на эмуляторе Android 16 14.09.2026, в логах
        // «Background activity launch blocked». С выданным разрешением карточка появляется.
        // Поэтому включаем режим только вместе с ним, а иначе ведём человека в настройки:
        // тумблер «включён», за которым ничего не происходит, — худший из вариантов.
        String lock = data.getQueryParameter("lock");
        if (lock != null) {
            boolean on = "1".equals(lock);
            if (on && Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
                store.setLockOn(false);
                startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + getPackageName())));
                finish();
                return;
            }
            store.setLockOn(on);
            LockCardService.apply(this);
        }

        finish();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        super.onRequestPermissionsResult(code, perms, results);
        boolean granted = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;

        // Отказали — не держим тумблер включённым: иначе настройки показывали бы «включено»
        // там, где на экране блокировки ничего не появится.
        WidgetStore store = new WidgetStore(this);
        store.setNotificationOn(granted);
        if (granted) WidgetNotification.update(this);

        finish();
    }

    private boolean needsPermission() {
        return Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                   != PackageManager.PERMISSION_GRANTED;
    }
}
