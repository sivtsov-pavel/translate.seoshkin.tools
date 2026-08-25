package tools.seoshkin.translate.widget;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Забирает состояние виджета с сервера. Именно Worker, а не Service: показывать
 * прогресс урока — работа на пару секунд раз в полчаса, а foreground Service ради этого
 * требует постоянного уведомления в шторке и всё равно будет прибит системой.
 *
 * Сеть недоступна — не беда: виджет перерисуется из кэша, а WorkManager повторит попытку.
 */
public class WidgetSyncWorker extends Worker {

    private static final String TAG = "WidgetSync";
    private static final int TIMEOUT_MS = 15000;

    public WidgetSyncWorker(@NonNull Context ctx, @NonNull WorkerParameters params) {
        super(ctx, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context ctx = getApplicationContext();
        WidgetStore store = new WidgetStore(ctx);

        String token = store.token();
        if (token == null) {
            // Виджет не подключён — рисуем приглашение и в сеть не ходим вовсе.
            DailyGoalWidgetProvider.redrawAll(ctx);
            return Result.success();
        }

        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(WidgetSync.STATE_URL).openConnection();
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            conn.setRequestProperty("Authorization", "Bearer " + token);
            String etag = store.etag();
            if (etag != null) conn.setRequestProperty("If-None-Match", etag);

            int code = conn.getResponseCode();
            if (code == HttpURLConnection.HTTP_NOT_MODIFIED) {
                store.touch();                       // данные те же, но они свежие
            } else if (code == HttpURLConnection.HTTP_OK) {
                int keepIndex = store.index();
                org.json.JSONArray oldCards = store.cards();
                store.save(readBody(conn), conn.getHeaderField("ETag"));
                // save() ставит позицию в начало — это верно для свежей пачки. Но если
                // сервер вернул ту же ленту, человек не должен терять место, на котором стоит.
                if (keepIndex > 0 && sameFirstCard(oldCards, store.cards())) store.setIndex(keepIndex);
            } else if (code == HttpURLConnection.HTTP_UNAUTHORIZED) {
                // Виджет выключили в настройках или токен истёк: забываем токен и кэш,
                // виджет покажет «подключите в приложении».
                store.clearToken();
                WidgetSync.cancelPeriodic(ctx);
            } else {
                Log.w(TAG, "Сервер ответил " + code);
                store.setError("HTTP " + code);
                DailyGoalWidgetProvider.redrawAll(ctx);
                return Result.retry();
            }
            store.clearError();

            DailyGoalWidgetProvider.redrawAll(ctx);
            return Result.success();

        } catch (Exception e) {
            Log.w(TAG, "Нет связи: " + e.getMessage());
            store.setError(e.getClass().getSimpleName());
            DailyGoalWidgetProvider.redrawAll(ctx);   // кэш с пометкой времени
            return Result.retry();
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Та же ли лента пришла: сравниваем первую карточку. */
    private static boolean sameFirstCard(org.json.JSONArray a, org.json.JSONArray b) {
        if (a == null || b == null || a.length() == 0 || b.length() == 0) return false;
        org.json.JSONObject x = a.optJSONObject(0), y = b.optJSONObject(0);
        return x != null && y != null && x.optInt("id") == y.optInt("id");
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
