package tools.seoshkin.translate.widget;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.text.format.DateFormat;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.Date;

import tools.seoshkin.translate.R;

/**
 * Виджет «сколько осталось до нового урока».
 *
 * Рисует ТОЛЬКО то, что лежит в кэше: сам никуда не ходит и ничего не считает. Данные
 * приносит WidgetSyncWorker. Так виджет и приложение всегда показывают одно число —
 * расхождение здесь дороже любой задержки.
 */
public class DailyGoalWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_REFRESH = "tools.seoshkin.translate.ACTION_WIDGET_REFRESH";

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) render(ctx, mgr, id);
        WidgetSync.requestNow(ctx);        // и сразу просим свежие данные
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) WidgetSync.requestNow(ctx);
    }

    @Override
    public void onEnabled(Context ctx) {
        WidgetSync.schedulePeriodic(ctx);
    }

    @Override
    public void onDisabled(Context ctx) {
        // Виджетов на экране не осталось — перестаём будить телефон.
        WidgetSync.cancelPeriodic(ctx);
    }

    /** Перерисовать все экземпляры виджета. Зовётся из воркера после ответа сервера. */
    public static void redrawAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, DailyGoalWidgetProvider.class));
        for (int id : ids) render(ctx, mgr, id);
    }

    private static void render(Context ctx, AppWidgetManager mgr, int widgetId) {
        WidgetStore store = new WidgetStore(ctx);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_daily_goal);

        if (store.token() == null) {
            // Виджет не подключён: одна понятная строка и тап, ведущий в настройки.
            v.setTextViewText(R.id.widget_line1, ctx.getString(R.string.widget_not_connected));
            v.setTextViewText(R.id.widget_line2, "");
            v.setProgressBar(R.id.widget_bar, 1, 0, false);
            v.setOnClickPendingIntent(R.id.widget_root, openApp(ctx, "/settings"));
            mgr.updateAppWidget(widgetId, v);
            return;
        }

        JSONObject s = store.state();
        if (s == null) {
            v.setTextViewText(R.id.widget_line1, ctx.getString(R.string.widget_loading));
            v.setTextViewText(R.id.widget_line2, "");
            v.setProgressBar(R.id.widget_bar, 1, 0, false);
            v.setOnClickPendingIntent(R.id.widget_root, openApp(ctx, "/"));
            v.setOnClickPendingIntent(R.id.widget_refresh, refreshIntent(ctx));
            mgr.updateAppWidget(widgetId, v);
            return;
        }

        String state = s.optString("state", "");
        String line1, line2 = "";
        int max = 1, progress = 0;

        if ("in_progress".equals(state)) {
            JSONObject req = s.optJSONObject("required");
            int done  = req == null ? 0 : req.optInt("done");
            int total = req == null ? 0 : req.optInt("total");
            max = Math.max(total, 1);
            progress = Math.min(done, max);
            line1 = lessonTitle(s) + " — " + ctx.getString(R.string.widget_progress, done, total);
            line2 = extras(ctx, s);
        } else if ("passed_waiting_calendar".equals(state)) {
            String date = s.optString("nextUnlockDate", "");
            line1 = ctx.getString(R.string.widget_waiting, humanDate(ctx, date));
            line2 = extras(ctx, s);
            max = 1; progress = 1;                       // урок закрыт — полоса полная
        } else if ("no_schedule".equals(state)) {
            line1 = ctx.getString(R.string.widget_no_schedule);
        } else if ("all_done".equals(state)) {
            line1 = ctx.getString(R.string.widget_all_done);
            max = 1; progress = 1;
        } else {
            line1 = ctx.getString(R.string.widget_no_lessons);
        }

        // Данные могли устареть (не было сети) — говорим об этом прямо, а не показываем
        // старое число как свежее.
        long age = System.currentTimeMillis() - store.syncedAt();
        if (age > 2 * 60 * 60 * 1000L && store.syncedAt() > 0) {
            String time = DateFormat.getTimeFormat(ctx).format(new Date(store.syncedAt()));
            line2 = ctx.getString(R.string.widget_stale, time);
        }

        v.setTextViewText(R.id.widget_line1, line1);
        v.setTextViewText(R.id.widget_line2, line2);
        v.setProgressBar(R.id.widget_bar, max, progress, false);
        v.setOnClickPendingIntent(R.id.widget_root, openApp(ctx, s.optString("nextUrl", "/")));
        v.setOnClickPendingIntent(R.id.widget_refresh, refreshIntent(ctx));
        mgr.updateAppWidget(widgetId, v);
    }

    /** Название урока на языке телефона, если перевод есть. */
    private static String lessonTitle(JSONObject s) {
        JSONObject lesson = s.optJSONObject("lesson");
        if (lesson == null) return "";
        JSONObject tr = lesson.optJSONObject("title_translations");
        String lang = java.util.Locale.getDefault().getLanguage();
        if (tr != null && tr.has(lang)) return tr.optString(lang);
        return lesson.optString("title", "");
    }

    /** Вторая строка: серия дней и хвосты — то, что мотивирует и напоминает. */
    private static String extras(Context ctx, JSONObject s) {
        StringBuilder sb = new StringBuilder();
        int streak = s.optInt("streak");
        int tails  = s.optInt("tails");
        if (streak > 0) sb.append(ctx.getString(R.string.widget_streak, streak));
        if (tails > 0) {
            if (sb.length() > 0) sb.append(" · ");
            sb.append(ctx.getString(R.string.widget_tails, tails));
        }
        return sb.toString();
    }

    private static String humanDate(Context ctx, String iso) {
        if (iso == null || iso.length() < 10) return "";
        // ISO приходит как 2026-08-31 — показываем в привычном виде «31.08».
        return iso.substring(8, 10) + "." + iso.substring(5, 7);
    }

    private static PendingIntent openApp(Context ctx, String path) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(WidgetSync.BASE_URL + path + "?from=widget"));
        i.setPackage(ctx.getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(ctx, path.hashCode(), i, flags());
    }

    private static PendingIntent refreshIntent(Context ctx) {
        Intent i = new Intent(ctx, DailyGoalWidgetProvider.class).setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(ctx, 1, i, flags());
    }

    private static int flags() {
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) f |= PendingIntent.FLAG_IMMUTABLE;
        return f;
    }
}
