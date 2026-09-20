package com.poquito.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/**
 * Lee y escribe el mismo estado que guarda la interfaz web
 * (plugin Preferences de Capacitor: grupo "CapacitorStorage").
 */
final class PoquitoStore {
    private static final String PREFS = "CapacitorStorage";
    private static final String KEY = "poquito-state-v1";

    private PoquitoStore() {}

    static String todayKey() {
        Calendar c = Calendar.getInstance();
        return String.format(Locale.US, "%04d-%02d-%02d",
                c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH));
    }

    static JSONObject load(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = p.getString(KEY, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    static void save(Context ctx, JSONObject state) {
        try {
            JSONObject meta = state.optJSONObject("meta");
            if (meta == null) {
                meta = new JSONObject();
                state.put("meta", meta);
            }
            meta.put("updatedAt", System.currentTimeMillis());
        } catch (JSONException e) {
            // sin marca de tiempo: la app igual leerá el dato
        }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().putString(KEY, state.toString()).apply();
    }

    private static double order(JSONObject t) {
        return t.optDouble("order", t.optDouble("createdAt", 0));
    }

    /** Tareas de hoy sin terminar (incluye lo pendiente de días anteriores). Primero en proceso, luego por orden. */
    static List<JSONObject> openTasks(JSONObject state) {
        List<JSONObject> out = new ArrayList<>();
        if (state == null) return out;
        JSONArray tasks = state.optJSONArray("tasks");
        if (tasks == null) return out;
        String today = todayKey();
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t == null) continue;
            if ("done".equals(t.optString("status"))) continue;
            if (t.optString("date", "9999-99-99").compareTo(today) > 0) continue;
            out.add(t);
        }
        Collections.sort(out, new Comparator<JSONObject>() {
            @Override
            public int compare(JSONObject a, JSONObject b) {
                int da = "doing".equals(a.optString("status")) ? 0 : 1;
                int db = "doing".equals(b.optString("status")) ? 0 : 1;
                if (da != db) return da - db;
                return Double.compare(order(a), order(b));
            }
        });
        return out;
    }

    static int doneTodayCount(JSONObject state) {
        if (state == null) return 0;
        JSONArray tasks = state.optJSONArray("tasks");
        if (tasks == null) return 0;
        String today = todayKey();
        int n = 0;
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t != null && "done".equals(t.optString("status")) && today.equals(t.optString("date"))) n++;
        }
        return n;
    }

    static void setStatus(Context ctx, String taskId, String status) {
        if (taskId == null) return;
        JSONObject state = load(ctx);
        if (state == null) return;
        JSONArray tasks = state.optJSONArray("tasks");
        if (tasks == null) return;
        String today = todayKey();
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject t = tasks.optJSONObject(i);
            if (t == null || !taskId.equals(t.optString("id"))) continue;
            try {
                t.put("status", status);
                if ("done".equals(status)) {
                    t.put("doneAt", System.currentTimeMillis());
                    if (t.optString("date", today).compareTo(today) < 0) t.put("date", today);
                } else {
                    t.remove("doneAt");
                }
            } catch (JSONException e) {
                return;
            }
            break;
        }
        save(ctx, state);
    }
}
