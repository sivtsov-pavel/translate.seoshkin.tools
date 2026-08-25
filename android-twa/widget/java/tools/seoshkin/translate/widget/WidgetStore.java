package tools.seoshkin.translate.widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

/**
 * Хранилище виджета: токен устройства и последний ответ сервера.
 *
 * Используем обычные SharedPreferences, а не EncryptedSharedPreferences: библиотека
 * androidx.security требует minSdk 23, у приложения — 21, и слияние манифестов упало бы
 * на сборке. Файл приватен для приложения, а сам токен узкий: он умеет только читать
 * прогресс и мгновенно отзывается тумблером в настройках.
 *
 * Кэш ответа нужен, чтобы в офлайне виджет показывал последние известные числа с пометкой
 * времени, а не пустой прямоугольник.
 */
public class WidgetStore {

    private static final String FILE = "widget_store";

    private static final String KEY_TOKEN  = "token";
    private static final String KEY_STATE  = "state_json";
    private static final String KEY_ETAG   = "etag";
    private static final String KEY_SYNCED = "synced_at";

    private final SharedPreferences prefs;

    public WidgetStore(Context ctx) {
        this.prefs = ctx.getApplicationContext().getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    // ── Токен ────────────────────────────────────────────────────────────────
    public String token() { return prefs.getString(KEY_TOKEN, null); }

    public void saveToken(String token) { prefs.edit().putString(KEY_TOKEN, token).apply(); }

    /** Токен отозван в настройках — забываем всё, включая уже показанные числа. */
    public void clearToken() { prefs.edit().clear().apply(); }

    // ── Кэш ответа ───────────────────────────────────────────────────────────
    public String etag() { return prefs.getString(KEY_ETAG, null); }

    public void save(String json, String etag) {
        prefs.edit()
                .putString(KEY_STATE, json)
                .putString(KEY_ETAG, etag)
                .putLong(KEY_SYNCED, System.currentTimeMillis())
                .apply();
    }

    /** Ответ 304: данные те же, но подтверждены сейчас — обновляем только метку времени. */
    public void touch() { prefs.edit().putLong(KEY_SYNCED, System.currentTimeMillis()).apply(); }

    public long syncedAt() { return prefs.getLong(KEY_SYNCED, 0L); }

    /** Последнее состояние или null, если сервер ещё ни разу не ответил. */
    public JSONObject state() {
        String raw = prefs.getString(KEY_STATE, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (Exception e) {
            return null;
        }
    }
}
