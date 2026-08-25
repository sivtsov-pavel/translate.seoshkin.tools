package tools.seoshkin.translate.widget;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Отправляет накопленные ответы и переводит виджет к следующей карточке.
 *
 * Почему отдельный воркер, а не отправка прямо в onReceive: у приёмника около десяти
 * секунд, после чего процесс убивают. Сеть оттуда — это ответы, теряющиеся молча.
 *
 * Задержка перед запуском нужна, чтобы человек успел увидеть подсветку верного ответа:
 * иначе карточка сменится прямо под пальцем.
 */
public class WidgetAnswerWorker extends Worker {

    private static final String TAG = "WidgetAnswer";
    private static final int TIMEOUT_MS = 15000;

    public WidgetAnswerWorker(@NonNull Context ctx, @NonNull WorkerParameters params) {
        super(ctx, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        WidgetStore store = new WidgetStore(ctx);

        // Шаг вперёд делаем всегда, даже без сети: ответ уже в очереди, и человек
        // вправе продолжать заниматься в метро.
        store.setIndex(store.index() + 1);
        DailyGoalWidgetProvider.redrawAll(ctx);

        String token = store.token();
        JSONArray queue = store.queue();
        if (token == null || queue.length() == 0) return Result.success();

        HttpURLConnection conn = null;
        try {
            JSONObject body = new JSONObject();
            body.put("answers", queue);

            conn = (HttpURLConnection) new URL(WidgetSync.ANSWER_URL).openConnection();
            conn.setRequestMethod("POST");
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            conn.setDoOutput(true);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_UNAUTHORIZED) {
                // Виджет выключили в настройках — забываем всё и перестаём стучаться.
                store.clearToken();
                WidgetSync.cancelPeriodic(ctx);
                DailyGoalWidgetProvider.redrawAll(ctx);
                return Result.success();
            }
            if (code < 200 || code >= 300) {
                Log.w(TAG, "Сервер ответил " + code);
                return Result.retry();       // очередь не трогаем: ответы не потеряются
            }

            // Приняты — только теперь очищаем очередь. Раньше нельзя: упавший ответ
            // исчез бы бесследно, а человек считал бы упражнение сделанным.
            store.clearQueue();

            // Сервер вернул свежее состояние и новую пачку карточек — берём их сразу,
            // чтобы полоса прогресса подвинулась без ожидания планового опроса.
            JSONObject resp = new JSONObject(readBody(conn));
            JSONObject state = resp.optJSONObject("state");
            if (state != null) {
                int keepIndex = store.index();
                store.save(state.toString(), null);   // ETag сбрасываем: состояние изменилось
                // save() ставит индекс в 0; если карточки те же самые, вернём позицию.
                // Позицию возвращаем, только если она попадает внутрь новой ленты.
                // Иначе после ответа на последнюю карточку виджет оставался «за концом».
                if (sameCards(state, store) && keepIndex > 0 && keepIndex < store.cards().length()) {
                    store.setIndex(keepIndex);
                }
                WidgetSyncWorker.prefetchImages(ctx, store);
                WidgetSyncWorker.applyNotifyFlag(ctx, store);
            }
            DailyGoalWidgetProvider.redrawAll(ctx);
            return Result.success();

        } catch (Exception e) {
            Log.w(TAG, "Ответы не ушли: " + e.getMessage());
            return Result.retry();
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Пришла ли та же лента (сервер мог отдать те же карточки, если ничего не изменилось). */
    private static boolean sameCards(JSONObject state, WidgetStore store) {
        JSONArray fresh = state.optJSONArray("cards");
        JSONArray old = store.cards();
        if (fresh == null || old.length() == 0 || fresh.length() != old.length()) return false;
        return fresh.optJSONObject(0) != null && old.optJSONObject(0) != null
                && fresh.optJSONObject(0).optInt("id") == old.optJSONObject(0).optInt("id");
    }

    private static String readBody(HttpURLConnection conn) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"))) {
            String line;
            while ((line = r.readLine()) != null) sb.append(line);
        }
        return sb.toString();
    }
}
