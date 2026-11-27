# מפת האפליקציה – מרוץ ויקי 1.0.0

מסמך QA: כל המסכים, הפעולות, המצבים והמקומות ששומרים נתונים. הניתוב הוא hash router (`#/path?query`) ב־`src/lib/router.js`, והמסכים רשומים ב־`src/main.js`.

## שומר ניתוב (guard)
- אין פרופיל ← `/onboarding?next=…` (שומר גם `code` של הזמנה).
- `navigator.onLine === false` ← `/offline?next=…`.
- קישור הזמנה `?room=1234` ← `#/join?code=1234` (מוחק את הפרמטר מה־URL).

## מסכים
| נתיב | קובץ | תוכן ופעולות | מצבים |
|---|---|---|---|
| `/onboarding` | screens/onboarding.js | כינוי (2–16 תווים), 5 צבעים, 12 אווטארים, "יאללה, מתחילים" (גם Enter) | שגיאה: כינוי קצר (toast) |
| `/` | screens/home.js | סטטיסטיקה, צ'יפ פרופיל, הגדרות, כרטיס אתגר יומי (טבעת: זמן שנותר / יעילות), משחק מהיר, חדר עם חברים (sheet: פתיחה / הצטרפות), מסלול שלבים, אתגר יומי, הורדת האפליקציה (ווב בלבד) | אתגר: טעינה (שלד), "בקרוב", "לא זמין כרגע", הושלם |
| `/modes` | screens/modes.js | 5 כרטיסי מצב: מרוץ, נגד השעון (sheet 2/3/5 דק׳), הכי מעט קליקים, 6 צעדים, אסור לעבור דרך. `ctx=room` = עריכת הגדרות חדר | בלי טיוטה ← בית |
| `/setup` | screens/setup.js | 8 קטגוריות, 3 רמות קושי, זוג מותאם (2 שדות עם השלמה אוטומטית מ־opensearch), חוקים (חזרה, חיפוש), "המשך" | טעינה ("בוחר זוג ערכים…"), שגיאות: רק שדה אחד, ערך לא נמצא, זהים, אין רשת |
| `/pregame` | screens/pregame.js | 2 כרטיסי ערך (תקציר+תמונה), ערך אסור, חוק המצב, "יאללה!" ← ספירה 3-2-1; בחדר: ספירה מסונכרנת לשעון המארח; X = יציאה | תקציר נכשל ← ריק |
| `/play` | screens/play.js | HUD: יעד (הצצה), טבעת זמן/צעדים/קליקים, קליקים; רצועת שחקנים (חדר); ערך אסור; פירורי לחם; ערך נקי; תפריט ⋮ (פתיחה בוויקיפדיה, רישיון); חיפוש בערך (Ctrl+F, Enter/Shift+Enter, Esc); חזרה (+1), פרישה (אישור); Alt+← / BrowserBack; כפתור חזור באנדרואיד | טעינה (שלד), שגיאה ("אין חיבור" / "לא הצלחנו לטעון" + נסו שוב), ניצחון/נפסל/נכשל/נגמר הזמן/פרישה ← הבזק ← תוצאות |
| `/results` | screens/results.js | יחיד: גיבור (טבעת/כוכבים), נתונים, מסלול אנכי, המסלול הקצר, ספירה לאתגר הבא, "משחק נוסף"/"לשלב הבא"/"נסו שוב", שיתוף (Web Share או sheet: וואטסאפ/העתקה), תפריט. חדר: המתנה לשחקנים ← פודיום, מסלולים, הקצר ביותר, סיבוב נוסף/שינוי הגדרות (מארח), שיתוף, יציאה | ניצחון, הפסד, המתנה |
| `/room?code=` | screens/lobby.js | חיבור לחדר, קוד גדול, שיתוף וואטסאפ, העתקת קוד, 5 משבצות, כתר למארח, כרטיס הגדרות (מארח לוחץ ← `/modes?ctx=room`), "התחל" (מארח), באנר "סיבוב בעיצומו" | מתחבר, החדר מלא, החדר לא נמצא, שגיאת חיבור, "בוחר זוג…" |
| `/join?code=` | screens/join.js | 4 תיבות ספרה (הדבקה, Backspace, Enter), כינוי, אווטאר, "הצטרף לחדר" | שגיאה: קוד לא 4 ספרות, כינוי קצר |
| `/campaign` | screens/campaign.js | 6 עולמות × 10 שלבים, כוכבים, נעילה (20 כוכבים לעולם), גלילה לשלב הבא | טעינה, שגיאת טעינה, נעול (toast) |
| `/daily` | screens/daily.js | מפנה ל־pregame של האתגר, או לתוצאה אם כבר שוחק היום | "האתגר של היום עוד לא מוכן" |
| `/stats?tab=` | screens/stats.js | 3 לשוניות: נתונים (3 טבעות, 4 אריחים, זמן הכי טוב לכל מצב), היסטוריה (100 אחרונים, sheet פירוט), הישגים (16) | ריק: "עוד לא שיחקתם" |
| `/settings` | screens/settings.js | פרופיל (sheet עריכה), ערכת נושא (בהיר/כהה/מערכת), צלילים, רטט, חוקי ברירת מחדל, ייצוא/ייבוא גיבוי, מה חדש, אודות, הורדה, גרסה | ייבוא: קובץ לא תקין |
| `/offline` | screens/offline.js | "צריך אינטרנט", נסו שוב (בודק siteinfo בוויקיפדיה) | בודק… |
| `download/` | download/index.html + src/download.js | עמוד הורדה: המלצה לפי UA, Windows/Linux/Android/דפדפן, גרסה וגודל מ־GitHub API | |

