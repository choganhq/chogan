package io.github.choganhq.chogan;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.webkit.JavascriptInterface;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Tells the page which app build it runs in (#1023).
 *
 * The page's own {@code APP_VERSION} is the version of the bundled games, which is
 * the app's version in Chogan but not in Chogan Plus, and the web's update check
 * (a service worker) does not exist in the Android WebView, so a player could not
 * tell which build they had or where to look for a newer one. Reading the package's
 * own name, version and installer needs no permission, and the WebView only loads
 * the app's own assets, so no outside page can reach this.
 */
public class AppInfoBridge {

    private final Context context;

    public AppInfoBridge(Context context) {
        this.context = context.getApplicationContext();
    }

    /** {@code {"version":"0.37.0","pkg":"io.github...","installer":"com.android.vending"}}, or "" if unreadable. */
    @JavascriptInterface
    @SuppressWarnings("deprecation")
    public String info() {
        try {
            PackageManager pm = context.getPackageManager();
            String pkg = context.getPackageName();
            PackageInfo pi = pm.getPackageInfo(pkg, 0);
            String installer = pm.getInstallerPackageName(pkg);
            JSONObject o = new JSONObject();
            o.put("version", pi.versionName == null ? "" : pi.versionName);
            o.put("pkg", pkg);
            o.put("installer", installer == null ? "" : installer);
            return o.toString();
        } catch (PackageManager.NameNotFoundException | JSONException e) {
            return "";
        }
    }
}
