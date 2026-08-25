package tools.seoshkin.translate.widget;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
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
    private static final String KEY_INDEX  = "card_index";   // какая карточка показана сейчас
    private static final String KEY_QUEUE  = "answer_queue"; // ответы, ещё не дошедшие до сервера
    private static final String KEY_FLIPPED = "card_flipped"; // перевод у карточки уже открыт
    private static final String KEY_ERROR  = "last_error";    // почему не удалось обновиться
    private static final String KEY_NOTIFY = "notify_on";     // карточка в уведомлении включена

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
                .putInt(KEY_INDEX, 0)          // свежая пачка — показываем с первой карточки
                .putBoolean(KEY_FLIPPED, false)
                .apply();
    }

    /** Ответ 304: данные те же, но подтверждены сейчас — обновляем только метку времени. */
    public void touch() { prefs.edit().putLong(KEY_SYNCED, System.currentTimeMillis()).apply(); }

    public long syncedAt() { return prefs.getLong(KEY_SYNCED, 0L); }

    // Последняя ошибка обновления. Молчащий виджет невозможно чинить на расстоянии:
    // «Загрузка…» одинаково выглядит и при отсутствии сети, и при запрете доступа к ней.
    public String lastError() { return prefs.getString(KEY_ERROR, null); }

    public void setError(String message) {
        prefs.edit().putString(KEY_ERROR, message).apply();
    }

    public void clearError() { prefs.edit().remove(KEY_ERROR).apply(); }

    // ── Карточка на экране блокировки ────────────────────────────────────────
    public boolean notificationOn() { return prefs.getBoolean(KEY_NOTIFY, false); }

    public void setNotificationOn(boolean on) { prefs.edit().putBoolean(KEY_NOTIFY, on).apply(); }

    // ── Лента карточек ───────────────────────────────────────────────────────
    // Индекс живёт отдельно от ленты: пришли свежие карточки — начинаем сначала,
    // ответил на текущую — двигаем вперёд, не трогая саму ленту.

    public int index() { return prefs.getInt(KEY_INDEX, 0); }

    public void setIndex(int i) { prefs.edit().putInt(KEY_INDEX, i).putBoolean(KEY_FLIPPED, false).apply(); }

    public boolean flipped() { return prefs.getBoolean(KEY_FLIPPED, false); }

    public void setFlipped(boolean v) { prefs.edit().putBoolean(KEY_FLIPPED, v).apply(); }

    /** Карточки из последнего ответа сервера. Пустой массив, если их нет. */
    public JSONArray cards() {
        JSONObject s = state();
        JSONArray arr = s == null ? null : s.optJSONArray("cards");
        return arr == null ? new JSONArray() : arr;
    }

    /** Текущая карточка или null, если лента кончилась (ждём свежую пачку). */
    public JSONObject currentCard() {
        JSONArray arr = cards();
        int i = index();
        return i >= 0 && i < arr.length() ? arr.optJSONObject(i) : null;
    }

    // ── Очередь ответов ──────────────────────────────────────────────────────
    // Ответ, данный без сети, обязан дойти позже: для человека он уже засчитан, и молча
    // терять его нельзя. Поэтому сперва кладём в очередь, отправляем отдельно.

    public void enqueueAnswer(JSONObject answer) {
        try {
            JSONArray q = queue();
            q.put(answer);
            prefs.edit().putString(KEY_QUEUE, q.toString()).apply();
        } catch (Exception ignored) { }
    }

    public JSONArray queue() {
        String raw = prefs.getString(KEY_QUEUE, null);
        if (raw == null) return new JSONArray();
        try {
            return new JSONArray(raw);
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    /** Сервер принял очередь — очищаем. Только после успешного ответа, не раньше. */
    public void clearQueue() { prefs.edit().remove(KEY_QUEUE).apply(); }

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
