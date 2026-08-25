package tools.seoshkin.translate.widget;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Картинки слов для виджета и уведомления.
 *
 * Два жёстких ограничения, из которых всё вытекает:
 *  • виджет получает картинку через системный канал с лимитом около мегабайта на передачу —
 *    полноразмерное изображение просто не дойдёт, виджет останется пустым;
 *  • рисование идёт в главном потоке приёмника, скачивать оттуда нельзя.
 *
 * Поэтому: качаем заранее (в воркере), сразу ужимаем до маленького размера, храним файлом.
 * Рисование берёт только готовый файл и никогда не ходит в сеть.
 */
public class WidgetImages {

    private static final String TAG = "WidgetImages";
    private static final String DIR = "widget-images";

    // 240×180 хватает для картинки размером с ноготь на виджете и укладывается в лимит
    // передачи с большим запасом (примерно 170 КБ в памяти).
    private static final int MAX_SIDE = 240;

    private static final int TIMEOUT_MS = 10000;

    /** Готовая картинка или null. В сеть НЕ ходит — только смотрит кэш. */
    public static Bitmap cached(Context ctx, String url) {
        File f = fileFor(ctx, url);
        if (f == null || !f.exists()) return null;
        try {
            return BitmapFactory.decodeFile(f.getAbsolutePath());
        } catch (Throwable t) {          // OutOfMemory тоже сюда: виджет важнее картинки
            Log.w(TAG, "Не читается: " + t.getMessage());
            return null;
        }
    }

    /** Скачать и положить в кэш, если её там ещё нет. Только из фонового потока. */
    public static void prefetch(Context ctx, String url) {
        File f = fileFor(ctx, url);
        if (f == null || f.exists()) return;

        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setConnectTimeout(TIMEOUT_MS);
            conn.setReadTimeout(TIMEOUT_MS);
            if (conn.getResponseCode() != HttpURLConnection.HTTP_OK) return;

            Bitmap full;
            try (InputStream in = conn.getInputStream()) {
                full = BitmapFactory.decodeStream(in);
            }
            if (full == null) return;

            Bitmap small = scale(full);
            try (FileOutputStream out = new FileOutputStream(f)) {
                small.compress(Bitmap.CompressFormat.PNG, 90, out);
            }
            if (small != full) full.recycle();
        } catch (Throwable t) {
            Log.w(TAG, "Не скачалась: " + t.getMessage());
            if (f.exists()) f.delete();     // недокачанный файл хуже отсутствующего
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Убрать всё, что не нужно текущей ленте: кэш не должен расти бесконечно. */
    public static void cleanup(Context ctx, java.util.Set<String> keepUrls) {
        File dir = dir(ctx);
        File[] files = dir.listFiles();
        if (files == null) return;

        java.util.HashSet<String> keep = new java.util.HashSet<>();
        for (String u : keepUrls) {
            File f = fileFor(ctx, u);
            if (f != null) keep.add(f.getName());
        }
        for (File f : files) {
            if (!keep.contains(f.getName())) f.delete();
        }
    }

    private static Bitmap scale(Bitmap src) {
        int w = src.getWidth(), h = src.getHeight();
        int max = Math.max(w, h);
        if (max <= MAX_SIDE) return src;
        float k = (float) MAX_SIDE / max;
        return Bitmap.createScaledBitmap(src, Math.round(w * k), Math.round(h * k), true);
    }

    private static File dir(Context ctx) {
        File d = new File(ctx.getCacheDir(), DIR);
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static File fileFor(Context ctx, String url) {
        if (url == null || url.isEmpty()) return null;
        // Имя файла — из ссылки: в ней есть ?v=N, поэтому обновлённая картинка
        // получает другое имя и старая не подменяет новую.
        return new File(dir(ctx), Integer.toHexString(url.hashCode()) + ".png");
    }
}
