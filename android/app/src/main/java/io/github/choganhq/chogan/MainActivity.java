package io.github.choganhq.chogan;

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

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

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
}
