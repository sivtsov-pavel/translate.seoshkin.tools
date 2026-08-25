package tools.seoshkin.translate.widget;

import android.content.Context;
import android.speech.tts.TextToSpeech;
import android.util.Log;

import java.util.Locale;

/**
 * Озвучка немецкого слова по кнопке 🔊 на виджете.
 *
 * Синтезатор живёт в статике процесса и инициализируется заранее (WidgetBootstrapProvider).
 * Иначе пришлось бы ждать инициализацию прямо в onReceive, а там у нас около десяти секунд
 * до того, как систему устроит прибить процесс: половина нажатий уходила бы в тишину.
 *
 * Если на момент нажатия движок ещё не готов, слово запоминается и произносится сразу
 * после инициализации — молчаливого нажатия человек не увидит.
 */
public class WidgetSpeaker {

    private static final String TAG = "WidgetSpeaker";

    private static TextToSpeech tts;
    private static boolean ready = false;
    private static String pending = null;

    /** Прогреть движок заранее. Зовётся при старте процесса приложения. */
    public static synchronized void warmUp(Context ctx) {
        if (tts != null) return;
        Context app = ctx.getApplicationContext();
        tts = new TextToSpeech(app, status -> {
            ready = status == TextToSpeech.SUCCESS;
            if (ready) {
                // Слова у нас немецкие — язык фиксированный, а не системный.
                int res = tts.setLanguage(Locale.GERMAN);
                if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                    Log.w(TAG, "Немецкий голос не установлен");
                    ready = false;
                }
            }
            String waiting;
            synchronized (WidgetSpeaker.class) {
                waiting = pending;
                pending = null;
            }
            if (waiting != null) speak(app, waiting);
        });
    }

    /** Произнести слово. Безопасно звать из BroadcastReceiver. */
    public static void speak(Context ctx, String text) {
        if (text == null || text.trim().isEmpty()) return;
        synchronized (WidgetSpeaker.class) {
            if (tts == null) {
                pending = text;
                warmUp(ctx);
                return;
            }
            if (!ready) {          // движок ещё поднимается — скажем, как будет готов
                pending = text;
                return;
            }
        }
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "widget-word");
    }
}
