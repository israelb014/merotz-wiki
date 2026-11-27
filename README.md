# מרוץ ויקי

מרוץ בין ערכים בוויקיפדיה העברית: מגיעים מערך התחלה לערך יעד **רק דרך קישורים פנימיים**.
לבד, נגד השעון, במסלול שלבים, באתגר היומי – או עם עד 5 חברים בזמן אמת.

- **שחקו בדפדפן:** https://israelb014.github.io/merotz-wiki/
- **הורדה (Windows · Linux · Android):** https://israelb014.github.io/merotz-wiki/download/

## מצבי משחק
| עם זמן | בלי זמן |
|---|---|
| **מרוץ** – הראשון שמגיע מנצח (עד 10 דקות) | **הכי מעט קליקים** |
| **נגד השעון** – 2/3/5 דקות, הכי מעט קליקים | **6 צעדים** – מקסימום 6 קליקים |
| | **אסור לעבור דרך** – ערך מרכזי אחד חסום |

## מבנה
| תיקייה | תוכן |
|---|---|
| `src/` | האפליקציה (Vite + JavaScript, בלי פריימוורק) |
| `public/data/` | `pools.json` (מאגרי ערכים), `campaign.json` (60 שלבים), `daily.json` (אתגר יומי), `changelog.json` |
| `scripts/` | בניית מאגרים, מסלול קצר ביותר (BFS דו־כיווני), יצירת קמפיין ואתגר יומי, רינדור אייקונים |
| `android/` | מעטפת Capacitor (`com.ibfix.merotzwiki`) שטוענת את האתר החי |
| `desktop/` | מעטפת Electron (Windows NSIS, Linux deb + AppImage) עם עדכון אוטומטי |
| `tests/` | בדיקות Playwright (מול mock של ויקיפדיה ושל Supabase Realtime), בדיקות יחידה, משתמש קוף |
| `qa/` | מפת האפליקציה ודוח QA |
| `config/crash-reporting.json` | הגדרות ניטור הקריסות (ntfy.sh) – קובץ אחד לווב, Android ו־Electron |
| `design/` | קבצי העיצוב המחייבים |

## פיתוח
```bash
npm ci
npm run dev          # http://localhost:5173/merotz-wiki/
npm test             # יחידה + Playwright (390x844 ו־1440x900), בלי רשת אמיתית
npm run test:monkey  # משתמש קוף: 5 ריצות × 2000 פעולות
npm run test:live    # הבדיקה היחידה מול ויקיפדיה האמיתית
npm run build
node scripts/build-pools.mjs      # מאגרי ערכים
node scripts/gen-campaign.mjs     # 60 שלבים
node scripts/gen-daily.mjs        # 14 ימים קדימה
node scripts/shortest-path.mjs "חומוס" "הירח"
```

## שחרור גרסה
`git tag vX.Y.Z && git push --tags` → GitHub Actions בונה APK חתום, ‎.exe, ‎.deb ו־AppImage ומצרף ל־Release.
המשחק עצמו מתעדכן מיד בכל push ל־main (גם באפליקציות, כי הן טוענות את האתר החי).

## רישיון ותוכן
התוכן מוצג מוויקיפדיה העברית ברישיון [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.he).
הפרויקט אינו קשור לקרן ויקימדיה.
