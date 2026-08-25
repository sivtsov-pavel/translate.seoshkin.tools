package tools.seoshkin.translate.widget;

import android.app.Activity;
import android.app.Application;
import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

/**
 * Подписка на жизненный цикл приложения без своего класса Application.
 *
 * Почему так: Gradle-проект TWA генерируется bubblewrap-ом заново при каждой пересборке,
 * и чем меньше мы правим в сгенерированных файлах, тем меньше шансов, что однажды
 * пересборка тихо всё сломает. ContentProvider стартует сам при запуске процесса —
 * его достаточно ДОБАВИТЬ в манифест, ничего не заменяя.
 *
 * Задача одна: человек вышел из приложения — обновить виджет. Это главный момент
 * актуальности: он только что позанимался и сейчас увидит домашний экран.
 */
public class WidgetBootstrapProvider extends ContentProvider {

    @Override
    public boolean onCreate() {
        Application app = (Application) getContext().getApplicationContext();
        // Синтезатор поднимается заранее: из обработчика нажатия ждать его инициализацию
        // нельзя, и половина нажатий 🔊 уходила бы в тишину.
        WidgetSpeaker.warmUp(app);
        app.registerActivityLifecycleCallbacks(new Application.ActivityLifecycleCallbacks() {
            private int visible = 0;

            @Override public void onActivityStarted(@NonNull Activity a) { visible++; }

            @Override public void onActivityStopped(@NonNull Activity a) {
                visible--;
                // Ушла последняя видимая активность — приложение свёрнуто или закрыто.
                if (visible <= 0) {
                    visible = 0;
                    if (new WidgetStore(a).token() != null) WidgetSync.requestNow(a);
                }
            }

            @Override public void onActivityCreated(@NonNull Activity a, @Nullable Bundle b) { }
            @Override public void onActivityResumed(@NonNull Activity a) { }
            @Override public void onActivityPaused(@NonNull Activity a) { }
            @Override public void onActivitySaveInstanceState(@NonNull Activity a, @NonNull Bundle b) { }
            @Override public void onActivityDestroyed(@NonNull Activity a) { }
        });
        return true;
    }

    // Данные наружу не отдаём: провайдер здесь только ради раннего старта.
    @Nullable @Override public Cursor query(@NonNull Uri u, @Nullable String[] p, @Nullable String s,
                                            @Nullable String[] sa, @Nullable String so) { return null; }
    @Nullable @Override public String getType(@NonNull Uri u) { return null; }
    @Nullable @Override public Uri insert(@NonNull Uri u, @Nullable ContentValues v) { return null; }
    @Override public int delete(@NonNull Uri u, @Nullable String s, @Nullable String[] a) { return 0; }
    @Override public int update(@NonNull Uri u, @Nullable ContentValues v, @Nullable String s,
                                @Nullable String[] a) { return 0; }
}
