package tools.seoshkin.translate.widget;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;

/**
 * Приём токена виджета из веб-части.
 *
 * Настройки в приложении открывают intent://widget-link?token=… — это единственный способ
 * передать данные из сайта, открытого в Custom Tabs, в нативный код: общего хранилища у них нет.
 * Активность невидимая: сохранила токен, запустила обновление и закрылась.
 */
public class WidgetLinkActivity extends Activity {

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        Uri data = getIntent() == null ? null : getIntent().getData();
        String token = data == null ? null : data.getQueryParameter("token");
        if (token != null && !token.isEmpty()) {
            WidgetStore store = new WidgetStore(this);
            store.saveToken(token);
            WidgetSync.requestNow(this);
            WidgetSync.schedulePeriodic(this);
        }
        finish();
    }
}
