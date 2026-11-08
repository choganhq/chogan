package io.github.choganhq.chogan;

import android.content.Intent;
import android.content.res.Configuration;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebView;

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
        }

        openShortcut(getIntent());

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    // آخرین صفحه: کالبک را خاموش می‌کنیم تا رفتار پیش‌فرض اجرا شود
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // the app was already open: a launcher shortcut arrives here (singleTask)
        openShortcut(intent);
    }

    /**
     * A launcher shortcut (res/xml/shortcuts.xml) opens chogan://game/<id> (#488): load
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