שכבות־על: `ui.js` – toast, sheet/modal (סגירה ברקע/`data-close`), confirmDialog; "מה חדש" (פעם אחת לכל גרסת תוכן); באנר עדכון (Electron / deb); דיאלוג עדכון APK (אנדרואיד).

## מצבי משחק (`src/lib/modes.js`, `src/lib/game.js`)
| מצב | שעון | סיום | דירוג |
|---|---|---|---|
| race – מרוץ | כן, תקרה 10 דק׳ | הגעה / זמן | זמן ואז קליקים |
| clock – נגד השעון | כן, 2/3/5 דק׳ | הגעה / זמן | קליקים ואז זמן |
| fewest – הכי מעט קליקים | לא | הגעה / פרישה | קליקים |
| six – 6 צעדים | לא (טבעת צעדים) | הגעה / קליק 6 בלי הגעה ← failed | קליקים |
| forbidden – אסור לעבור דרך | לא | הגעה / כניסה לערך האסור ← dq | קליקים |

סטטוסים: playing, finished, gaveup, failed, dq, timeout, left. חזרה עולה קליק. סוגי משחק: solo, mp, campaign, daily.

## זרימת חדר (`src/lib/room.js`, `src/lib/transport.js`, `src/room-coordinator.js`)
1. יצירה: קוד אקראי 4 ספרות ← `/room?code=&create=1` ← חיבור, ואם אין אחרים – הופך למארח (state v1).
2. הצטרפות: hello ← המארח משדר state; אחרי 6 שניות בלי state ובלי אנשים ← "החדר לא נמצא".
3. נוכחות (Presence) לפי סדר קבלה (roster); שחקן שישי ← `full`.
4. מארח: הגדרות (גרסת מצב `v`), התחלה ← בחירת זוג ← round עם `startAt = now+6s` ← כולם ב־pregame עם שעון מתוקן (`clockOffset`).
5. במשחק: הודעות `progress` (קליקים/סטטוס/זמן בלבד, בלי כותרות), רצועת שחקנים.
6. סוף סיבוב: כולם סיימו, או נעדרים > 60 ש׳, או זמן + 2.5 ש׳ ← results; ואז כל אחד שולח `route`.
7. המארח עזב ← השחקן הוותיק הבא הופך למארח (גרסה +1, שעון מבוסס מחדש). התנגשות שני מארחים – לפי גרסה ואז ותק.
8. חזרה תוך 60 ש׳ (רענון/אפליקציה) עם אותו מזהה (localStorage/sessionStorage), אבל לא בשתי לשוניות במקביל (BroadcastChannel `mw-tabs`).
9. תעבורה: Supabase Realtime (Broadcast + Presence) בערוץ `room-{code}`; בבדיקות: relay (WebSocket) או local (BroadcastChannel).

## איפה נשמרים נתונים
| מקום | מפתח | תוכן |
|---|---|---|
| IndexedDB `merotz-wiki` / `kv` | profile, settings, campaign, daily, achievements, seenChangelog | פרופיל, הגדרות, כוכבים, תוצאות יומיות, הישגים |
| IndexedDB / `games` | id | היסטוריה (100 אחרונים) |
| IndexedDB / `articles` | `a4:title`, `s:title` | מטמון ערכים ותקצירים 24 שעות |
| localStorage | mw-solo-settings | הגדרות משחק מהיר |
| localStorage | mw-theme-hint | ערכת נושא לעמוד ההורדה |
| localStorage | mw-seen-cl-first | לא להציג "מה חדש" בהפעלה ראשונה |
| localStorage + sessionStorage | mw-room-session | חזרה לחדר (קוד, מזהה, זמן) |
| localStorage | mw-active-game | צילום מצב משחק חדר (לרענון) |
| sessionStorage | mw-relay, mw-transport, mw-skip-apk-{v} | מצבי בדיקה, דחיית עדכון APK |
| זיכרון | canon, memCache | פענוח כותרות והפניות, מטמון ערכים |
| נוסף ב־1.0.1 | mw-crash-queue, mw-crash-sent (localStorage) | תור ומגבלת דיווחי קריסה |

## רשת
- ויקיפדיה: REST `page/html`, `page/summary`; action API `query` (הפניות, קישורים), `opensearch`, `siteinfo` (מסך אופליין).
- נתונים סטטיים: `data/pools.json`, `campaign.json`, `daily.json`, `changelog.json`, `version.json`.
- Supabase Realtime (WebSocket). GitHub API (עמוד ההורדה). ntfy.sh (דיווחי קריסה, מ־1.0.1).

## מעטפות נייטיב
- **Android** (Capacitor, `android/`): טוען את האתר החי; כפתור חזור, App Links (`?room=`), רטט, דיאלוג עדכון APK לפי `version.json.shell`. הרשאות: INTERNET, VIBRATE בלבד.
- **Windows/Linux** (Electron, `desktop/`): טוען את האתר החי; קישורים חיצוניים לדפדפן, דף אופליין, `electron-updater` (exe/AppImage), באנר הורדה ל־deb, bridge מינימלי (`merotzDesktop`).
