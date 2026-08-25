package tools.seoshkin.translate.widget;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.graphics.Bitmap;
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
 * и будильников. Play к такому придирается, а мы туда собираемся. Уведомление даёт
 * то же самое — карточку на заблокированном экране — без единого дополнительного
 * разрешения (POST_NOTIFICATIONS у приложения уже есть).
 *
 * Уведомление беззвучное и постоянное: это не сообщение, а рабочая поверхность.
 */
public class WidgetNotification {

    private static final String CHANNEL_ID = "widget_card";
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

        RemoteViews view = DailyGoalWidgetProvider.buildViews(ctx, store, null, true);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(card.optString("question"))
                .setOngoing(true)                 // рабочая поверхность, а не сообщение
                .setSilent(true)                  // ни звука, ни вибрации: она обновляется часто
                .setShowWhen(false)
                .setOnlyAlertOnce(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                // Содержимое видно на заблокированном экране — ради этого всё и делается.
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setCustomContentView(view)
                .setCustomBigContentView(view)
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

    private static void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;

        NotificationChannel ch = new NotificationChannel(
                CHANNEL_ID,
                ctx.getString(R.string.widget_channel_name),
                NotificationManager.IMPORTANCE_LOW);   // без звука
        ch.setDescription(ctx.getString(R.string.widget_channel_desc));
        ch.setShowBadge(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }
}
