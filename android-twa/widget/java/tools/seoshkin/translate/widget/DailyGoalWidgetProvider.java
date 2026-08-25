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
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Date;
import java.util.Locale;

import tools.seoshkin.translate.R;

/**
 * Виджет-карточка: учим слова прямо на домашнем экране.
 *
 * Три вида карточек, и виджет не знает про них ничего сверх того, как их нарисовать:
 * что показывать и в каком порядке — решает сервер (services/widgetCards.js). Поэтому
 * состав виджета меняется деплоем, а не новым APK, который людям пришлось бы качать руками.
 *
 *   mc     — немецкое слово и четыре перевода на выбор;
 *   flip   — карточка: слово → перевод → честная самооценка «знал / не знал»;
 *   phrase — фраза урока с переводом, послушать и понять.
 *
 * Правильный ответ приходит вместе с карточкой, поэтому подсветка мгновенная, без
 * сетевого круга. Сам ответ уходит на сервер отдельно, очередью — данный в метро ответ
 * обязан дойти позже, для человека он уже засчитан.
 */
public class DailyGoalWidgetProvider extends AppWidgetProvider {

    public static final String ACTION_REFRESH = "tools.seoshkin.translate.ACTION_WIDGET_REFRESH";
    public static final String ACTION_ANSWER  = "tools.seoshkin.translate.ACTION_WIDGET_ANSWER";
    public static final String ACTION_FLIP    = "tools.seoshkin.translate.ACTION_WIDGET_FLIP";
    public static final String ACTION_SPEAK   = "tools.seoshkin.translate.ACTION_WIDGET_SPEAK";
    public static final String ACTION_NEXT    = "tools.seoshkin.translate.ACTION_WIDGET_NEXT";

    private static final String EXTRA_CHOICE = "choice";   // индекс выбранного варианта
    private static final String EXTRA_KNEW   = "knew";     // самооценка у карточки

    // Сколько держим подсветку верного/неверного, прежде чем показать следующую карточку.
    private static final long REVEAL_MS = 1200;

