package xyz.maki3991.interactivestudy;

import android.app.AlertDialog;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.ViewGroup;
import android.view.ViewParent;
import android.webkit.HttpAuthHandler;
import android.webkit.WebView;
import android.widget.EditText;
import android.widget.LinearLayout;

import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {

    private SwipeRefreshLayout refreshLayout;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        configureImmersiveMode();
        configureBackBehavior();
        configurePullToRefresh();
    }

    private void configureImmersiveMode() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        hideSystemBars();
    }

    private void hideSystemBars() {
        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());

        if (controller != null) {
            controller.hide(WindowInsetsCompat.Type.systemBars());
            controller.setSystemBarsBehavior(
                WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            );
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);

        if (hasFocus) {
            hideSystemBars();
        }
    }

    private void configureBackBehavior() {
        getOnBackPressedDispatcher().addCallback(
            this,
            new OnBackPressedCallback(true) {
                @Override
                public void handleOnBackPressed() {
                    WebView webView = getWebView();

                    if (webView != null && webView.canGoBack()) {
                        webView.goBack();
                    } else {
                        finish();
                    }
                }
            }
        );
    }

    private void configurePullToRefresh() {
        WebView webView = getWebView();

        if (webView == null) {
            return;
        }

        ViewParent parent = webView.getParent();

        if (!(parent instanceof ViewGroup) || parent instanceof SwipeRefreshLayout) {
            return;
        }

        ViewGroup container = (ViewGroup) parent;
        int childIndex = container.indexOfChild(webView);
        ViewGroup.LayoutParams originalLayoutParams = webView.getLayoutParams();

        container.removeView(webView);

        refreshLayout = new SwipeRefreshLayout(this);
        refreshLayout.setLayoutParams(originalLayoutParams);
        refreshLayout.setColorSchemeColors(Color.DKGRAY);
        refreshLayout.setOnChildScrollUpCallback(
            (parentLayout, child) -> webView.canScrollVertically(-1)
        );
        refreshLayout.setOnRefreshListener(() -> webView.reload());
        refreshLayout.addView(
            webView,
            new SwipeRefreshLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        container.addView(refreshLayout, childIndex);

        webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void onReceivedHttpAuthRequest(
                WebView view,
                HttpAuthHandler handler,
                String host,
                String realm
            ) {
                showHttpAuthDialog(handler, host, realm);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                stopRefreshing();
            }

            @Override
            public void onReceivedError(
                WebView view,
                android.webkit.WebResourceRequest request,
                android.webkit.WebResourceError error
            ) {
                super.onReceivedError(view, request, error);
                stopRefreshing();
            }

            @Override
            public void onReceivedHttpError(
                WebView view,
                android.webkit.WebResourceRequest request,
                android.webkit.WebResourceResponse errorResponse
            ) {
                super.onReceivedHttpError(view, request, errorResponse);
                stopRefreshing();
            }
        });
    }

    private void showHttpAuthDialog(HttpAuthHandler handler, String host, String realm) {
        LinearLayout form = new LinearLayout(this);
        form.setOrientation(LinearLayout.VERTICAL);
        int horizontalPadding = (int) (24 * getResources().getDisplayMetrics().density);
        form.setPadding(horizontalPadding, 0, horizontalPadding, 0);

        EditText username = new EditText(this);
        username.setSingleLine(true);
        username.setHint("用户名");
        username.setText("studyboox");

        EditText password = new EditText(this);
        password.setSingleLine(true);
        password.setHint("密码");
        password.setInputType(
            InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD
        );

        form.addView(
            username,
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        );
        form.addView(
            password,
            new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        );

        String message = realm == null || realm.isEmpty()
            ? host
            : host + "\n" + realm;

        AlertDialog dialog = new AlertDialog.Builder(this)
            .setTitle("网站需要认证")
            .setMessage(message)
            .setView(form)
            .setNegativeButton("取消", (ignored, which) -> handler.cancel())
            .setPositiveButton("认证", null)
            .create();

        dialog.setOnShowListener(ignored -> {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
                String user = username.getText().toString().trim();
                String pass = password.getText().toString();

                if (user.isEmpty() || pass.isEmpty()) {
                    password.setError("请输入用户名和密码");
                    return;
                }

                handler.proceed(user, pass);
                dialog.dismiss();
            });
            password.requestFocus();
        });
        dialog.setOnCancelListener(ignored -> handler.cancel());
        dialog.show();
    }

    private WebView getWebView() {
        return getBridge() == null ? null : getBridge().getWebView();
    }

    private void stopRefreshing() {
        if (refreshLayout != null) {
            refreshLayout.setRefreshing(false);
        }
    }
}
