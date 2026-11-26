package io.github.choganhq.chogan;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import java.util.Locale;

/**
 * Paints the system bars in the theme the page shows (#402).
 *
 * Capacitor's bundled SystemBars picks the bar icons from the device's night
 * mode and sets the window background to the theme's, so with the app in dark
 * and the device (or the window background) light, the navigation bar stayed
 * cream under a dark page. The app's own light/dark/auto setting lives in the
 * page, so the page reports it here as {@code window.ChoganBars.setDark(...)}.
 * Like ImageBridge it needs no permission, and the WebView only loads the app's
 * own assets, so no outside page can reach it.
 */
public class BarsBridge {

    // The page backgrounds (--c-bg in www/lib/chogan.css), light and dark
    static final int BG_LIGHT = 0xFFFBF6EF;
    static final int BG_DARK = 0xFF15120E;

    private final Activity activity;
    private Boolean dark = null;
    // Fullscreen in the app (#715): the WebView has no Fullscreen API, so the page asks for
    // immersive mode here. It belongs to the activity, so it lasts from page to page.
    private volatile boolean immersive = false;
    // The bars and cutout in CSS pixels, "top right bottom left" (#1205)
    private volatile String insets = "0 0 0 0";

    public BarsBridge(Activity activity) {
        this.activity = activity;
    }

    /**
     * Edge to edge on every Android version and every WebView (#1205).
     *
     * Before, Android 14 and older laid the window out below the status bar, and Capacitor's
     * SystemBars (core 8.6.0) padded the whole decor view by the bars and the cutout unless
     * the WebView was 140 or newer (WEBVIEW_VERSION_WITH_SAFE_AREA_FIX: older WebViews report
     * env(safe-area-inset-*) as 0). So in fullscreen on a Nokia X20 the page stopped at the
     * camera strip and only the decor's colour showed there (#1129). Now the window always
     * draws under the bars and the cutout, nothing pads the WebView except for the keyboard,
     * and the page learns the insets as --ch-inset-* (insets() at load, pushed on a change),
     * which chogan.css folds into --safe-*. SystemBars' own handling is off in
     * capacitor.config.json ("insetsHandling": "disable"), so it cannot pad behind our back.
     */
    void install(WebView webView) {
        Window window = activity.getWindow();
        WindowCompat.setDecorFitsSystemWindows(window, false);
        // Under the camera in both orientations, with the bars shown or hidden; the page keeps
        // its controls clear of it through the insets below
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.getAttributes().layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            window.setAttributes(window.getAttributes());
        }
        View decor = window.getDecorView();
        ViewCompat.setOnApplyWindowInsetsListener(decor, (v, all) -> {
            // read on every pass: a display-size change keeps the activity alive (configChanges)
            float density = activity.getResources().getDisplayMetrics().density;
            int types = WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout();
            Insets bars = all.getInsets(types);
            boolean keyboard = all.isVisible(WindowInsetsCompat.Type.ime());
            // The window no longer shrinks for the keyboard once it draws behind the bars
            v.setPadding(0, 0, 0, keyboard ? all.getInsets(WindowInsetsCompat.Type.ime()).bottom : 0);
            String now = String.format(Locale.US, "%d %d %d %d",
                (int) Math.ceil(bars.top / density), (int) Math.ceil(bars.right / density),
                keyboard ? 0 : (int) Math.ceil(bars.bottom / density), (int) Math.ceil(bars.left / density));
            if (!now.equals(insets)) {
                insets = now;
                String[] p = now.split(" ");
                webView.evaluateJavascript(String.format(Locale.US,
                    "(function(s){var r=document.documentElement;r.classList.add('ch-edge');" +
                    "s.setProperty('--ch-inset-t','%spx');s.setProperty('--ch-inset-r','%spx');" +
                    "s.setProperty('--ch-inset-b','%spx');s.setProperty('--ch-inset-l','%spx');})(document.documentElement.style)",
                    p[0], p[1], p[2], p[3]), null);
            }
            // The page pads itself, so the WebView must not see the insets as well: zero them
            // rather than consume them, as Capacitor does, since CONSUMED stops later updates
            // reaching the WebView (https://issues.chromium.org/issues/461332423)
            return new WindowInsetsCompat.Builder(all).setInsets(types, Insets.of(0, 0, 0, 0)).build();
        });
        ViewCompat.requestApplyInsets(decor);
    }

    // Read by www/lib/early.js before the first paint of every page
    @JavascriptInterface
    public String insets() {
        return insets;
    }

    @JavascriptInterface
    public void setDark(boolean isDark) {
        dark = isDark;
        activity.runOnUiThread(this::apply);
    }

    @JavascriptInterface
    public void setImmersive(boolean on) {
        immersive = on;
        activity.runOnUiThread(this::applyImmersive);
    }

    // Keeps the screen on while a game is open (#1137). The flag needs no permission and
    // belongs to the window, so the menu page clears it again.
    @JavascriptInterface
    public void setKeepAwake(boolean on) {
        activity.runOnUiThread(() -> {
            Window w = activity.getWindow();
            if (on) w.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else w.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }

    @JavascriptInterface
    public boolean isImmersive() {
        return immersive;
    }

    /**
     * Applies the last theme and fullscreen again: SystemBars resets the bars on a
     * configuration change, and a dialog or the keyboard can bring them back.
     */
    void reapply() {
        if (dark != null) apply();
        if (immersive) applyImmersive();
    }

    private void applyImmersive() {
        Window window = activity.getWindow();
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
        // The cutout mode is set once in install(): the page draws under the camera in both modes
        if (immersive) {
            // A swipe from the edge shows the bars for a moment; they hide again by themselves
            bars.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            bars.hide(WindowInsetsCompat.Type.systemBars());
        } else {
            bars.show(WindowInsetsCompat.Type.systemBars());
        }
    }

    @SuppressWarnings("deprecation")
    private void apply() {
        boolean d = Boolean.TRUE.equals(dark);
        int bg = d ? BG_DARK : BG_LIGHT;
        Window window = activity.getWindow();
        // Shows only below the keyboard's padding and before the page's first paint
        window.getDecorView().setBackgroundColor(bg);
        // The page is drawn under the bars (#1205) and lays its own scrim there (chogan.css,
        // html.ch-edge), so Android 14 and older must not paint over it; 15 and newer ignore these.
        window.setStatusBarColor(Color.TRANSPARENT);
        // Before Android 8 the navigation buttons are always white: keep the old opaque bar there
        window.setNavigationBarColor(Build.VERSION.SDK_INT >= Build.VERSION_CODES.O ? Color.TRANSPARENT : bg);
        // No system scrim on top of the page's own (Android 10+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setNavigationBarContrastEnforced(false);
            window.setStatusBarContrastEnforced(false);
        }
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(window, window.getDecorView());
        bars.setAppearanceLightStatusBars(!d);
        bars.setAppearanceLightNavigationBars(!d);
    }
}
