package tools.seoshkin.translate.widget;

import android.content.Context;

import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/** Планирование обновлений виджета. */
public class WidgetSync {

    // Основной домен приложения. При смене домена правится здесь И в twa-manifest.json.
    public static final String BASE_URL  = "https://deutschlernen.ai";
    public static final String STATE_URL  = BASE_URL + "/api/widget/state";
    public static final String ANSWER_URL = BASE_URL + "/api/widget/answer";

    private static final String WORK_NOW      = "widget-now";
    private static final String WORK_ANSWERS  = "widget-answers";
    private static final String WORK_PERIODIC = "widget-periodic";

    // Полчаса — компромисс: система всё равно не даёт периодике чаще 15 минут, а главную
    // актуальность даёт не она, а обновление при выходе из приложения (WidgetBootstrapProvider).
    private static final long PERIOD_MINUTES = 30;

    private static Constraints network() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }

    /** Обновить сейчас (выход из приложения, кнопка на виджете, добавление виджета). */
    public static void requestNow(Context ctx) {
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(WidgetSyncWorker.class)
                .setConstraints(network())
                .build();
        WorkManager.getInstance(ctx).enqueueUniqueWork(WORK_NOW, ExistingWorkPolicy.REPLACE, req);
    }

    /**
     * Отправить накопленные ответы. Задержка нужна, чтобы человек успел увидеть подсветку
     * верного варианта — иначе карточка сменится прямо под пальцем.
     */
    public static void sendAnswers(Context ctx, long delayMs) {
        OneTimeWorkRequest req = new OneTimeWorkRequest.Builder(WidgetAnswerWorker.class)
                .setInitialDelay(delayMs, TimeUnit.MILLISECONDS)
                .build();
        // APPEND_OR_REPLACE: два быстрых ответа подряд не должны отменять друг друга —
        // иначе первый останется в очереди неотправленным до следующего раза.
        WorkManager.getInstance(ctx).enqueueUniqueWork(
                WORK_ANSWERS, ExistingWorkPolicy.APPEND_OR_REPLACE, req);
    }

    /** Фоновая подстраховка: смена суток, занятия с другого устройства. */
    public static void schedulePeriodic(Context ctx) {
        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(
                WidgetSyncWorker.class, PERIOD_MINUTES, TimeUnit.MINUTES)
                .setConstraints(network())
                .build();
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
                WORK_PERIODIC, ExistingPeriodicWorkPolicy.KEEP, req);
    }

    /** Виджет убран или отключён — перестаём будить телефон. */
    public static void cancelPeriodic(Context ctx) {
        WorkManager.getInstance(ctx).cancelUniqueWork(WORK_PERIODIC);
    }

    // Изучаемый язык виджет НЕ передаёт: нативная часть его не знает и знать не может.
    // Он записан на сервере рядом с токеном (widget_tokens.target_lang) — приложение
    // обновляет его при смене языка. Иначе ученик, перешедший на испанский, видел бы
    // на домашнем экране прогресс по немецкому.
}
