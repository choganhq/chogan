package io.github.choganhq.chogan;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.net.Uri;
import android.os.Build;
import android.util.Base64;
import android.webkit.JavascriptInterface;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Lets the menu set the launcher icon's long-press shortcuts (#1150).
 *
 * They were four fixed games, so a player who pinned others still got these four,
 * and took them for random ones. The page knows the pins, the names in the app's
 * language and each game's icon, so it sends all three; no list or drawable has to
 * be kept here. Needs no permission. Shortcuts exist from API 25.
 */
public class ShortcutsBridge {

    private final Context context;

    public ShortcutsBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    /** {@code [{"id":"sudoku","label":"Sudoku","icon":"<base64 PNG>"}]}, in order; replaces the list. */
    @JavascriptInterface
    public void set(String json) {
        if (Build.VERSION.SDK_INT < 25 || json == null) return;
        try {
            ShortcutManager manager = context.getSystemService(ShortcutManager.class);
            if (manager == null) return;
            JSONArray list = new JSONArray(json);
            List<ShortcutInfo> shortcuts = new ArrayList<>();
            for (int i = 0; i < list.length() && shortcuts.size() < 4; i++) {
                JSONObject o = list.getJSONObject(i);
                String id = o.getString("id");
                String label = o.getString("label");
                if (!id.matches("[a-z0-9-]{1,32}") || label.isEmpty()) continue;
                byte[] png = Base64.decode(o.getString("icon"), Base64.DEFAULT);
                Bitmap icon = BitmapFactory.decodeByteArray(png, 0, png.length);
                if (icon == null) continue;
                Intent open = new Intent(Intent.ACTION_VIEW, Uri.parse("chogan://game/" + id), context, MainActivity.class);
                // "game-": the removed static shortcuts used the bare id, which Android never lets be reused
                shortcuts.add(new ShortcutInfo.Builder(context, "game-" + id)
                        .setShortLabel(label)
                        .setIcon(Icon.createWithBitmap(icon))
                        .setRank(shortcuts.size())
                        .setIntent(open)
                        .build());
            }
            if (!shortcuts.isEmpty()) manager.setDynamicShortcuts(shortcuts);
        } catch (JSONException | IllegalArgumentException | IllegalStateException e) {
            // a launcher that refuses them keeps the previous list; the game is not affected
        }
    }
}