    private static final int[] OPTION_IDS = {
            R.id.widget_opt0, R.id.widget_opt1, R.id.widget_opt2, R.id.widget_opt3
    };

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) render(ctx, mgr, id, null);
        WidgetSync.requestNow(ctx);
    }

    @Override
    public void onEnabled(Context ctx) {
        WidgetSpeaker.warmUp(ctx);       // прогреваем синтезатор заранее
        WidgetSync.schedulePeriodic(ctx);
    }

    @Override
    public void onDisabled(Context ctx) {
        WidgetSync.cancelPeriodic(ctx);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String action = intent.getAction();
        if (action == null) return;

        WidgetStore store = new WidgetStore(ctx);

        switch (action) {
            case ACTION_REFRESH:
                // Человек нажал сам — значит хочет свежее. Забываем ETag, иначе сервер
                // ответит «не изменилось» и на экране не поменяется ровным счётом ничего.
                store.clearEtag();
                store.setIndex(0);
                WidgetSync.requestNow(ctx);
                redrawAll(ctx);
                break;

            case ACTION_SPEAK: {
                JSONObject card = store.currentCard();
                if (card != null) WidgetSpeaker.speak(ctx, card.optString("speak", card.optString("question")));
                break;
            }

            case ACTION_FLIP:
                // Карточка: открываем перевод, дальше человек оценивает себя сам.
                store.setFlipped(true);
                redrawAll(ctx);
                break;

            case ACTION_ANSWER: {
                JSONObject card = store.currentCard();
                if (card == null) break;
                boolean correct;
                if (intent.hasExtra(EXTRA_KNEW)) {
                    correct = intent.getBooleanExtra(EXTRA_KNEW, false);
                } else {
                    int choice = intent.getIntExtra(EXTRA_CHOICE, -1);
                    correct = choice >= 0 && choice == card.optInt("correct", -1);
                }
                answer(ctx, store, card, correct, intent.getIntExtra(EXTRA_CHOICE, -1));
                break;
            }

            case ACTION_NEXT:
                store.setIndex(store.index() + 1);
                redrawAll(ctx);
                // Лента кончилась — просим свежую пачку.
                if (store.currentCard() == null) WidgetSync.requestNow(ctx);
                break;
        }
    }

    /** Ответ на карточку: показать результат, положить в очередь, шагнуть дальше. */
    private void answer(Context ctx, WidgetStore store, JSONObject card, boolean correct, int chosen) {
        try {
            JSONObject a = new JSONObject();
            a.put("kind", card.optString("kind"));
            a.put("id", card.optInt("id"));
            a.put("correct", correct);
            a.put("answer", chosen >= 0 ? optionAt(card, chosen) : "");
            store.enqueueAnswer(a);
        } catch (Exception ignored) { }

        // Сначала показываем результат — человек должен увидеть, что было правильно.
        Reveal reveal = new Reveal(correct, chosen, card.optInt("correct", -1));
        redrawAll(ctx, reveal);

        // Отправку и переход к следующей карточке делает воркер: из onReceive нельзя ни
        // ждать сеть, ни спать — процесс убьют вместе с недоделанной работой.
        WidgetSync.sendAnswers(ctx, REVEAL_MS);
    }

    // ── Отрисовка ────────────────────────────────────────────────────────────

    public static void redrawAll(Context ctx) { redrawAll(ctx, null); }

    public static void redrawAll(Context ctx, Reveal reveal) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, DailyGoalWidgetProvider.class));
        for (int id : ids) render(ctx, mgr, id, reveal);
        // Карточка на экране блокировки показывает то же самое — обновляем вместе.
        WidgetNotification.update(ctx);
    }

    private static void render(Context ctx, AppWidgetManager mgr, int widgetId, Reveal reveal) {
        WidgetStore store = new WidgetStore(ctx);
        mgr.updateAppWidget(widgetId, buildViews(ctx, store, reveal, false));
    }

    /**
     * Собирает вид карточки. Один и тот же для виджета и для уведомления на экране
     * блокировки: расхождение между ними означало бы, что человек видит два разных
     * состояния одного и того же занятия.
     *
     * @param forNotification true — вид для уведомления (там нет смысла в кнопке «обновить»)
     */
    public static RemoteViews buildViews(Context ctx, WidgetStore store, Reveal reveal,
                                         boolean forNotification) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_daily_goal);

        // Прячем всё необязательное; ниже покажем только то, что нужно этой карточке.
        v.setViewVisibility(R.id.widget_image, View.GONE);
        v.setViewVisibility(R.id.widget_options, View.GONE);
        v.setViewVisibility(R.id.widget_flip_row, View.GONE);
        v.setViewVisibility(R.id.widget_answer, View.GONE);
        v.setViewVisibility(R.id.widget_question_row, View.GONE);
        // В уведомлении кнопка «обновить» лишняя: оно и так обновляется после каждого ответа.
        v.setViewVisibility(R.id.widget_refresh, forNotification ? View.GONE : View.VISIBLE);
        v.setOnClickPendingIntent(R.id.widget_refresh, broadcast(ctx, ACTION_REFRESH, 1));

        if (store.token() == null) {
            v.setTextViewText(R.id.widget_line1, ctx.getString(R.string.widget_not_connected));
            v.setProgressBar(R.id.widget_bar, 1, 0, false);
            v.setTextViewText(R.id.widget_line2, "");
            v.setOnClickPendingIntent(R.id.widget_root, openApp(ctx, "/settings"));
            return v;
        }

        JSONObject s = store.state();
        if (s == null) {
            v.setTextViewText(R.id.widget_line1, ctx.getString(R.string.widget_loading));
            v.setProgressBar(R.id.widget_bar, 1, 0, false);
            // Показываем причину, если сервер так и не ответил: иначе «Загрузка…» висит
            // вечно и одинаково выглядит при любой поломке.
            String err = store.lastError();
            v.setTextViewText(R.id.widget_line2, err == null ? "" : ctx.getString(R.string.widget_error, err));
            v.setOnClickPendingIntent(R.id.widget_root, openApp(ctx, "/"));
            return v;
        }

        renderHeader(ctx, v, s);

        JSONObject card = store.currentCard();
        String state = s.optString("state", "");

        if (card != null && "in_progress".equals(state)) {
            renderCard(ctx, v, store, card, reveal);
        } else if ("in_progress".equals(state)) {
            // Карточки в пачке кончились, а урок ещё не пройден. Раньше здесь появлялось
            // «Минимум сделан 🎉» — виджет объявлял победу вместо того, чтобы принести
            // следующую порцию. Теперь честная кнопка.
            renderContinue(ctx, v, s);
        } else {
            // Урок закрыт, ждём расписания или всё пройдено.
            v.setTextViewText(R.id.widget_line2, statusLine(ctx, s, store));
        }

        v.setOnClickPendingIntent(R.id.widget_root, openApp(ctx, s.optString("nextUrl", "/")));
        return v;
    }

    private static void renderHeader(Context ctx, RemoteViews v, JSONObject s) {
        JSONObject req = s.optJSONObject("required");
        int done = req == null ? 0 : req.optInt("done");
        int total = req == null ? 0 : req.optInt("total");
        String lesson = lessonTitle(s);

        if (total > 0) {
            v.setTextViewText(R.id.widget_line1,
                    (lesson.isEmpty() ? "" : lesson + " · ") + ctx.getString(R.string.widget_progress, done, total));
            v.setProgressBar(R.id.widget_bar, Math.max(total, 1), Math.min(done, total), false);
        } else {
            v.setTextViewText(R.id.widget_line1, lesson);
            v.setProgressBar(R.id.widget_bar, 1, 0, false);
        }
    }

    private static void renderCard(Context ctx, RemoteViews v, WidgetStore store,
                                   JSONObject card, Reveal reveal) {
        String kind = card.optString("kind", "mc");

        v.setViewVisibility(R.id.widget_question_row, View.VISIBLE);
        v.setTextViewText(R.id.widget_question, card.optString("question"));
        v.setOnClickPendingIntent(R.id.widget_speak, broadcast(ctx, ACTION_SPEAK, 2));

        // Картинка слова — только из кэша: качает её заранее воркер, здесь мы в главном
        // потоке приёмника и в сеть ходить нельзя.
        android.graphics.Bitmap image = WidgetImages.cached(ctx, card.optString("image", null));
        if (image != null) {
            v.setImageViewBitmap(R.id.widget_image, image);
            v.setViewVisibility(R.id.widget_image, View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.widget_image, View.GONE);
        }

        JSONObject state = store.state();

        if ("mc".equals(kind)) {
            renderChoice(ctx, v, card, reveal);
            // Пока не ответил — показываем полезное (серия, дневная норма, сколько
            // осталось до нового урока). Ответил — результат.
            v.setTextViewText(R.id.widget_line2,
                    reveal == null ? infoLine(ctx, state) : resultLine(ctx, card, reveal));
        } else if ("flip".equals(kind)) {
            renderFlip(ctx, v, store, card, reveal);
            v.setTextViewText(R.id.widget_line2, infoLine(ctx, state));
        } else {   // phrase
            v.setViewVisibility(R.id.widget_answer, View.VISIBLE);
            v.setTextViewText(R.id.widget_answer, card.optString("answer"));
            v.setViewVisibility(R.id.widget_flip_row, View.VISIBLE);
            v.setTextViewText(R.id.widget_flip_left, ctx.getString(R.string.widget_got_it));
            v.setOnClickPendingIntent(R.id.widget_flip_left, answerIntent(ctx, true, -1));
            v.setViewVisibility(R.id.widget_flip_right, View.GONE);
            v.setTextViewText(R.id.widget_line2, ctx.getString(R.string.widget_phrase));
        }
    }

    /** Пачка кончилась: одна крупная кнопка, которая приносит следующие карточки. */
    private static void renderContinue(Context ctx, RemoteViews v, JSONObject s) {
        JSONObject req = s.optJSONObject("required");
        boolean lessonDone = req != null && req.optInt("total") > 0
                && req.optInt("done") >= req.optInt("total");

        v.setViewVisibility(R.id.widget_flip_row, View.VISIBLE);
        v.setTextViewText(R.id.widget_flip_left, ctx.getString(R.string.widget_continue));
        v.setOnClickPendingIntent(R.id.widget_flip_left, broadcast(ctx, ACTION_REFRESH, 4));
        v.setViewVisibility(R.id.widget_flip_right, View.GONE);

        // «Минимум сделан» говорим только когда он ДЕЙСТВИТЕЛЬНО сделан — то есть
        // обязательные упражнения урока закрыты полностью.
        v.setTextViewText(R.id.widget_line2, lessonDone
                ? ctx.getString(R.string.widget_done_today)
                : infoLine(ctx, s));
    }

    /** «Выбери ответ»: четыре кнопки, после тапа — подсветка верного и неверного. */
    private static void renderChoice(Context ctx, RemoteViews v, JSONObject card, Reveal reveal) {
        JSONArray options = card.optJSONArray("options");
        if (options == null) return;
        v.setViewVisibility(R.id.widget_options, View.VISIBLE);

        for (int i = 0; i < OPTION_IDS.length; i++) {
            int id = OPTION_IDS[i];
            if (i >= options.length()) {
                v.setTextViewText(id, "");
                v.setInt(id, "setBackgroundResource", R.drawable.widget_option);
                continue;
            }
            v.setTextViewText(id, options.optString(i));

            int bg = R.drawable.widget_option;
            if (reveal != null) {
                if (i == reveal.correctIndex) bg = R.drawable.widget_option_correct;
                else if (i == reveal.chosenIndex) bg = R.drawable.widget_option_wrong;
            }
            v.setInt(id, "setBackgroundResource", bg);

            // Пока показан результат, повторные нажатия не принимаем: карточка уже отвечена.
            v.setOnClickPendingIntent(id, reveal == null ? answerIntent(ctx, false, i) : null);
        }
    }

    /** Карточка: слово → «показать перевод» → «знал / не знал». */
    private static void renderFlip(Context ctx, RemoteViews v, WidgetStore store,
                                   JSONObject card, Reveal reveal) {
        v.setViewVisibility(R.id.widget_flip_row, View.VISIBLE);
        boolean open = store.flipped() || reveal != null;

        if (!open) {
            v.setTextViewText(R.id.widget_flip_left, ctx.getString(R.string.widget_show_answer));
            v.setOnClickPendingIntent(R.id.widget_flip_left, broadcast(ctx, ACTION_FLIP, 3));
            v.setViewVisibility(R.id.widget_flip_right, View.GONE);
            return;
        }

        v.setViewVisibility(R.id.widget_answer, View.VISIBLE);
        v.setTextViewText(R.id.widget_answer, card.optString("answer"));

        v.setTextViewText(R.id.widget_flip_left, ctx.getString(R.string.widget_knew));
        v.setTextViewText(R.id.widget_flip_right, ctx.getString(R.string.widget_forgot));
        v.setViewVisibility(R.id.widget_flip_right, View.VISIBLE);

        if (reveal == null) {
            v.setOnClickPendingIntent(R.id.widget_flip_left, answerIntent(ctx, true, -1));
            v.setOnClickPendingIntent(R.id.widget_flip_right, answerIntent(ctx, false, -1));
        } else {
            v.setOnClickPendingIntent(R.id.widget_flip_left, null);
            v.setOnClickPendingIntent(R.id.widget_flip_right, null);
        }
    }

    // ── Строки состояния ─────────────────────────────────────────────────────

    /**
     * Нижняя строка: серия дней, дневная норма и сколько осталось до нового урока.
     * Внизу виджета всё равно остаётся свободное место — пусть работает.
     *
     * Важно не путать два числа: «сегодня 12/100» — личная дневная норма из настроек,
     * «до урока 48» — сколько обязательных шагов осталось до открытия следующего урока.
     */
    private static String infoLine(Context ctx, JSONObject s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();

        int streak = s.optInt("streak");
        if (streak > 0) sb.append(ctx.getString(R.string.widget_streak, streak));

        JSONObject today = s.optJSONObject("today");
        if (today != null && today.optInt("limit") > 0) {
            if (sb.length() > 0) sb.append(" · ");
            sb.append(ctx.getString(R.string.widget_today, today.optInt("done"), today.optInt("limit")));
        }

        JSONObject req = s.optJSONObject("required");
        if (req != null && req.optInt("total") > 0) {
            int left = Math.max(req.optInt("total") - req.optInt("done"), 0);
            if (left > 0) {
                if (sb.length() > 0) sb.append(" · ");
                sb.append(ctx.getString(R.string.widget_left, left));
            }
        }

        int tails = s.optInt("tails");
        if (tails > 0 && sb.length() < 40) {
            if (sb.length() > 0) sb.append(" · ");
            sb.append(ctx.getString(R.string.widget_tails, tails));
        }
        return sb.toString();
    }

    private static String resultLine(Context ctx, JSONObject card, Reveal reveal) {
        if (reveal.correct) return ctx.getString(R.string.widget_correct);
        JSONArray options = card.optJSONArray("options");
        String right = options != null && reveal.correctIndex >= 0 && reveal.correctIndex < options.length()
                ? options.optString(reveal.correctIndex) : "";
        return ctx.getString(R.string.widget_wrong, right);
    }

    private static String statusLine(Context ctx, JSONObject s, WidgetStore store) {
        String state = s.optString("state", "");
        if ("passed_waiting_calendar".equals(state)) {
            return ctx.getString(R.string.widget_waiting, humanDate(s.optString("nextUnlockDate", "")));
        }
        if ("no_schedule".equals(state)) return ctx.getString(R.string.widget_no_schedule);
        if ("all_done".equals(state))    return ctx.getString(R.string.widget_all_done);
        if ("in_progress".equals(state)) return ctx.getString(R.string.widget_done_today);

        long age = System.currentTimeMillis() - store.syncedAt();
        if (store.syncedAt() > 0 && age > 2 * 60 * 60 * 1000L) {
            return ctx.getString(R.string.widget_stale,
                    DateFormat.getTimeFormat(ctx).format(new Date(store.syncedAt())));
        }
        return ctx.getString(R.string.widget_no_lessons);
    }

    private static String lessonTitle(JSONObject s) {
        JSONObject lesson = s.optJSONObject("lesson");
        if (lesson == null) return "";
        JSONObject tr = lesson.optJSONObject("title_translations");
        String lang = Locale.getDefault().getLanguage();
        if (tr != null && tr.has(lang)) return tr.optString(lang);
        return lesson.optString("title", "");
    }

    private static String humanDate(String iso) {
        if (iso == null || iso.length() < 10) return "";
        return iso.substring(8, 10) + "." + iso.substring(5, 7);
    }

    private static String optionAt(JSONObject card, int i) {
        JSONArray options = card.optJSONArray("options");
        return options != null && i >= 0 && i < options.length() ? options.optString(i) : "";
    }

    // ── Намерения ────────────────────────────────────────────────────────────

    private static PendingIntent answerIntent(Context ctx, boolean knew, int choice) {
        Intent i = new Intent(ctx, DailyGoalWidgetProvider.class).setAction(ACTION_ANSWER);
        if (choice >= 0) i.putExtra(EXTRA_CHOICE, choice);
        else i.putExtra(EXTRA_KNEW, knew);
        // Разный requestCode на вариант: иначе система переиспользует один PendingIntent
        // и все кнопки станут одной и той же — классическая ошибка в виджетах.
        return PendingIntent.getBroadcast(ctx, 100 + (choice >= 0 ? choice : (knew ? 8 : 9)), i, flags());
    }

    private static PendingIntent broadcast(Context ctx, String action, int code) {
        Intent i = new Intent(ctx, DailyGoalWidgetProvider.class).setAction(action);
        return PendingIntent.getBroadcast(ctx, code, i, flags());
    }

    private static PendingIntent openApp(Context ctx, String path) {
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(WidgetSync.BASE_URL + path + "?from=widget"));
        i.setPackage(ctx.getPackageName());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(ctx, path.hashCode(), i, flags());
    }

    private static int flags() {
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) f |= PendingIntent.FLAG_IMMUTABLE;
        return f;
    }

    /** Что подсветить после ответа: верный вариант и, если промах, выбранный. */
    public static class Reveal {
        final boolean correct;
        final int chosenIndex;
        final int correctIndex;

        Reveal(boolean correct, int chosenIndex, int correctIndex) {
            this.correct = correct;
            this.chosenIndex = chosenIndex;
            this.correctIndex = correctIndex;
        }
    }
}
