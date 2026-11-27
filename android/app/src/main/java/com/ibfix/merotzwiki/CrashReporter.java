package com.ibfix.merotzwiki;

import android.content.Context;
import android.content.SharedPreferences;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Global uncaught-exception handler for the Android shell. A crash is stored (synchronously) and sent to
 * ntfy.sh on the next launch / when the network is available, at most NTFY_MAX_PER_HOUR per hour.
 * Topic and limits come from config/crash-reporting.json via BuildConfig. No personal data is sent.
 * Errors inside the web game are reported by the web app itself (src/lib/crash.js).
 */
public final class CrashReporter {
    private static final String PREFS = "mw_crash";
    private static final String Q = "queue";   // messages separated by \u001E
    private static final String SENT = "sent"; // timestamps separated by ,
    private static final char SEP = '\u001E';

    private CrashReporter() {}

    static boolean enabled() {
        return BuildConfig.NTFY_TOPIC != null && !BuildConfig.NTFY_TOPIC.isEmpty() && !BuildConfig.DEBUG;
    }

    public static void install(Context context) {
        final Context app = context.getApplicationContext();
        final Thread.UncaughtExceptionHandler previous = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, error) -> {
            try {
                if (enabled()) enqueue(app, CrashReportLogic.buildMessage(BuildConfig.NTFY_TOPIC, BuildConfig.VERSION_NAME, "native:" + thread.getName(), error));
            } catch (Throwable ignored) {
            }
            if (previous != null) previous.uncaughtException(thread, error);
        });
        flushAsync(app);
    }

    static synchronized void enqueue(Context app, String json) {
        SharedPreferences p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        List<String> q = split(p.getString(Q, ""));
        q.add(json);
        q = CrashReportLogic.trimQueue(q, BuildConfig.NTFY_MAX_QUEUE);
        p.edit().putString(Q, join(q)).commit(); // commit: the process is about to die
    }

    public static void flushAsync(Context context) {
        if (!enabled()) return;
        final Context app = context.getApplicationContext();
        new Thread(() -> flush(app), "mw-crash-flush").start();
    }

    static synchronized void flush(Context app) {
        SharedPreferences p = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        List<String> q = split(p.getString(Q, ""));
        List<Long> sent = new ArrayList<>();
        for (String s : split(p.getString(SENT, "").replace(',', SEP))) { try { sent.add(Long.parseLong(s)); } catch (NumberFormatException ignored) { } }
        long now = System.currentTimeMillis();
        sent = CrashReportLogic.recent(sent, now);
        while (!q.isEmpty() && CrashReportLogic.allowance(sent, now, BuildConfig.NTFY_MAX_PER_HOUR) > 0) {
            if (!post(q.get(0))) break; // offline → try again next launch
            q.remove(0);
            sent.add(now);
        }
        StringBuilder sb = new StringBuilder();
        for (Long t : sent) { if (sb.length() > 0) sb.append(','); sb.append(t); }
        p.edit().putString(Q, join(q)).putString(SENT, sb.toString()).apply();
    }

    private static boolean post(String json) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(BuildConfig.NTFY_SERVER + "/").openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            try (OutputStream os = c.getOutputStream()) { os.write(json.getBytes(StandardCharsets.UTF_8)); }
            int code = c.getResponseCode();
            return code < 500;
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static List<String> split(String s) {
        List<String> out = new ArrayList<>();
        if (s == null || s.isEmpty()) return out;
        for (String part : s.split(String.valueOf(SEP))) if (!part.isEmpty()) out.add(part);
        return out;
    }

    private static String join(List<String> l) {
        StringBuilder sb = new StringBuilder();
        for (String s : l) { if (sb.length() > 0) sb.append(SEP); sb.append(s); }
        return sb.toString();
    }
}
