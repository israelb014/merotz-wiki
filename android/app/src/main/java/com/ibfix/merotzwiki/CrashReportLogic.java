package com.ibfix.merotzwiki;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Pure-Java part of the Android crash reporter (no Android APIs, unit tested in src/test).
 * Builds the ntfy.sh JSON message, removes personal data and applies the per-hour limit.
 */
public final class CrashReportLogic {
    public static final long HOUR_MS = 3_600_000L;
    private static final Pattern ROOM = Pattern.compile("room-\\d{4}", Pattern.CASE_INSENSITIVE);
    private static final Pattern CODE_PARAM = Pattern.compile("([?&#](?:room|code)=)\\d+", Pattern.CASE_INSENSITIVE);
    private static final Pattern EMAIL = Pattern.compile("[\\w.+-]+@[\\w-]+\\.[\\w.-]+");

    private CrashReportLogic() {}

    /** Remove room codes and e-mail addresses. */
    public static String scrub(String s) {
        if (s == null) return "";
        String out = ROOM.matcher(s).replaceAll("room-####");
        out = CODE_PARAM.matcher(out).replaceAll("$1####");
        return EMAIL.matcher(out).replaceAll("[email]");
    }

    /** First lines of a stack trace, scrubbed and length limited. */
    public static String shortStack(Throwable t) {
        if (t == null) return "";
        StringBuilder sb = new StringBuilder(t.getClass().getName());
        StackTraceElement[] st = t.getStackTrace();
        for (int i = 0; i < Math.min(5, st.length); i++) sb.append("\n at ").append(st[i].toString());
        Throwable c = t.getCause();
        if (c != null) sb.append("\nCaused by: ").append(c.getClass().getName()).append(": ").append(c.getMessage());
        String s = scrub(sb.toString());
        return s.length() > 900 ? s.substring(0, 900) : s;
    }

    public static String jsonEscape(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length() + 16);
        for (char ch : s.toCharArray()) {
            switch (ch) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (ch < 0x20) sb.append(String.format("\\u%04x", (int) ch));
                    else sb.append(ch);
            }
        }
        return sb.toString();
    }

    /** ntfy JSON publish body: {"topic","title","message","tags"} */
    public static String buildMessage(String topic, String version, String screen, Throwable t) {
        String msg = t == null ? "unknown" : scrub(String.valueOf(t.getMessage()));
        if (msg.length() > 300) msg = msg.substring(0, 300);
        String body = msg + "\nמסך: " + (screen == null ? "-" : screen) + "\n" + shortStack(t);
        if (body.length() > 1800) body = body.substring(0, 1800);
        return "{\"topic\":\"" + jsonEscape(topic) + "\",\"title\":\"" + jsonEscape("מרוץ ויקי " + version + " · android") +
                "\",\"message\":\"" + jsonEscape(body) + "\",\"tags\":[\"warning\",\"android\"]}";
    }

    /** Timestamps of reports sent during the last hour. */
    public static List<Long> recent(List<Long> sent, long now) {
        List<Long> out = new ArrayList<>();
        if (sent != null) for (Long t : sent) if (t != null && now - t < HOUR_MS && t <= now) out.add(t);
        return out;
    }

    /** How many more reports may be sent right now. */
    public static int allowance(List<Long> sent, long now, int maxPerHour) {
        return Math.max(0, maxPerHour - recent(sent, now).size());
    }

    /** Keep the newest maxQueue entries. */
    public static <T> List<T> trimQueue(List<T> queue, int maxQueue) {
        if (queue.size() <= maxQueue) return queue;
        return new ArrayList<>(queue.subList(queue.size() - maxQueue, queue.size()));
    }
}
