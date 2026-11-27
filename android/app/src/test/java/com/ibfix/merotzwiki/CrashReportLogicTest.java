package com.ibfix.merotzwiki;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import org.junit.Test;

public class CrashReportLogicTest {
    @Test
    public void scrubRemovesRoomCodesAndEmails() {
        assertEquals("room-#### x?room=#### [email]", CrashReportLogic.scrub("room-1234 x?room=5678 a@b.co"));
        assertEquals("", CrashReportLogic.scrub(null));
    }

    @Test
    public void messageIsValidJsonWithAppVersionPlatformAndScreen() {
        String m = CrashReportLogic.buildMessage("topic-abc", "1.0.1", "native:main", new IllegalStateException("bad \"quote\"\nroom-4321"));
        assertTrue(m.startsWith("{\"topic\":\"topic-abc\""));
        assertTrue(m.contains("מרוץ ויקי 1.0.1 · android"));
        assertTrue(m.contains("מסך: native:main"));
        assertTrue(m.contains("bad \\\"quote\\\"\\nroom-####"));
        assertTrue(m.contains("java.lang.IllegalStateException"));
        assertFalse(m.contains("4321"));
    }

    @Test
    public void atMostFivePerHour() {
        long now = 10 * CrashReportLogic.HOUR_MS;
        List<Long> sent = new ArrayList<>(Arrays.asList(now - 10, now - 20, now - 30, now - 40));
        assertEquals(1, CrashReportLogic.allowance(sent, now, 5));
        sent.add(now - 50);
        assertEquals(0, CrashReportLogic.allowance(sent, now, 5));
        assertEquals(5, CrashReportLogic.allowance(sent, now + CrashReportLogic.HOUR_MS, 5));
    }

    @Test
    public void queueKeepsNewest() {
        List<Integer> q = new ArrayList<>(Arrays.asList(1, 2, 3, 4, 5));
        assertEquals(Arrays.asList(4, 5), CrashReportLogic.trimQueue(q, 2));
    }
}
