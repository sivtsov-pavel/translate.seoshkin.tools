package tools.seoshkin.translate.widget;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.core.app.NotificationCompat;

import tools.seoshkin.translate.R;

/**
 * Сторож экрана: включили экран — показываем карточку поверх замка.
 *
 * ПОЧЕМУ ЦЕЛЫЙ СЕРВИС РАДИ ОДНОГО СОБЫТИЯ. ACTION_SCREEN_ON нельзя поймать статическим
 * приёмником из манифеста — система рассылает его только тем, кто подписался в коде и
 * живёт в этот момент. Значит нужен процесс, который жив всегда. А запускать активность
 * из фона с Android 10 запрещено, и единственное законное исключение, которое нам
 * подходит, — это foreground-сервис.
 *
 * ЦЕНА, КОТОРУЮ ПЛАТИТ ПОЛЬЗОВАТЕЛЬ, и её надо назвать вслух:
 *   • постоянное уведомление «приложение работает» — от него никуда не деться;
 *   • расход батареи выше, чем у нынешней карточки в уведомлении;
 *   • на Xiaomi/Huawei нужно отдельно разрешить «всплывающие окна в фоне», иначе
 *     активность просто не появится, молча;
 *   • Google Play к приложениям, рисующим поверх замка, придирается — это надо
 *     проверять до выкладки, а не после.
 *
 * Поэтому режим по умолчанию ВЫКЛЮЧЕН и включается тумблером (WidgetStore.lockOn).
 */
public class LockCardService extends Service {

    private static final String TAG = "LockCard";
    private static final String CHANNEL_ID = "lock_card_guard";
    private static final int NOTIFICATION_ID = 4202;

    private BroadcastReceiver receiver;

    /** Включить или выключить сторожа — единственная точка входа для остального кода. */
    public static void apply(Context ctx) {
        WidgetStore store = new WidgetStore(ctx);
        Intent i = new Intent(ctx, LockCardService.class);
        if (store.lockOn() && store.token() != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i);
            else ctx.startService(i);
        } else {
            ctx.stopService(i);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        ensureChannel();
        startForeground(NOTIFICATION_ID, notification());

        receiver = new BroadcastReceiver() {
            @Override public void onReceive(Context ctx, Intent intent) {
                if (!Intent.ACTION_SCREEN_ON.equals(intent.getAction())) return;
                WidgetStore store = new WidgetStore(ctx);
                if (!store.lockOn() || store.token() == null) return;
                Log.i(TAG, "экран включился — показываем карточку");
                Intent card = new Intent(ctx, LockCardActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                                | Intent.FLAG_ACTIVITY_CLEAR_TOP
                                | Intent.FLAG_ACTIVITY_NO_HISTORY);
                ctx.startActivity(card);
            }
        };
        IntentFilter f = new IntentFilter(Intent.ACTION_SCREEN_ON);
        // С targetSdk 34 регистрация без флага экспорта — ошибка: система требует явно
        // сказать, принимаем ли мы broadcast-ы чужих приложений. Наш — только системный.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(receiver, f, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(receiver, f);
        }
        Log.i(TAG, "сторож экрана запущен");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Система убила процесс — вернуться и снова слушать экран.
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        if (receiver != null) {
            try { unregisterReceiver(receiver); } catch (IllegalArgumentException ignored) { }
            receiver = null;
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private Notification notification() {
        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(getString(R.string.lock_service_title))
                .setContentText(getString(R.string.lock_service_text))
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setOngoing(true)
                .setShowWhen(false)
                .build();
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;
        // MIN: это служебная строка «приложение работает», а не сообщение человеку.
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID,
                getString(R.string.lock_channel_name), NotificationManager.IMPORTANCE_MIN);
        ch.setDescription(getString(R.string.lock_channel_desc));
        ch.setShowBadge(false);
        nm.createNotificationChannel(ch);
    }
}
