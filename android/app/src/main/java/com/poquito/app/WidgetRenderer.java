package com.poquito.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.List;

/** Dibuja los widgets de la pantalla de inicio. */
final class WidgetRenderer {
    static final String ACTION_DONE = "com.poquito.app.WIDGET_DONE";
    private static final String EXTRA_TASK = "taskId";
    private static final int FLAGS = PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT;

    private static final int[] ROWS = {
            R.id.sticker_row0, R.id.sticker_row1, R.id.sticker_row2, R.id.sticker_row3
    };
    private static final int[] STATES = {
            R.id.sticker_state0, R.id.sticker_state1, R.id.sticker_state2, R.id.sticker_state3
    };
    private static final int[] TEXTS = {
            R.id.sticker_text0, R.id.sticker_text1, R.id.sticker_text2, R.id.sticker_text3
    };

    private WidgetRenderer() {}

    static void refreshAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] chips = mgr.getAppWidgetIds(new ComponentName(ctx, ChipWidgetProvider.class));
        for (int id : chips) updateChip(ctx, mgr, id);
        int[] stickers = mgr.getAppWidgetIds(new ComponentName(ctx, StickerWidgetProvider.class));
        for (int id : stickers) updateSticker(ctx, mgr, id);
    }

    static void handle(Context ctx, Intent intent) {
        if (intent != null && ACTION_DONE.equals(intent.getAction())) {
            PoquitoStore.setStatus(ctx, intent.getStringExtra(EXTRA_TASK), "done");
            refreshAll(ctx);
        }
    }

    private static int bgFor(String status) {
        if ("doing".equals(status)) return R.drawable.widget_bg_doing;
        if ("done".equals(status)) return R.drawable.widget_bg_done;
        return R.drawable.widget_bg_todo;
    }

    private static int iconFor(String status) {
        if ("doing".equals(status)) return R.drawable.ic_state_doing;
        if ("done".equals(status)) return R.drawable.ic_state_done;
        return R.drawable.ic_state_todo;
    }

    private static PendingIntent openApp(Context ctx) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(ctx, 0, i, FLAGS);
    }

    private static PendingIntent markDone(Context ctx, Class<?> provider, String taskId, int requestCode) {
        Intent i = new Intent(ctx, provider);
        i.setAction(ACTION_DONE);
        i.putExtra(EXTRA_TASK, taskId);
        return PendingIntent.getBroadcast(ctx, requestCode, i, FLAGS);
    }

    /** Chip: la tarea actual, con un círculo para marcarla como hecha. */
    static void updateChip(Context ctx, AppWidgetManager mgr, int widgetId) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_chip);
        JSONObject state = PoquitoStore.load(ctx);
        List<JSONObject> open = PoquitoStore.openTasks(state);

        v.setOnClickPendingIntent(R.id.chip_root, openApp(ctx));

        if (open.isEmpty()) {
            boolean any = PoquitoStore.doneTodayCount(state) > 0;
            v.setInt(R.id.chip_root, "setBackgroundResource", any ? R.drawable.widget_bg_done : R.drawable.widget_bg_todo);
            v.setImageViewResource(R.id.chip_state, any ? R.drawable.ic_state_done : R.drawable.ic_state_plus);
            v.setTextViewText(R.id.chip_text, any ? "Todo listo por hoy" : "Añade una tarea");
            v.setViewVisibility(R.id.chip_more, View.GONE);
            v.setOnClickPendingIntent(R.id.chip_state, openApp(ctx));
        } else {
            JSONObject cur = open.get(0);
            String status = cur.optString("status", "todo");
            v.setInt(R.id.chip_root, "setBackgroundResource", bgFor(status));
            v.setImageViewResource(R.id.chip_state, iconFor(status));
            v.setTextViewText(R.id.chip_text, cur.optString("text", ""));
            int more = open.size() - 1;
            if (more > 0) {
                v.setTextViewText(R.id.chip_more, "+" + more);
                v.setViewVisibility(R.id.chip_more, View.VISIBLE);
            } else {
                v.setViewVisibility(R.id.chip_more, View.GONE);
            }
            v.setOnClickPendingIntent(R.id.chip_state,
                    markDone(ctx, ChipWidgetProvider.class, cur.optString("id"), 1));
        }
        mgr.updateAppWidget(widgetId, v);
    }

    /** Pegatina: hasta 4 pastillas de hoy, cada una con su círculo. */
    static void updateSticker(Context ctx, AppWidgetManager mgr, int widgetId) {
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_sticker);
        JSONObject state = PoquitoStore.load(ctx);
        List<JSONObject> open = PoquitoStore.openTasks(state);
        int doneToday = PoquitoStore.doneTodayCount(state);

        v.setTextViewText(R.id.sticker_title, "Hoy");
        String sub;
        if (open.isEmpty()) {
            sub = doneToday > 0 ? "Todo listo. Puedes descansar." : "Nada por ahora";
        } else {
            sub = doneToday + " de " + (doneToday + open.size()) + " hechas";
        }
        v.setTextViewText(R.id.sticker_sub, sub);

        for (int i = 0; i < ROWS.length; i++) {
            if (i < open.size()) {
                JSONObject t = open.get(i);
                String status = t.optString("status", "todo");
                v.setViewVisibility(ROWS[i], View.VISIBLE);
                v.setInt(ROWS[i], "setBackgroundResource", bgFor(status));
                v.setImageViewResource(STATES[i], iconFor(status));
                v.setTextViewText(TEXTS[i], t.optString("text", ""));
                v.setOnClickPendingIntent(STATES[i],
                        markDone(ctx, StickerWidgetProvider.class, t.optString("id"), 100 + i));
                v.setOnClickPendingIntent(TEXTS[i], openApp(ctx));
            } else {
                v.setViewVisibility(ROWS[i], View.GONE);
            }
        }

        int more = open.size() - ROWS.length;
        if (more > 0) {
            v.setTextViewText(R.id.sticker_more, "+" + more + " más");
            v.setViewVisibility(R.id.sticker_more, View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.sticker_more, View.GONE);
        }

        v.setOnClickPendingIntent(R.id.sticker_root, openApp(ctx));
        v.setOnClickPendingIntent(R.id.sticker_add, openApp(ctx));
        mgr.updateAppWidget(widgetId, v);
    }
}
