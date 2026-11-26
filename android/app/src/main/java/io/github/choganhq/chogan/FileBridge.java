package io.github.choganhq.chogan;

import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * Gets the progress file of "Export progress" out of the app (#1211).
 *
 * The WebView ignores {@code <a download>} on a blob URL, so the page's web route saves
 * nothing here. The page calls this bridge as {@code window.ChoganFiles} instead, the same
 * way ImageBridge carries result images (#168), and it takes no permission: saving goes
 * to Downloads/Chogan through MediaStore (Android 10+), and sharing hands a cache file to
 * the share sheet through the FileProvider that only exposes cache/share/. Importing needs
 * nothing here: a plain file input opens the system picker through Capacitor's
 * BridgeWebChromeClient.onShowFileChooser.
 */
public class FileBridge {

    // Chogan.backup refuses anything bigger on import, so a bigger export is not ours either
    private static final int MAX_CHARS = 16 * 1024 * 1024;
    private static final String NAME_RE = "chogan-progress-\\d{4}-\\d{2}-\\d{2}\\.json";
    private static final String MIME = "application/json";

    private final Activity activity;

    public FileBridge(Activity activity) {
        this.activity = activity;
    }

    /** True when saving to Downloads is possible; below Android 10 it needs a storage permission we don't take. */
    @JavascriptInterface
    public boolean canSave() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
    }

    @JavascriptInterface
    public boolean saveFile(String name, String text) {
        if (!canSave()) return false;
        byte[] data = check(name, text);
        if (data == null) return false;
        ContentResolver resolver = activity.getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
        values.put(MediaStore.MediaColumns.MIME_TYPE, MIME);
        values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Chogan");
        values.put(MediaStore.MediaColumns.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) return false;
        try (OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new IOException("no output stream");
            out.write(data);
        } catch (IOException e) {
            resolver.delete(uri, null, null);
            return false;
        }
        values.clear();
        values.put(MediaStore.MediaColumns.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        return true;
    }

    @JavascriptInterface
    public boolean shareFile(String name, String text) {
        byte[] data = check(name, text);
        if (data == null) return false;
        File dir = new File(activity.getCacheDir(), "share");
        if (!dir.isDirectory() && !dir.mkdirs()) return false;
        File file = new File(dir, name);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(data);
        } catch (IOException e) {
            return false;
        }
        Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".share", file);
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(MIME);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        // ClipData carries the read grant to the chosen app on every Android version
        send.setClipData(ClipData.newRawUri("", uri));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, null);
        activity.runOnUiThread(() -> activity.startActivity(chooser));
        return true;
    }

    /** Only a progress file under our own name: the name ends up in a path and in Downloads. */
    private static byte[] check(String name, String text) {
        if (name == null || !name.matches(NAME_RE)) return null;
        if (text == null || text.length() > MAX_CHARS || !text.startsWith("{\"app\":\"chogan\"")) return null;
        return text.getBytes(StandardCharsets.UTF_8);
    }
}
