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
import android.util.Base64;
import android.webkit.JavascriptInterface;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

/**
 * Lets the result card's "Save image" and "Share" work inside the app (#168).
 *
 * Android's WebView ignores {@code <a download>} on a blob URL and has no
 * {@code navigator.share}, so in the app neither button could get the PNG out.
 * The page calls this bridge as {@code window.ChoganAndroid} instead. It needs
 * no permission: saving goes through MediaStore (Android 10+), and sharing hands
 * a cache file to the share sheet through a FileProvider limited to that folder.
 * The WebView only ever loads the app's own assets (no INTERNET permission), so
 * no outside page can reach this interface.
 */
public class ImageBridge {

    // A result card is well under 1 MB; anything bigger is not ours
    private static final int MAX_PNG_BYTES = 10 * 1024 * 1024;
    private static final byte[] PNG_MAGIC = {(byte) 0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'};

    private final Activity activity;

    public ImageBridge(Activity activity) {
        this.activity = activity;
    }

    /** True when saving to the gallery is possible; below Android 10 it needs a storage permission we don't take. */
    @JavascriptInterface
    public boolean canSave() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q;
    }

    @JavascriptInterface
    public boolean saveImage(String base64Png) {
        if (!canSave()) return false;
        byte[] png = decode(base64Png);
        if (png == null) return false;
        ContentResolver resolver = activity.getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, "chogan-" + System.currentTimeMillis() + ".png");
        values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Chogan");
        values.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri uri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
        if (uri == null) return false;
        try (OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new IOException("no output stream");
            out.write(png);
        } catch (IOException e) {
            resolver.delete(uri, null, null);
            return false;
        }
        values.clear();
        values.put(MediaStore.Images.Media.IS_PENDING, 0);
        resolver.update(uri, values, null, null);
        return true;
    }

    @JavascriptInterface
    public boolean shareImage(String base64Png, String text) {
        byte[] png = decode(base64Png);
        if (png == null) return false;
        File dir = new File(activity.getCacheDir(), "share");
        if (!dir.isDirectory() && !dir.mkdirs()) return false;
        File file = new File(dir, "chogan.png");
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(png);
        } catch (IOException e) {
            return false;
        }
        Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".share", file);
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("image/png");
        send.putExtra(Intent.EXTRA_STREAM, uri);
        if (text != null && !text.isEmpty()) send.putExtra(Intent.EXTRA_TEXT, text);
        // ClipData carries the read grant to the chosen app on every Android version
        send.setClipData(ClipData.newRawUri("", uri));
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, null);
        activity.runOnUiThread(() -> activity.startActivity(chooser));
        return true;
    }

    private static byte[] decode(String base64Png) {
        if (base64Png == null || base64Png.length() > MAX_PNG_BYTES * 4 / 3 + 4) return null;
        byte[] png;
        try {
            png = Base64.decode(base64Png, Base64.DEFAULT);
        } catch (IllegalArgumentException e) {
            return null;
        }
        if (png.length < PNG_MAGIC.length) return null;
        for (int i = 0; i < PNG_MAGIC.length; i++) {
            if (png[i] != PNG_MAGIC[i]) return null;
        }
        return png;
    }
}
