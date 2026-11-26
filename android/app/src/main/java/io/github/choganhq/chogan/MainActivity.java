package io.github.choganhq.chogan;

import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.graphics.Outline;
import android.os.Bundle;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.webkit.WebView;

import androidx.activity.BackEventCompat;
import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

/**
 * تنها فایل جاوای اپ.
 *
 * دلیل وجودش فقط دکمه‌ی بازگشت سخت‌افزاری است: هسته‌ی کپسیتور هیچ مدیریتی
 * برای این دکمه ندارد، پس رفتار پیش‌فرض اندروید اکتیویتی را می‌بندد حتی وقتی
 * وب‌ویو تاریخچه دارد. نتیجه‌اش این می‌شد که بازگشت وسط یک بازی، کل اپ را ببندد.
 *
 * با این کالبک: داخل بازی برگشت یعنی رفتن به منو، داخل منو یعنی خروج از اپ.
 * چون منو با location.href به بازی می‌رود، همیشه یک ورودی تاریخچه وجود دارد.
 */
public class MainActivity extends BridgeActivity {

    private BarsBridge bars;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Result images: the WebView can neither download nor share them by itself (#168)
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().addJavascriptInterface(new ImageBridge(this), "ChoganAndroid");
            // System bars in the page's theme, not the device's (#402)
            bars = new BarsBridge(this);
            getBridge().getWebView().addJavascriptInterface(bars, "ChoganBars");
            // Draw under the status bar, navigation bar and camera; the page pads itself (#1205)
            bars.install(getBridge().getWebView());
            // Which build this is and where its store page is (#1023)
            getBridge().getWebView().addJavascriptInterface(new AppInfoBridge(this), "ChoganApp");
            // The icon's long-press shortcuts follow the pinned games (#1150)
            getBridge().getWebView().addJavascriptInterface(new ShortcutsBridge(this), "ChoganShortcuts");
            // The progress file of "Export progress" (#1211)
            getBridge().getWebView().addJavascriptInterface(new FileBridge(this), "ChoganFiles");
        }

        openShortcut(getIntent());

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            // the page answers later: a second press meanwhile would find the tips already
            // closed and leave the game
            private boolean asking;

            // Predictive back (#1208): the page follows the finger, as in the installed web app.
            // The system animates only between activities, and every game is a page of this one.
            @Override
            public void handleOnBackProgressed(BackEventCompat event) {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null) follow(webView, event.getProgress(), event.getSwipeEdge() == BackEventCompat.EDGE_LEFT);
            }

            @Override
            public void handleOnBackCancelled() {
                settle();
            }

            @Override
            public void handleOnBackPressed() {
                settle();
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView == null) {
                    leave();
                    return;
                }
                // An open dialog or the game's tips take the press instead of the page (#1158)
                if (asking) return;
                asking = true;
                webView.evaluateJavascript("!!(window.Chogan && Chogan.dismissTop && Chogan.dismissTop())", closed -> {
                    asking = false;
                    if ("true".equals(closed)) return;
                    if (webView.canGoBack()) webView.goBack();
                    else leave();
                });
            }

            private void leave() {
                // آخرین صفحه: کالبک را خاموش می‌کنیم تا رفتار پیش‌فرض اجرا شود
                setEnabled(false);
                getOnBackPressedDispatcher().onBackPressed();
                // a press that did not close the app must find the callback again
                setEnabled(true);
            }
        });
    }

    private void follow(WebView view, float progress, boolean fromLeft) {
        float density = getResources().getDisplayMetrics().density;
        view.animate().cancel();
        // rounded and raised while it moves: its colour is the window's, so the edge would not show
        if (!view.getClipToOutline()) {
            view.setOutlineProvider(new ViewOutlineProvider() {
                @Override
                public void getOutline(View v, Outline outline) {
                    outline.setRoundRect(0, 0, v.getWidth(), v.getHeight(), 24 * density);
                }
            });
            view.setClipToOutline(true);
            view.setElevation(8 * density);
        }
        view.setScaleX(1 - 0.1f * progress);
        view.setScaleY(1 - 0.1f * progress);
        view.setTranslationX((fromLeft ? 1 : -1) * 48 * density * progress);
    }

    /** Puts the page back, after a cancelled gesture and after a completed one alike. */
    private void settle() {
        WebView view = getBridge() != null ? getBridge().getWebView() : null;
        if (view == null || !view.getClipToOutline()) return;
        view.animate().scaleX(1).scaleY(1).translationX(0).setDuration(150).withEndAction(() -> {
            view.setClipToOutline(false);
            view.setOutlineProvider(ViewOutlineProvider.BACKGROUND);
            view.setElevation(0);
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // the app was already open: a launcher shortcut arrives here (singleTask)
        openShortcut(intent);
    }

    /**
     * A launcher shortcut (ShortcutsBridge) opens chogan://game/<id> (#488): load
     * that game's page over the menu, so back still returns to the menu. The activity is
     * exported, so any app could send any data here: only a plain game id is accepted, and
     * only a page inside the app's own assets is ever loaded.
     */
    private void openShortcut(Intent intent) {
        Uri data = intent != null ? intent.getData() : null;
        if (data == null || !"chogan".equals(data.getScheme()) || !"game".equals(data.getHost())) return;
        String id = data.getLastPathSegment();
        if (id == null || !id.matches("[a-z0-9-]{1,32}")) return;
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        String url = getBridge().getLocalUrl() + "/games/" + id + "/index.html?from=shortcut";
        webView.post(() -> webView.loadUrl(url));
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // SystemBars repaints the bars from the device's night mode here; the page's theme wins
        if (bars != null) bars.reapply();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        // Coming back from another app, a dialog or the keyboard can leave the bars shown (#715)
        if (hasFocus && bars != null) bars.reapply();
    }
}
