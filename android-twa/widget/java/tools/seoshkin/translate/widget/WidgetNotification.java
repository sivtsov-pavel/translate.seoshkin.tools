package tools.seoshkin.translate.widget;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.widget.RemoteViews;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONObject;

import tools.seoshkin.translate.R;

/**
 * Та же карточка, но в уведомлении — чтобы отвечать, не разблокируя телефон.
 *
 * Почему уведомление, а не свой экран поверх блокировки (как делает WordBit): с Android 10
 * запуск активности из фона запрещён, обход требует либо разрешения «поверх других окон»,
 * которое человек выдаёт руками, либо full-screen intent, предназначенного для звонков
 * и будильников. Play к такому придирается, а мы туда собираемся.
 *
 * ДВА УРОКА, ОПЛАЧЕННЫЕ ПРОВЕРКОЙ НА ТЕЛЕФОНЕ (25.08.2026):
 *
 * 1. Важность канала LOW не годится. Такие уведомления система считает «тихими», убирает
 *    в отдельную секцию и на экране блокировки обычно не показывает совсем. Нужен DEFAULT,
 *    а тишину делаем явно: без звука и без вибрации. Важность существующего канала повысить
 *    нельзя ни программно, ни как-либо ещё — поэтому канал новый, старый удаляем.
 *
 * 2. На экране блокировки уведомление показывается СВЁРНУТЫМ, а свёрнутый вид ограничен
 *    примерно 64dp по высоте: карточка с четырьмя кнопками туда не помещается и обрезается.
 *    Поэтому видов два: компактный (слово, прогресс, приглашение развернуть) и полный
 *    с кнопками — он раскрывается жестом вниз по уведомлению, разблокировать телефон
 *    по-прежнему не нужно.
 */
public class WidgetNotification {

    // v2: у канала v1 была важность LOW, а поменять её у существующего канала нельзя.
    private static final String CHANNEL_ID     = "widget_card_v2";
    private static final String CHANNEL_ID_OLD = "widget_card";
    private static final int NOTIFICATION_ID = 4201;

    /** Показать или обновить карточку в уведомлении. Ничего не делает, если выключено. */
    public static void update(Context ctx) {
        WidgetStore store = new WidgetStore(ctx);
        if (!store.notificationOn() || store.token() == null) {
            hide(ctx);
            return;
        }

        JSONObject card = store.currentCard();
        JSONObject state = store.state();
        if (card == null || state == null) {
            hide(ctx);
            return;
        }

        ensureChannel(ctx);

        RemoteViews big   = DailyGoalWidgetProvider.buildViews(ctx, store, null, true);
        RemoteViews small = buildCompact(ctx, store, card, state);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setOngoing(true)                 // рабочая поверхность, а не сообщение
                .setSilent(true)                  // обновляется часто — звонить об этом незачем
                .setShowWhen(false)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                // Содержимое видно на заблокированном экране — ради этого всё и делается.
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCustomContentView(small)
                .setCustomBigContentView(big)
                .setStyle(new NotificationCompat.DecoratedCustomViewStyle());

        try {
            NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, b.build());
        } catch (SecurityException e) {
            // Android 13+: человек не дал разрешение на уведомления. Молча выключаем,
            // чтобы не пытаться снова при каждом ответе.
            store.setNotificationOn(false);
        }
    }

    public static void hide(Context ctx) {
        NotificationManagerCompat.from(ctx).cancel(NOTIFICATION_ID);
    }

    /** Свёрнутый вид: то, что реально видно на экране блокировки до раскрытия. */
    private static RemoteViews buildCompact(Context ctx, WidgetStore store,
                                            JSONObject card, JSONObject state) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_notification_small);
        v.setTextViewText(R.id.note_word, card.optString("question"));

        JSONObject req = state.optJSONObject("required");
        int done  = req == null ? 0 : req.optInt("done");
        int total = req == null ? 0 : req.optInt("total");
        v.setTextViewText(R.id.note_progress,
                total > 0 ? ctx.getString(R.string.widget_progress, done, total) : "");

        v.setTextViewText(R.id.note_hint, ctx.getString(R.string.widget_expand_hint));

        android.graphics.Bitmap image = WidgetImages.cached(ctx, card.optString("image", null));
        if (image != null) {
            v.setImageViewBitmap(R.id.note_image, image);
            v.setViewVisibility(R.id.note_image, android.view.View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.note_image, android.view.View.GONE);
        }
        return v;
    }

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        // Канал с прежней (низкой) важностью убираем: именно из-за неё карточки не было
        // на экране блокировки.
        if (nm.getNotificationChannel(CHANNEL_ID_OLD) != null) {
            nm.deleteNotificationChannel(CHANNEL_ID_OLD);
        }
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID,
                ctx.getString(R.string.widget_channel_name),
                NotificationManager.IMPORTANCE_DEFAULT);   // видно на локскрине
        ch.setDescription(ctx.getString(R.string.widget_channel_desc));
        ch.setShowBadge(false);
        ch.setSound(null, null);          // тишина делается здесь, а не понижением важности
        ch.enableVibration(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }
}
