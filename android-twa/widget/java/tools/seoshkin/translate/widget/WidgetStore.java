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
    private static final String KEY_SOUND  = "sound_on";      // озвучивать слово при показе
    private static final String KEY_ANSWERED = "answered";    // на текущую карточку уже ответили
    private static final String KEY_ANS_OK   = "answered_ok";
    private static final String KEY_ANS_IDX  = "answered_idx";

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
                .remove(KEY_ANSWERED).remove(KEY_ANS_OK).remove(KEY_ANS_IDX)
                .apply();
    }

    /**
     * Обновить прогресс, НЕ трогая ленту карточек и позицию в ней.
     *
     * Сервер после каждого ответа присылает свежую пачку — уже без той карточки, на которую
     * ответили. Если применить её целиком, лента начнётся сначала и человек увидит прыжок
     * на одну-две карточки вперёд. Именно это выглядело как «перескакивает через пару
     * упражнений» (Павел, 25.08.2026).
     *
     * Поэтому свежие числа (прогресс, серия, дневная норма) берём сразу, а карточки —
     * только когда лента кончилась или человек сам нажал «обновить».
     */
    public void saveProgressOnly(String json) {
        try {
            JSONObject fresh = new JSONObject(json);
            JSONObject old = state();
            if (old != null && old.optJSONArray("cards") != null) {
                fresh.put("cards", old.optJSONArray("cards"));
            }
            prefs.edit()
                    .putString(KEY_STATE, fresh.toString())
                    .putLong(KEY_SYNCED, System.currentTimeMillis())
                    .apply();       // KEY_INDEX и признак ответа намеренно не трогаем
        } catch (Exception ignored) { }
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

    // По умолчанию озвучка включена: приложение про язык, слышать слово важнее тишины.
    public boolean soundOn() { return prefs.getBoolean(KEY_SOUND, true); }

    public void setSoundOn(boolean on) { prefs.edit().putBoolean(KEY_SOUND, on).apply(); }

    // ── Ответ на текущую карточку ────────────────────────────────────────────
    // Держим здесь, а не в памяти: между нажатием и отрисовкой процесс могут выгрузить,
    // и результат ответа пропал бы вместе с ним.
    public boolean answered() { return prefs.getBoolean(KEY_ANSWERED, false); }

    public boolean answeredCorrect() { return prefs.getBoolean(KEY_ANS_OK, false); }

    public int answeredChoice() { return prefs.getInt(KEY_ANS_IDX, -1); }

    public void setAnswered(boolean correct, int choice) {
        prefs.edit()
                .putBoolean(KEY_ANSWERED, true)
                .putBoolean(KEY_ANS_OK, correct)
                .putInt(KEY_ANS_IDX, choice)
                .apply();
    }

    public void clearAnswered() {
        prefs.edit().remove(KEY_ANSWERED).remove(KEY_ANS_OK).remove(KEY_ANS_IDX).apply();
    }

    // ── Лента карточек ───────────────────────────────────────────────────────
    // Индекс живёт отдельно от ленты: пришли свежие карточки — начинаем сначала,
    // ответил на текущую — двигаем вперёд, не трогая саму ленту.

    public int index() { return prefs.getInt(KEY_INDEX, 0); }

    public void setIndex(int i) {
        prefs.edit().putInt(KEY_INDEX, i)
                .putBoolean(KEY_FLIPPED, false)
                .remove(KEY_ANSWERED).remove(KEY_ANS_OK).remove(KEY_ANS_IDX)
                .apply();
    }

    public boolean flipped() { return prefs.getBoolean(KEY_FLIPPED, false); }

    public void setFlipped(boolean v) { prefs.edit().putBoolean(KEY_FLIPPED, v).apply(); }

    /** Карточки из последнего ответа сервера. Пустой массив, если их нет. */
    public JSONArray cards() {
        JSONObject s = state();
        JSONArray arr = s == null ? null : s.optJSONArray("cards");
        return arr == null ? new JSONArray() : arr;
    }

    /** Текущая карточка или null, если карточек нет вовсе. */
    public JSONObject currentCard() {
        JSONArray arr = cards();
        if (arr.length() == 0) return null;

        // Позиция ушла за конец ленты — начинаем сначала, а не показываем пустоту.
        // Иначе виджет запирается: карточек «нет», обновление отвечает «данные не
        // изменились» (304), позиция остаётся за концом, и «Продолжить» ничего не даёт.
        // Ровно так он и застрял у Павла 25.08.2026.
        int i = index();
        if (i < 0 || i >= arr.length()) {
            setIndex(0);
            i = 0;
        }
        return arr.optJSONObject(i);
    }

    /** Забыть ETag, чтобы сервер прислал полный ответ, а не «не изменилось». */
    public void clearEtag() { prefs.edit().remove(KEY_ETAG).apply(); }

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
