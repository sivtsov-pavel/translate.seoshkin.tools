package tools.seoshkin.translate.widget;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.RemoteViews;

import tools.seoshkin.translate.R;

/**
 * Карточка ПОВЕРХ экрана блокировки — шаг до разблокировки (замысел Павла 14.09.2026,
 * референс — WordBit).
 *
 * ЧЕГО ЭТОТ ЭКРАН НЕ ДЕЛАЕТ И НЕ МОЖЕТ. Он не заменяет разблокировку. Заменить её не
 * может ни одно стороннее приложение: PIN, отпечаток и лицо живут в системном keyguard,
 * и обойти их — дыра в безопасности телефона, а не возможность. Мы рисуемся НАД
 * keyguard-ом (setShowWhenLocked) и, когда человек ответил, просим систему увести
 * блокировку (requestDismissKeyguard):
 *
 *   • PIN не стоит  → телефон действительно открывается нажатием на слово;
 *   • PIN стоит     → система показывает свой ввод PIN, как обычно.
 *
 * Вид берём ровно тот же, что у виджета и уведомления: RemoteViews.apply() возвращает
 * обычный View, который кладётся в активность. Своей копии разметки и своей логики
 * ответов здесь нет намеренно — расхождение между тремя поверхностями означало бы, что
 * человек видит три разных состояния одного занятия.
 *
 * Кнопки внутри карточки шлют broadcast в DailyGoalWidgetProvider, тот пишет ответ в
 * WidgetStore (SharedPreferences) — поэтому перерисовываемся по слушателю префов, а не
 * по своему таймеру.
 */
public class LockCardActivity extends Activity implements SharedPreferences.OnSharedPreferenceChangeListener {

    private FrameLayout host;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);

        // Показ поверх замка и включение экрана. С API 27 — нормальные методы, ниже —
        // те же флаги окна (они объявлены устаревшими, но на 21–26 другого пути нет).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        setContentView(R.layout.lock_card);
        host = findViewById(R.id.lock_host);

        findViewById(R.id.lock_unlock).setOnClickListener(v -> dismissKeyguard());
        // Крестик — «не сейчас»: карточка уходит, телефон остаётся заблокированным.
        findViewById(R.id.lock_close).setOnClickListener(v -> finish());

        prefs = getSharedPreferences("widget_store", Context.MODE_PRIVATE);
        render();
    }

    @Override
    protected void onStart() {
        super.onStart();
        prefs.registerOnSharedPreferenceChangeListener(this);
        // Пока карточка на экране, свежие данные не помешают: ответы могли уйти с виджета.
        WidgetSync.requestNow(this);
        render();
    }

    @Override
    protected void onStop() {
        prefs.unregisterOnSharedPreferenceChangeListener(this);
        super.onStop();
        // Экран погас или человек ушёл — карточку не держим в стеке: при следующем
        // включении экрана её покажет сервис, причём с уже свежим состоянием.
        finish();
    }

    @Override
    public void onSharedPreferenceChanged(SharedPreferences sp, String key) {
        runOnUiThread(this::render);
    }

    /** Пересобрать карточку из общего вида виджета. */
    private void render() {
        WidgetStore store = new WidgetStore(this);
        // true — компактная разметка (та же, что в развёрнутом уведомлении): она
        // рассчитана на узкую полосу и не требует места домашнего экрана.
        RemoteViews rv = DailyGoalWidgetProvider.buildViews(this, store, null, true);
        View card = rv.apply(this, host);
        host.removeAllViews();
        host.addView(card);
    }

    /** Ответили — уводим замок. С PIN система спросит его сама, и это правильно. */
    private void dismissKeyguard() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) {
                km.requestDismissKeyguard(this, new KeyguardManager.KeyguardDismissCallback() {
                    @Override public void onDismissSucceeded() { finish(); }
                    @Override public void onDismissCancelled() { /* остался на замке — карточка живёт */ }
                });
                return;
            }
        }
        finish();
    }
}
